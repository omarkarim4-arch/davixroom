import type { PGlite } from '@electric-sql/pglite';
import type { SqlExecutor, SqlRow } from '@/core/ports/sql';

/**
 * SqlExecutor backed by PGlite — Postgres compiled to WebAssembly, running
 * in-process.
 *
 * This is what lets the schema, the append-only triggers and the row level
 * security policies be tested against real Postgres semantics without Docker or
 * a hosted project. It is a test and local-development adapter; production uses
 * the node-postgres executor.
 */
export class PGliteExecutor implements SqlExecutor {
  constructor(private readonly db: PGlite) {}

  async query<R extends SqlRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<R[]> {
    const result = await this.db.query<R>(text, [...params]);
    return result.rows;
  }

  /**
   * PGlite runs a single connection, so nested transactions are not available.
   * Repositories never nest, and the executor handed to the callback is this
   * same instance running inside the open transaction.
   */
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    await this.db.exec('begin');
    try {
      const value = await fn(this);
      await this.db.exec('commit');
      return value;
    } catch (error) {
      await this.db.exec('rollback');
      throw error;
    }
  }
}
