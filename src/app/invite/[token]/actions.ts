'use server';

import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { acceptInvitation } from '@/infra/db/onboarding';
import type { OnboardingErrorCode } from '@/infra/db/onboarding';

export type AcceptState = { readonly error: string | null };

/**
 * Accepts an invitation and lands the invitee in the project.
 *
 * No capability check: the invitee has no membership to check, which is the
 * whole point of an invitation. The guard is `app.accept_invitation`, which
 * requires the caller to be signed in as the *confirmed* address the invitation
 * names. The token alone is never enough.
 */
export const acceptInvite = async (
  _previous: AcceptState,
  formData: FormData,
): Promise<AcceptState> => {
  const token = String(formData.get('token') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();

  if (token === '') {
    return { error: 'That invitation link is incomplete.' };
  }

  const result = await withCurrentUser((sql) =>
    acceptInvitation(sql, token, displayName === '' ? null : displayName),
  );

  if (result === null) {
    // Sign in first, then come back to the same link.
    redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  if (!result.ok) {
    return { error: messageFor(result.error.code) };
  }

  redirect(result.value === null ? '/dashboard' : `/projects/${result.value}`);
};

const messageFor = (code: OnboardingErrorCode): string => {
  switch (code) {
    case 'invitation_invalid':
      // Deliberately the same message the database gives for an unknown token
      // and for one addressed to somebody else. Telling them apart would reveal
      // which addresses have been invited.
      return 'This invitation is not available for the account you are signed in as.';
    case 'invitation_expired':
      return 'This invitation has expired. Ask for a new one.';
    case 'invitation_revoked':
      return 'This invitation was withdrawn.';
    case 'invitation_used':
      return 'This invitation has already been accepted.';
    case 'email_unconfirmed':
      return 'Confirm your email address, then open this link again.';
    case 'organization_conflict':
      return 'This account already belongs to another organization.';
    case 'email_taken':
      return 'That address already belongs to a DavixRoom user.';
    default:
      return 'Something went wrong accepting the invitation. Try again.';
  }
};
