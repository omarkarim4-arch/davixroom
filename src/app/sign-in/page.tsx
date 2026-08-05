'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Mark } from '@/components/brand/logo';
import { signIn, type SignInState } from './actions';

const initialState: SignInState = { error: null };

const field =
  'rounded-md border border-white/12 bg-black/40 px-3.5 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-faint focus:border-brand/70';

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[70vh] w-[100vw] -translate-x-1/2 -translate-y-[65%]"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(10,132,255,0.14), transparent 68%)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <Link href="/" aria-label="DavixRoom home" className="inline-block">
          <Mark className="h-11 w-auto" priority />
        </Link>

        <h1 className="mt-7 text-2xl font-semibold tracking-tight">
          Enter your room
        </h1>
        <p className="text-muted mt-2 text-sm">
          Sign in to reach your projects.
        </p>

        <form action={formAction} className="mt-9 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted font-medium">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted font-medium">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className={field}
            />
          </label>

          {state.error !== null && (
            <p
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-sm text-red-300"
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(10,132,255,0.75)] transition-all duration-200 [background-image:var(--gradient-mark)] hover:brightness-110 disabled:opacity-55 disabled:shadow-none"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div aria-hidden className="rule-glow mt-10 opacity-50" />

        <p className="eyebrow mt-6 text-center">Live Development Workspace</p>
      </div>
    </main>
  );
}
