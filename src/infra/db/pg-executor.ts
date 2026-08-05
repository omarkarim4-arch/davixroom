import type { Pool, PoolClient } from 'pg';
import type { SqlExecutor, SqlRow } from '@/core/ports/sql';

/**
 * SqlExecutor backed by node-postgres, for a real Postgres server.
 *
 * The connection must authenticate as a non-superuser role (Supabase's
 * `authenticated`), because superusers bypass row level security entirely and
 * would silently defeat the policies in migration 0002.
 *
 * Verified by type-checking only in Stage 2 — there is no live server to test
 * against yet. Stage 3 provisions one and exercises this path.
 */
export class PgExecutor implements SqlExecutor {
  constructor(private readonly pool: Pool) {}

  async query<R extends SqlRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<R[]> {
    const result = await this.pool.query(text, [...params]);
    return result.rows as R[];
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const value = await fn(new PgClientExecutor(client));
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Binds queries to one checked-out client so they share the transaction. */
class PgClientExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<R extends SqlRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<R[]> {
    const result = await this.client.query(text, [...params]);
    return result.rows as R[];
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    // Already inside a transaction; reuse it rather than nesting.
    return fn(this);
  }
}
