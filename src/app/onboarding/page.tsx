'use client';

import { useActionState } from 'react';
import {
  AuthShell,
  FormError,
  fieldClass,
  submitClass,
} from '@/components/app/auth-shell';
import { createOrganization, type OnboardingState } from './actions';

const initialState: OnboardingState = { error: null };

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(createOrganization, initialState);

  return (
    <AuthShell
      title="Name your organization"
      subtitle="This is the team that builds and demonstrates the work. You can invite the rest of it later."
    >
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted font-medium">Organization</span>
          <input
            type="text"
            name="organizationName"
            autoComplete="organization"
            placeholder="Davix Software"
            required
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted font-medium">Your name</span>
          <input
            type="text"
            name="displayName"
            autoComplete="name"
            required
            className={fieldClass}
          />
        </label>

        {state.error !== null && <FormError message={state.error} />}

        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? 'Creating…' : 'Continue'}
        </button>
      </form>
    </AuthShell>
  );
}
