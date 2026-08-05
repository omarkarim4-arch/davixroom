import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PgExecutor } from './pg-executor';
import { asAnonymous, asAuthenticatedUser } from './request-context';

/**
 * Verification against the real Supabase project.
 *
 * These tests are **read-only**. The project is the permanent development and
 * production database, so nothing here inserts, updates or deletes — polluting
 * it with fixtures would be worse than the coverage is worth. That does leave
 * one thing unverified: a genuine two-writer race on the timeline sequence
 * allocator, which needs write access to a throwaway database.
 *
 * Skipped entirely when DATABASE_URL is absent, so a fresh checkout and CI both
 * pass without credentials.
 */
const connectionString = process.env.DATABASE_URL;

describe.skipIf(connectionString === undefined || connectionString === '')(
  'live Supabase database',
  () => {
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 15_000,
    });
    const sql = new PgExecutor(pool);

    afterAll(async () => {
      await pool.end();
    });

    it('connects and reports a Postgres 17 server', async () => {
      const rows = await sql.query<{ version: string }>('show server_version');
      expect(rows[0]?.version).toMatch(/^17\./);
    });

    it('connects as a role that does NOT bypass row level security', async () => {
      // The single most important property of this connection. `postgres` and
      // `service_role` both carry BYPASSRLS, and using either would silently
      // disable every tenancy policy while appearing to work perfectly.
      const rows = await sql.query<{
        current_role_name: string;
        bypassrls: boolean;
        is_superuser: boolean;
      }>(
        `select current_user as current_role_name,
                rolbypassrls as bypassrls,
                rolsuper as is_superuser
         from pg_roles
         where rolname = current_user`,
      );

      expect(rows[0]?.is_superuser).toBe(false);
      expect(rows[0]?.bypassrls).toBe(false);
    });

    it('has every application table protected by forced row level security', async () => {
      const rows = await sql.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
         order by c.relname`,
      );

      expect(rows.length).toBe(10);
      for (const table of rows) {
        expect(table.relrowsecurity, `${table.relname} RLS enabled`).toBe(true);
        expect(table.relforcerowsecurity, `${table.relname} RLS forced`).toBe(true);
      }
    });

    it('carries all four migrations', async () => {
      const rows = await sql.query<{ name: string }>(
        `select name from supabase_migrations.schema_migrations order by version`,
      );

      expect(rows.map((row) => row.name)).toEqual([
        '0001_schema',
        '0002_rls',
        '0003_auth_identity',
        '0004_function_search_path',
      ]);
    });

    it('resolves no user for an unlinked auth subject', async () => {
      const rows = await asAuthenticatedUser(
        sql,
        '00000000-0000-0000-0000-0000000000ff',
        (scoped) =>
          scoped.query<{ id: string | null }>('select app.current_user_id() as id'),
      );

      expect(rows[0]?.id).toBeNull();
    });

    it('returns no projects to an arbitrary authenticated subject', async () => {
      const rows = await asAuthenticatedUser(
        sql,
        '00000000-0000-0000-0000-0000000000ff',
        (scoped) => scoped.query('select id from projects'),
      );

      expect(rows).toEqual([]);
    });

    it('refuses everything to an anonymous caller', async () => {
      await expect(
        asAnonymous(sql, (scoped) => scoped.query('select id from projects')),
      ).rejects.toThrow(/permission denied/i);
    });

    it('applies the authenticated role inside the transaction', async () => {
      const rows = await asAuthenticatedUser(
        sql,
        '00000000-0000-0000-0000-0000000000ff',
        (scoped) => scoped.query<{ role: string }>('select current_user as role'),
      );

      expect(rows[0]?.role).toBe('authenticated');
    });

    it('does not leak identity onto the pooled connection afterwards', async () => {
      // SET LOCAL is what makes this true. With a plain SET, the next request
      // to reuse this connection would inherit the previous caller's identity —
      // a cross-tenant data leak that no policy could catch.
      await asAuthenticatedUser(sql, '00000000-0000-0000-0000-0000000000ff', (scoped) =>
        scoped.query('select 1'),
      );

      const after = await sql.query<{ claims: string | null; role: string }>(
        `select nullif(current_setting('request.jwt.claims', true), '') as claims,
                current_user as role`,
      );

      expect(after[0]?.claims).toBeNull();
      expect(after[0]?.role).not.toBe('authenticated');
    });

    it('keeps two concurrent identities isolated from each other', async () => {
      const [first, second] = await Promise.all([
        asAuthenticatedUser(sql, '00000000-0000-0000-0000-000000000001', (scoped) =>
          scoped.query<{ sub: string }>(
            `select current_setting('request.jwt.claims', true)::jsonb ->> 'sub' as sub`,
          ),
        ),
        asAuthenticatedUser(sql, '00000000-0000-0000-0000-000000000002', (scoped) =>
          scoped.query<{ sub: string }>(
            `select current_setting('request.jwt.claims', true)::jsonb ->> 'sub' as sub`,
          ),
        ),
      ]);

      expect(first[0]?.sub).toBe('00000000-0000-0000-0000-000000000001');
      expect(second[0]?.sub).toBe('00000000-0000-0000-0000-000000000002');
    });
  },
);
