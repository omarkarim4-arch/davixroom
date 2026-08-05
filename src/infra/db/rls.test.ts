import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/database';
import { AUTH, SEED, seedFixture } from '../testing/seed';
import { T0 } from '@/core/testing/doubles';

/**
 * Row level security, asserted against real Postgres as the `authenticated`
 * role.
 *
 * These are the tests that justify the second enforcement layer: every query
 * here goes straight to the database with no application code in the path, so
 * a pass means the boundary holds even when authorize() is bypassed entirely.
 */
describe('row level security', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedFixture(db.sql);

    // Content in the Acme project, seeded as superuser.
    await db.sql.query(
      `insert into deliverables (id, project_id, title, created_by, created_at)
       values ('deliv-acme', $1, 'Checkout', $2, $3)`,
      [SEED.acmeProject, SEED.developer, new Date(T0)],
    );
    await db.sql.query(
      `insert into deliverable_versions
         (id, deliverable_id, number, summary, published_by, published_at)
       values ('ver-acme-1', 'deliv-acme', 1, 'First cut', $1, $2)`,
      [SEED.developer, new Date(T0)],
    );
    await db.sql.query(
      `insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
       values ('ev-acme-1', $1, 1, 'chat.message_posted', $2, $3, $4)`,
      [
        SEED.acmeProject,
        SEED.developer,
        new Date(T0),
        JSON.stringify({ messageId: 'm1', body: 'Acme only' }),
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('shows a member only the projects they belong to', async () => {
    const acme = await db.withUser(AUTH.acmeApprover, (sql) =>
      sql.query<{ id: string }>('select id from projects'),
    );

    expect(acme.map((row) => row.id)).toEqual([SEED.acmeProject]);
  });

  it('returns zero rows for another tenant’s project, queried directly', async () => {
    // The heart of Stage 2: a Globex user asking for the Acme project by id
    // gets nothing back, with no application code involved.
    const rows = await db.withUser(AUTH.globexApprover, (sql) =>
      sql.query('select id from projects where id = $1', [SEED.acmeProject]),
    );

    expect(rows).toEqual([]);
  });

  it('hides another tenant’s timeline events', async () => {
    const rows = await db.withUser(AUTH.globexApprover, (sql) =>
      sql.query('select id from timeline_events where project_id = $1', [
        SEED.acmeProject,
      ]),
    );

    expect(rows).toEqual([]);
  });

  it('hides another tenant’s deliverables and versions', async () => {
    const { deliverables, versions } = await db.withUser(
      SEED.globexApprover,
      async (sql) => ({
        deliverables: await sql.query('select id from deliverables'),
        versions: await sql.query('select id from deliverable_versions'),
      }),
    );

    expect(deliverables).toEqual([]);
    expect(versions).toEqual([]);
  });

  it('lets a member of the same project read that content', async () => {
    const rows = await db.withUser(AUTH.acmeApprover, (sql) =>
      sql.query<{ id: string }>('select id from timeline_events'),
    );

    expect(rows.map((row) => row.id)).toEqual(['ev-acme-1']);
  });

  it('shows the vendor developer both projects they work on', async () => {
    const rows = await db.withUser(AUTH.developer, (sql) =>
      sql.query<{ id: string }>('select id from projects order by id'),
    );

    expect(rows.map((row) => row.id)).toEqual([SEED.acmeProject, SEED.globexProject]);
  });

  it('isolates two clients that share a vendor', async () => {
    // Acme and Globex are both served by the same vendor org. Isolation must
    // key on project membership, not on the organization tree.
    const acmeView = await db.withUser(AUTH.acmeApprover, (sql) =>
      sql.query<{ id: string }>('select id from projects'),
    );
    const globexView = await db.withUser(AUTH.globexApprover, (sql) =>
      sql.query<{ id: string }>('select id from projects'),
    );

    expect(acmeView.map((row) => row.id)).toEqual([SEED.acmeProject]);
    expect(globexView.map((row) => row.id)).toEqual([SEED.globexProject]);
  });

  it('grants nothing to a request carrying no identity', async () => {
    await db.sql.query('select set_config($1, $2, false)', ['request.jwt.claims', '']);
    await db.sql.query('set role authenticated');
    const rows = await db.sql.query('select id from projects');
    await db.asSuperuser();

    expect(rows).toEqual([]);
  });

  it('grants nothing to an auth subject with no domain user', async () => {
    // A valid login that has not been linked to a person resolves to no user,
    // and therefore to no memberships.
    const rows = await db.withUser(AUTH.unlinked, (sql) =>
      sql.query('select id from projects'),
    );

    expect(rows).toEqual([]);
  });

  it('ignores a forged app.user_id session setting', async () => {
    // Migration 0003 removed this override. If it ever returns, this fails —
    // any client able to set a GUC could otherwise impersonate anyone.
    await db.sql.query('select set_config($1, $2, false)', ['request.jwt.claims', '']);
    await db.sql.query('select set_config($1, $2, false)', [
      'app.user_id',
      SEED.acmeApprover,
    ]);
    await db.sql.query('set role authenticated');
    const rows = await db.sql.query('select id from projects');
    await db.asSuperuser();
    await db.sql.query('select set_config($1, $2, false)', ['app.user_id', '']);

    expect(rows).toEqual([]);
  });

  it('resolves the acting user through the JWT subject', async () => {
    const rows = await db.withUser(AUTH.acmeApprover, (sql) =>
      sql.query<{ id: string | null }>('select app.current_user_id() as id'),
    );

    expect(rows[0]?.id).toBe(SEED.acmeApprover);
  });

  it('stops showing a project once membership is removed', async () => {
    await db.sql.query(`update memberships set removed_at = $1 where id = 'm-4'`, [
      new Date(T0),
    ]);

    const rows = await db.withUser(AUTH.acmeReviewer, (sql) =>
      sql.query('select id from projects'),
    );

    expect(rows).toEqual([]);

    await db.sql.query(`update memberships set removed_at = null where id = 'm-4'`);
  });

  it('refuses an event authored in someone else’s name', async () => {
    // The insert policy requires actor_id to match the caller, so history
    // cannot be fabricated under another user's identity.
    await expect(
      db.withUser(AUTH.acmeApprover, (sql) =>
        sql.query(
          `insert into timeline_events
             (id, project_id, seq, type, actor_id, occurred_at, payload)
           values ('ev-forged', $1, 99, 'chat.message_posted', $2, $3, $4)`,
          [
            SEED.acmeProject,
            SEED.developer,
            new Date(T0),
            JSON.stringify({ messageId: 'm2', body: 'not mine' }),
          ],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses an event written into another tenant’s project', async () => {
    await expect(
      db.withUser(AUTH.globexApprover, (sql) =>
        sql.query(
          `insert into timeline_events
             (id, project_id, seq, type, actor_id, occurred_at, payload)
           values ('ev-cross', $1, 99, 'chat.message_posted', $2, $3, $4)`,
          [
            SEED.acmeProject,
            SEED.globexApprover,
            new Date(T0),
            JSON.stringify({ messageId: 'm3', body: 'trespass' }),
          ],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('hides users who share no project with the caller', async () => {
    const rows = await db.withUser(AUTH.acmeApprover, (sql) =>
      sql.query<{ id: string }>('select id from users order by id'),
    );
    const visible = rows.map((row) => row.id);

    expect(visible).toContain(SEED.developer);
    expect(visible).toContain(SEED.acmeApprover);
    expect(visible).not.toContain(SEED.strangerUser);
  });

  it('hides organizations the caller has no relationship with', async () => {
    const rows = await db.withUser(AUTH.acmeApprover, (sql) =>
      sql.query<{ id: string }>('select id from organizations order by id'),
    );
    const visible = rows.map((row) => row.id);

    expect(visible).toContain(SEED.acmeOrg);
    expect(visible).toContain(SEED.vendorOrg);
    expect(visible).not.toContain(SEED.globexOrg);
  });
});
