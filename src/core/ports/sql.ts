/**
 * A minimal SQL boundary.
 *
 * Repositories target this rather than a vendor client, so the same adapter
 * code runs against PGlite in tests and a real Postgres server in production.
 * Queries are parameterised positionally (`$1`, `$2`); no string interpolation
 * of values is ever performed by the repositories.
 */

export type SqlRow = Record<string, unknown>;

export type SqlExecutor = {
  query<R extends SqlRow>(text: string, params?: readonly unknown[]): Promise<R[]>;

  /**
   * Runs `fn` inside a transaction, rolling back if it throws.
   *
   * The executor handed to `fn` is bound to the transaction — using the outer
   * executor inside the callback would run outside it.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
};

/** Raised when a unique constraint rejects a write. */
export const UNIQUE_VIOLATION = '23505';

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION;
