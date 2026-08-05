'use client';

import { useActionState } from 'react';
import { FormError, fieldClass, submitClass } from '@/components/app/auth-shell';
import { acceptInvite, type AcceptState } from './actions';

const initialState: AcceptState = { error: null };

export const AcceptInvitationForm = ({ token }: { readonly token: string }) => {
  const [state, formAction, pending] = useActionState(acceptInvite, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted font-medium">Your name</span>
        <input
          type="text"
          name="displayName"
          autoComplete="name"
          placeholder="How your name appears in the room"
          className={fieldClass}
        />
      </label>

      {state.error !== null && <FormError message={state.error} />}

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? 'Joining…' : 'Join the project'}
      </button>
    </form>
  );
};
