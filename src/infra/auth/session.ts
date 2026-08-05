import { createSupabaseServerClient } from './supabase-server';
import { asAuthenticatedUser } from '../db/request-context';
import { getSql } from '../db/connection';
import type { SqlExecutor } from '@/core/ports/sql';

/**
 * The authenticated caller, or null when signed out.
 *
 * Always obtained via `getUser()`, never by reading the session from the
 * cookie. `getSession()` returns whatever the cookie claims without contacting
 * the auth server, so its contents are attacker-controlled; `getUser()`
 * validates the token. Since this value is fed straight into
 * `request.jwt.claims`, trusting an unvalidated one would hand out accounts.
 */
export type AuthenticatedCaller = {
  readonly authUserId: string;
  readonly email: string | null;
};

export const getAuthenticatedCaller = async (): Promise<AuthenticatedCaller | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error !== null || data.user === null) {
    return null;
  }

  return { authUserId: data.user.id, email: data.user.email ?? null };
};

/**
 * Runs database work as the signed-in caller, under row level security.
 *
 * Returns null when nobody is signed in, so callers must handle the signed-out
 * case explicitly rather than silently querying as nobody.
 */
export const withCurrentUser = async <T>(
  work: (sql: SqlExecutor, caller: AuthenticatedCaller) => Promise<T>,
): Promise<T | null> => {
  const caller = await getAuthenticatedCaller();
  if (caller === null) {
    return null;
  }

  return asAuthenticatedUser(getSql(), caller.authUserId, (scoped) =>
    work(scoped, caller),
  );
};
