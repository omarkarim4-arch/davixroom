'use server';

import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { createProject, findCurrentProfile } from '@/infra/db/onboarding';
import { authorizeOrganization } from '@/core/auth/authorize-organization';
import { describeError } from '@/core/errors';
import { asId } from '@/core/ids';

export type NewProjectState = { readonly error: string | null };

/**
 * Creates a project and the client organization it will be reviewed with.
 *
 * `authorizeOrganization` runs first and is the real permission decision;
 * `app.create_project` re-checks the coarse structure of it because a
 * SECURITY DEFINER function cannot assume its caller went through here.
 */
export const startProject = async (
  _previous: NewProjectState,
  formData: FormData,
): Promise<NewProjectState> => {
  const name = String(formData.get('name') ?? '').trim();
  const clientOrganizationName = String(
    formData.get('clientOrganizationName') ?? '',
  ).trim();

  if (name === '' || clientOrganizationName === '') {
    return { error: 'Name the project and the client you are building it for.' };
  }

  const result = await withCurrentUser(async (sql, caller) => {
    const profile = await findCurrentProfile(sql);
    if (profile === null) return { kind: 'no-profile' } as const;

    const decision = authorizeOrganization({
      user: {
        id: asId<'UserId'>(profile.userId),
        organizationId: asId<'OrganizationId'>(profile.organizationId),
        organizationRole: profile.organizationRole,
        displayName: profile.displayName,
        email: caller.email ?? '',
      },
      organization: {
        id: asId<'OrganizationId'>(profile.organizationId),
        kind: profile.organizationKind,
        name: profile.organizationName,
      },
      capability: 'project.create',
    });

    if (!decision.ok) {
      return { kind: 'denied', reason: decision.error } as const;
    }

    return {
      kind: 'attempted',
      outcome: await createProject(sql, { name, clientOrganizationName }),
    } as const;
  });

  if (result === null) {
    redirect('/sign-in');
  }

  if (result.kind === 'no-profile') {
    redirect('/onboarding');
  }

  if (result.kind === 'denied') {
    console.warn('project.create denied:', describeError(result.reason));
    return {
      error:
        result.reason.kind === 'client_organization'
          ? 'Client organizations join projects by invitation; they do not create them.'
          : 'You need to be an owner or admin of your organization to start a project.',
    };
  }

  if (!result.outcome.ok) {
    return { error: 'Something went wrong creating the project. Try again.' };
  }

  redirect(`/projects/${result.outcome.value}`);
};
