import Link from 'next/link';
import type { ReactNode } from 'react';
import { Mark } from '@/components/brand/logo';

type AuthShellProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
};

/**
 * The centred, single-purpose frame used by every step on the way into a room:
 * sign in, sign up, name your organization, accept an invitation.
 *
 * Each of these pages asks for one thing, so none of them get navigation — the
 * only way onward is to answer the question.
 */
export const AuthShell = ({ title, subtitle, children, footer }: AuthShellProps) => (
  <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 h-[70vh] w-[100vw] -translate-x-1/2 -translate-y-[65%]"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(10,132,255,0.14), transparent 68%)',
      }}
    />

    <div className="relative w-full max-w-md">
      <Link href="/" aria-label="DavixRoom home" className="inline-block">
        <Mark className="h-11 w-auto" priority />
      </Link>

      <h1 className="mt-7 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted mt-2 text-sm leading-relaxed">{subtitle}</p>

      <div className="mt-9">{children}</div>

      {footer !== undefined && (
        <>
          <div aria-hidden className="rule-glow mt-10 opacity-50" />
          <div className="text-muted mt-6 text-center text-sm">{footer}</div>
        </>
      )}
    </div>
  </main>
);

export const fieldClass =
  'rounded-md border border-white/12 bg-black/40 px-3.5 py-2.5 text-sm outline-none transition-colors duration-200 placeholder:text-faint focus:border-brand/70';

export const submitClass =
  'mt-2 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(10,132,255,0.75)] transition-all duration-200 [background-image:var(--gradient-mark)] hover:brightness-110 disabled:opacity-55 disabled:shadow-none';

export const FormError = ({ message }: { readonly message: string }) => (
  <p
    role="alert"
    className="rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2 text-sm text-red-300"
  >
    {message}
  </p>
);
