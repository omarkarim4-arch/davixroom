import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { signOut } from '../sign-in/actions';
import { BrandLockupSmall } from '@/components/brand/logo';

/**
 * Proof that the whole Stage 3 path works end to end: a verified session
 * becomes a database identity, and row level security decides what comes back.
 *
 * The project list is not filtered by any WHERE clause here — the query asks
 * for every project, and the database returns only those the caller belongs to.
 * Stage 4 turns this into the real project surface.
 */
export default async function Dashboard() {
  const result = await withCurrentUser(async (sql, caller) => {
    const projects = await sql.query<{ id: string; name: string; status: string }>(
      'select id, name, status from projects order by created_at desc',
    );
    return { projects, caller };
  });

  if (result === null) {
    redirect('/sign-in');
  }

  const { projects, caller } = result;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 p-6 sm:p-10">
      <header className="flex items-center justify-between gap-4 border-b border-white/8 pb-6">
        <div>
          <BrandLockupSmall />
          <p className="text-muted mt-2 text-sm">{caller.email ?? 'Signed in'}</p>
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

      <section className="flex flex-col gap-4">
        <h2 className="eyebrow">Your projects</h2>

        {projects.length === 0 ? (
          <p className="text-muted rounded-xl border border-dashed border-white/12 p-8 text-sm leading-relaxed">
            No projects yet. Organization and project onboarding arrives in the
            next stage.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="bg-surface hover:border-brand/40 flex items-center justify-between rounded-xl border border-white/8 px-5 py-4 transition-colors duration-200"
              >
                <span className="font-medium">{project.name}</span>
                <span className="text-faint font-mono text-xs tracking-widest uppercase">
                  {project.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
