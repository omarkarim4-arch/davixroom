import Link from 'next/link';
import { getAuthenticatedCaller } from '@/infra/auth/session';
import { AuthShell } from '@/components/app/auth-shell';
import { AcceptInvitationForm } from './accept-form';

export const metadata = { title: 'Invitation' };

/**
 * The invitee's whole journey in one page.
 *
 * Nothing about the invitation is shown before it is accepted — not the
 * project, not who sent it, not whether the token is even real. The page has to
 * render for a stranger holding a link, and anything it displayed would be
 * readable by whoever obtained that link.
 */
export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const caller = await getAuthenticatedCaller();

  if (caller === null) {
    return (
      <AuthShell
        title="You have been invited to review"
        subtitle="Sign in or create an account with the address your invitation was sent to, then open this link again to join."
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="rounded-md px-4 py-2.5 text-center text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(10,132,255,0.75)] transition-all duration-200 [background-image:var(--gradient-mark)] hover:brightness-110"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-ink/85 hover:border-brand/50 hover:text-ink rounded-md border border-white/12 px-4 py-2.5 text-center text-sm font-medium transition-colors duration-200"
          >
            Create an account
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Accept your invitation"
      subtitle={`Joining as ${caller.email ?? 'your account'}. An invitation only opens for the address it was sent to.`}
    >
      <AcceptInvitationForm token={token} />
    </AuthShell>
  );
}
