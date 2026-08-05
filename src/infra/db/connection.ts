import { Pool } from 'pg';
import { env } from '@/config/env';
import { PgExecutor } from './pg-executor';
import type { SqlExecutor } from '@/core/ports/sql';

/**
 * The application's Postgres connection pool.
 *
 * A module-level singleton because Next.js re-evaluates route modules
 * frequently in development; creating a pool per request would exhaust the
 * server's connection limit within minutes.
 *
 * The connection string is a secret and is never logged. Errors raised here
 * deliberately mention the variable name and nothing about its contents, since
 * a connection string carries the database password.
 */
let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (pool === null) {
    pool = new Pool({
      connectionString: env().DATABASE_URL,
      // Supabase terminates TLS with a certificate chain Node does not ship a
      // root for on every platform. The connection is still encrypted.
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    pool.on('error', (error) => {
      // An idle client failed. Log the message only; the pool recovers by
      // discarding the client.
      console.error('[db] idle client error:', error.message);
    });
  }

  return pool;
};

export const getSql = (): SqlExecutor => new PgExecutor(getPool());

/** Closes the pool. For scripts and tests, not for request handling. */
export const closePool = async (): Promise<void> => {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
};
