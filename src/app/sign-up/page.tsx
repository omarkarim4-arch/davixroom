'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  AuthShell,
  FormError,
  fieldClass,
  submitClass,
} from '@/components/app/auth-shell';
import { signUp, type SignUpState } from './actions';

const initialState: SignUpState = { error: null, sent: false };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  if (state.sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="Confirm your address, then sign in to name your organization."
      >
        <Link href="/sign-in" className="text-brand text-sm hover:brightness-125">
          Go to sign in →
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="For software companies and independent developers. Your clients join by invitation — they never sign up."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="text-brand hover:brightness-125">
            Sign in
          </Link>
        </>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted font-medium">Work email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted font-medium">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={fieldClass}
          />
          <span className="text-faint text-xs">At least 8 characters.</span>
        </label>

        {state.error !== null && <FormError message={state.error} />}

        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
