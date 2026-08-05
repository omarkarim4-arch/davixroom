import Link from 'next/link';
import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { findCurrentProfile, listProjectsForCaller } from '@/infra/db/onboarding';
import { signOut } from '../sign-in/actions';
import { BrandLockupSmall } from '@/components/brand/logo';
import { ActionLink } from '@/components/ui/action-link';

const ROLE_LABELS: Record<string, string> = {
  vendor_owner: 'Owner',
  vendor_developer: 'Developer',
  client_approver: 'Approver',
  client_reviewer: 'Reviewer',
  observer: 'Observer',
};

/**
 * Your rooms.
 *
 * The project list is not filtered by any WHERE clause on the caller — the
 * query asks for projects and row level security returns only those the caller
 * belongs to. The join to memberships is there to report the caller's own role,
 * not to restrict the result.
 */
export default async function Dashboard() {
  const result = await withCurrentUser(async (sql, caller) => {
    const profile = await findCurrentProfile(sql);

    // Signed in, but not yet part of any organization. That is the state
    // onboarding exists to resolve, and there is nothing to show until it is.
    if (profile === null) return { kind: 'no-profile' } as const;

    return {
      kind: 'ok',
      profile,
      caller,
      projects: await listProjectsForCaller(sql),
    } as const;
  });

  if (result === null) redirect('/sign-in');
  if (result.kind === 'no-profile') redirect('/onboarding');

  const { profile, caller, projects } = result;
  const mayStartProject =
    profile.organizationKind === 'vendor' &&
    (profile.organizationRole === 'org_owner' ||
      profile.organizationRole === 'org_admin');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 p-6 sm:p-10">
      <header className="flex items-start justify-between gap-4 border-b border-white/8 pb-6">
        <div>
          <BrandLockupSmall />
          <p className="text-muted mt-2 text-sm">
            {profile.organizationName} · {caller.email ?? profile.displayName}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-muted hover:text-ink rounded-md border border-white/10 px-4 py-2 text-sm transition-colors duration-200 hover:border-white/25"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="eyebrow">Your rooms</h2>
          {mayStartProject && (
            <ActionLink href="/projects/new" variant="ghost">
              New project
            </ActionLink>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/12 p-8">
            <p className="text-muted text-sm leading-relaxed">
              {mayStartProject
                ? 'No projects yet. Start one, invite your client, and you have a room to review in.'
                : 'No projects yet. You will see one here as soon as somebody adds you to it.'}
            </p>
            {mayStartProject && (
              <div className="mt-6">
                <ActionLink href="/projects/new">Start a project</ActionLink>
              </div>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="bg-surface hover:border-brand/40 hover:bg-raised flex items-center justify-between gap-4 rounded-xl border border-white/8 px-5 py-4 transition-colors duration-200"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{project.name}</span>
                    <span className="text-faint text-xs">
                      with {project.counterpartName}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="text-brand/80 font-mono text-xs tracking-widest uppercase">
                      {ROLE_LABELS[project.role] ?? project.role}
                    </span>
                    <span className="text-faint font-mono text-xs tracking-widest uppercase">
                      {project.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
