import { redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { signOut } from './sign-in/actions';

/**
 * Proof that the whole Stage 3 path works end to end: a verified session
 * becomes a database identity, and row level security decides what comes back.
 *
 * The project list is not filtered by any WHERE clause here — the query asks
 * for every project, and the database returns only those the caller belongs to.
 * Stage 4 turns this into the real project surface.
 */
export default async function Home() {
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 p-6 sm:p-10">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DavixRoom</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {caller.email ?? 'Signed in'}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-sm underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60">
          Your projects
        </h2>

        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-black/15 p-6 text-sm text-black/60 dark:border-white/20 dark:text-white/60">
            No projects yet. Organization and project onboarding arrives in the next
            stage.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 dark:border-white/15"
              >
                <span className="font-medium">{project.name}</span>
                <span className="text-xs text-black/50 dark:text-white/50">
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
