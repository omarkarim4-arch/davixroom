import type { SqlExecutor } from '@/core/ports/sql';

/**
 * Runs work against the database as a specific authenticated user.
 *
 * Three things have to be true for row level security to hold on a pooled
 * connection, and this function is the only place they are arranged:
 *
 * 1. The role must be `authenticated`, never the owning role. `postgres` has
 *    BYPASSRLS, so a query issued as the owner silently ignores every policy.
 * 2. The identity must be supplied as `request.jwt.claims`, matching what
 *    Supabase sets on a real request, because migration 0003 resolves the
 *    acting user from that claim and nothing else.
 * 3. Both must use SET LOCAL inside a transaction. A plain SET persists on the
 *    connection after it returns to the pool, so the next request — a different
 *    user, possibly a different tenant — would inherit this identity. That is
 *    the single most dangerous mistake available here, and the transaction is
 *    what prevents it.
 *
 * The subject must already have been verified. Passing an unvalidated value
 * here is equivalent to handing out the account.
 */
export const asAuthenticatedUser = async <T>(
  sql: SqlExecutor,
  authUserId: string,
  work: (scoped: SqlExecutor) => Promise<T>,
): Promise<T> =>
  sql.transaction(async (tx) => {
    // set_config with is_local = true is SET LOCAL, parameterised. Building
    // this as SET ... '<value>' would concatenate a user-controlled string into
    // SQL, which is exactly what must not happen with an identity.
    await tx.query('select set_config($1, $2, true)', ['role', 'authenticated']);
    await tx.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: authUserId, role: 'authenticated' }),
    ]);

    return work(tx);
  });

/**
 * Runs work with no identity, as the `anon` role.
 *
 * Every table in DavixRoom is project-scoped, so this should return nothing.
 * It exists to make "signed out" an explicit, testable state rather than an
 * accidental one.
 */
export const asAnonymous = async <T>(
  sql: SqlExecutor,
  work: (scoped: SqlExecutor) => Promise<T>,
): Promise<T> =>
  sql.transaction(async (tx) => {
    await tx.query('select set_config($1, $2, true)', ['role', 'anon']);
    await tx.query('select set_config($1, $2, true)', ['request.jwt.claims', '']);
    return work(tx);
  });
