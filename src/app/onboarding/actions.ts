'use server';

import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { bootstrapOrganization, findCurrentProfile } from '@/infra/db/onboarding';

export type OnboardingState = { readonly error: string | null };

/**
 * Registers a vendor organization for a signed-in account that has none.
 *
 * There is no capability check here, and there is nothing to check against —
 * the caller belongs to no organization yet, so no role exists to consult.
 * `app.bootstrap_organization` is the guard: it will only ever create a user
 * row for the caller's own verified subject, and only if that subject has none.
 */
export const createOrganization = async (
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> => {
  const organizationName = String(formData.get('organizationName') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();

  if (organizationName === '' || displayName === '') {
    return { error: 'Enter your name and your organization’s name.' };
  }

  const result = await withCurrentUser(async (sql) => {
    if ((await findCurrentProfile(sql)) !== null) {
      return { alreadyOnboarded: true } as const;
    }
    return {
      alreadyOnboarded: false,
      outcome: await bootstrapOrganization(sql, { organizationName, displayName }),
    } as const;
  });

  if (result === null) {
    redirect('/sign-in');
  }

  if (result.alreadyOnboarded) {
    redirect('/dashboard');
  }

  if (!result.outcome.ok) {
    return { error: messageFor(result.outcome.error.code) };
  }

  redirect('/projects/new');
};

const messageFor = (code: string): string => {
  switch (code) {
    case 'already_onboarded':
      return 'This account already belongs to an organization.';
    case 'email_taken':
      return 'That email address is already registered to a DavixRoom user.';
    case 'invalid_input':
      return 'Enter your name and your organization’s name.';
    default:
      return 'Something went wrong creating your organization. Try again.';
  }
};
