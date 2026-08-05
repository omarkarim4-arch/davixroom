import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGliteExecutor } from '../db/pglite-executor';
import type { SqlExecutor } from '@/core/ports/sql';

/**
 * An ephemeral Postgres for integration tests.
 *
 * PGlite is Postgres compiled to WebAssembly, so migrations, triggers and row
 * level security behave as they will in production — no Docker, no hosted
 * project, no network.
 *
 * The important detail is the role. PGlite connects as a superuser, and
 * superusers bypass row level security entirely; asserting a policy while
 * connected as one proves nothing. Tests therefore switch to `authenticated`
 * (the role Supabase gives signed-in users) before making any claim about
 * access, and only seed data as the superuser.
 *
 * Identity is supplied exactly as Supabase supplies it — by setting
 * `request.jwt.claims` — so these tests drive the same resolution path as a
 * real request rather than a test-only shortcut.
 */
export type TestDatabase = {
  /** Executor for the current role. */
  readonly sql: SqlExecutor;
  /** Runs queries as `authenticated`, acting as the given auth subject. */
  asUser(authUserId: string): Promise<void>;
  /** Returns to the superuser connection, bypassing RLS — seeding only. */
  asSuperuser(): Promise<void>;
  /** Runs `fn` as the given auth subject, restoring the previous role after. */
  withUser<T>(authUserId: string, fn: (sql: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

const migrationsDirectory = new URL('../../../supabase/migrations/', import.meta.url);

const readMigrations = async (): Promise<readonly string[]> => {
  const entries = await readdir(migrationsDirectory);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();

  return Promise.all(
    files.map((name) => readFile(new URL(name, migrationsDirectory), 'utf8')),
  );
};

export const createTestDatabase = async (): Promise<TestDatabase> => {
  const db = new PGlite();
  await db.waitReady;

  // Supabase provides these roles; PGlite starts without them, and migration
  // 0002 grants privileges to `authenticated`.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
  `);

  // A stand-in for the auth schema Supabase manages. Migration 0003 references
  // auth.users, and migration 0005 reads the address and its confirmation
  // before letting anybody accept an invitation, so both columns must exist.
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz
    );
  `);

  for (const migration of await readMigrations()) {
    await db.exec(migration);
  }

  const executor = new PGliteExecutor(db);

  const asUser = async (authUserId: string): Promise<void> => {
    await db.exec('reset role');
    // Exactly the claim shape Supabase sets on an authenticated request.
    await db.query('select set_config($1, $2, false)', [
      'request.jwt.claims',
      JSON.stringify({ sub: authUserId, role: 'authenticated' }),
    ]);
    await db.exec('set role authenticated');
  };

  const asSuperuser = async (): Promise<void> => {
    await db.exec('reset role');
    await db.query('select set_config($1, $2, false)', ['request.jwt.claims', '']);
  };

  return {
    sql: executor,
    asUser,
    asSuperuser,
    async withUser<T>(
      userId: string,
      fn: (sql: SqlExecutor) => Promise<T>,
    ): Promise<T> {
      await asUser(userId);
      try {
        return await fn(executor);
      } finally {
        await asSuperuser();
      }
    },
    async close() {
      await db.close();
    },
  };
};
