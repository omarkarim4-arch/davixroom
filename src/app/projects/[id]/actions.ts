'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { PostgresProjectRepository } from '@/infra/db/postgres-project-repository';
import { createInvitation, findCurrentProfile } from '@/infra/db/onboarding';
import { authorize } from '@/core/auth/authorize';
import { describeError } from '@/core/errors';
import { asId } from '@/core/ids';
import type { Role } from '@/core/auth/capabilities';

export type InviteState = {
  readonly error: string | null;
  /**
   * Shown once, never stored. The raw token exists only in this response and in
   * the link the user copies out of it.
   */
  readonly inviteUrl: string | null;
};

const CLIENT_ROLES: readonly Role[] = ['client_approver', 'client_reviewer', 'observer'];

/**
 * Invites somebody on the client side into this project so they can review.
 *
 * `member.invite` is decided by `authorize()` against the caller's membership
 * and grants. The database function additionally refuses anybody who is not on
 * the project's vendor side, which is coarser on purpose — it is the floor, not
 * the rule.
 */
export const inviteToReview = async (
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> => {
  const projectId = String(formData.get('projectId') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim() as Role;

  if (projectId === '' || email === '') {
    return { error: 'Enter an email address.', inviteUrl: null };
  }

  if (!CLIENT_ROLES.includes(role)) {
    return { error: 'Choose a review role.', inviteUrl: null };
  }

  const result = await withCurrentUser(async (sql, caller) => {
    const profile = await findCurrentProfile(sql);
    if (profile === null) return { kind: 'no-profile' } as const;

    const repository = new PostgresProjectRepository(sql);
    const project = await repository.findById(asId<'ProjectId'>(projectId));
    if (project === null) return { kind: 'not-found' } as const;

    const userId = asId<'UserId'>(profile.userId);
    const decision = authorize({
      user: {
        id: userId,
        organizationId: asId<'OrganizationId'>(profile.organizationId),
        organizationRole: profile.organizationRole,
        displayName: profile.displayName,
        email: caller.email ?? '',
      },
      project,
      membership: await repository.findMembership(project.id, userId),
      grants: await repository.listGrants(project.id, userId),
      capability: 'member.invite',
      now: Date.now(),
    });

    if (!decision.ok) return { kind: 'denied', reason: decision.error } as const;

    return {
      kind: 'attempted',
      outcome: await createInvitation(sql, { projectId, email, role }),
    } as const;
  });

  if (result === null) {
    redirect('/sign-in');
  }

  if (result.kind === 'no-profile') {
    redirect('/onboarding');
  }

  // Row level security already hid a project the caller cannot see, so "not
  // found" and "not yours" are the same answer here by construction.
  if (result.kind === 'not-found') {
    return { error: 'That project is not available.', inviteUrl: null };
  }

  if (result.kind === 'denied') {
    console.warn('member.invite denied:', describeError(result.reason));
    return { error: 'You cannot invite people to this project.', inviteUrl: null };
  }

  if (!result.outcome.ok) {
    return {
      error:
        result.outcome.error.code === 'conflict'
          ? 'That address already has an open invitation to this project.'
          : 'Something went wrong sending the invitation. Try again.',
      inviteUrl: null,
    };
  }

  revalidatePath(`/projects/${projectId}`);

  return {
    error: null,
    inviteUrl: `/invite/${result.outcome.value.token}`,
  };
};
