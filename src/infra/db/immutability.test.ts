import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/database';
import { SEED, seedFixture } from '../testing/seed';
import { T0 } from '@/core/testing/doubles';
import { HOUR_MS } from '@/core/time';

/**
 * The append-only guarantee, enforced by the database.
 *
 * Stage 1's EventStore port has no update or delete method, but that is only an
 * interface convention — any client with a connection could still issue one.
 * These triggers make immutability a property of the data rather than of the
 * code that happens to be in front of it.
 *
 * Note these run as the superuser: triggers fire regardless of role, and using
 * the most privileged connection available is the strongest form of the claim.
 */
describe('append-only enforcement', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedFixture(db.sql);

    await db.sql.query(
      `insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
       values ('ev-1', $1, 1, 'chat.message_posted', $2, $3, $4)`,
      [
        SEED.acmeProject,
        SEED.developer,
        new Date(T0),
        JSON.stringify({ messageId: 'm1', body: 'original' }),
      ],
    );

    await db.sql.query(
      `insert into deliverables (id, project_id, title, created_by, created_at)
       values ('deliv-1', $1, 'Checkout', $2, $3)`,
      [SEED.acmeProject, SEED.developer, new Date(T0)],
    );

    await db.sql.query(
      `insert into deliverable_versions
         (id, deliverable_id, number, summary, published_by, published_at)
       values ('ver-1', 'deliv-1', 1, 'First cut', $1, $2)`,
      [SEED.developer, new Date(T0)],
    );

    await db.sql.query(
      `insert into decisions (id, deliverable_version_id, verdict, decided_by, decided_at)
       values ('dec-1', 'ver-1', 'approved', $1, $2)`,
      [SEED.acmeApprover, new Date(T0 + HOUR_MS)],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('rejects updating a timeline event', async () => {
    await expect(
      db.sql.query(
        `update timeline_events set payload = '{}'::jsonb where id = 'ev-1'`,
      ),
    ).rejects.toThrow(/append_only_violation/);
  });

  it('rejects deleting a timeline event', async () => {
    await expect(
      db.sql.query(`delete from timeline_events where id = 'ev-1'`),
    ).rejects.toThrow(/append_only_violation/);
  });

  it('rejects rewriting a decision', async () => {
    // A recorded approval is commercially meaningful; changing your mind means
    // recording a new decision, not editing the old one.
    await expect(
      db.sql.query(`update decisions set verdict = 'rejected' where id = 'dec-1'`),
    ).rejects.toThrow(/append_only_violation/);
  });

  it('rejects deleting a decision', async () => {
    await expect(
      db.sql.query(`delete from decisions where id = 'dec-1'`),
    ).rejects.toThrow(/append_only_violation/);
  });

  it('rejects editing a published version', async () => {
    await expect(
      db.sql.query(
        `update deliverable_versions set summary = 'edited' where id = 'ver-1'`,
      ),
    ).rejects.toThrow(/append_only_violation/);
  });

  it('leaves the original row intact after a rejected update', async () => {
    const rows = await db.sql.query<{ payload: { body: string } }>(
      `select payload from timeline_events where id = 'ev-1'`,
    );

    expect(rows[0]?.payload.body).toBe('original');
  });
});

describe('grant immutability', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedFixture(db.sql);

    await db.sql.query(
      `insert into grants
         (id, project_id, subject_user_id, capability, scope_kind, scope_session_id,
          granted_by, granted_at, expires_at)
       values ('grant-1', $1, $2, 'session.control', 'session', 'session-1', $3, $4, $5)`,
      [
        SEED.acmeProject,
        SEED.acmeApprover,
        SEED.developer,
        new Date(T0),
        new Date(T0 + 15 * 60_000),
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('allows revocation', async () => {
    await db.sql.query(`update grants set revoked_at = $1 where id = 'grant-1'`, [
      new Date(T0 + 60_000),
    ]);

    const rows = await db.sql.query<{ revoked_at: Date | null }>(
      `select revoked_at from grants where id = 'grant-1'`,
    );

    expect(rows[0]?.revoked_at).not.toBeNull();
  });

  it('refuses to extend an expiry', async () => {
    // Without this, the revocation path could be used to quietly widen a grant.
    await expect(
      db.sql.query(`update grants set expires_at = $1 where id = 'grant-1'`, [
        new Date(T0 + 10 * HOUR_MS),
      ]),
    ).rejects.toThrow(/grant_immutable/);
  });

  it('refuses to change the capability', async () => {
    await expect(
      db.sql.query(
        `update grants set capability = 'project.manage' where id = 'grant-1'`,
      ),
    ).rejects.toThrow(/grant_immutable/);
  });

  it('refuses to widen the scope', async () => {
    await expect(
      db.sql.query(
        `update grants set scope_kind = 'project', scope_session_id = null where id = 'grant-1'`,
      ),
    ).rejects.toThrow(/grant_immutable/);
  });

  it('refuses to reassign the subject', async () => {
    await expect(
      db.sql.query(`update grants set subject_user_id = $1 where id = 'grant-1'`, [
        SEED.acmeReviewer,
      ]),
    ).rejects.toThrow(/grant_immutable/);
  });

  it('refuses deletion, so the audit trail survives', async () => {
    await expect(
      db.sql.query(`delete from grants where id = 'grant-1'`),
    ).rejects.toThrow(/grant_immutable/);
  });
});

describe('schema constraints', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedFixture(db.sql);
  });

  afterAll(async () => {
    await db.close();
  });

  it('refuses a project with the same organization on both sides', async () => {
    await expect(
      db.sql.query(
        `insert into projects
           (id, vendor_organization_id, client_organization_id, name, status, created_at)
         values ('p-bad', $1, $1, 'Self dealing', 'active', $2)`,
        [SEED.vendorOrg, new Date(T0)],
      ),
    ).rejects.toThrow(/projects_sides_differ/);
  });

  it('refuses a rejection with no rationale', async () => {
    await db.sql.query(
      `insert into deliverables (id, project_id, title, created_by, created_at)
       values ('deliv-c', $1, 'Thing', $2, $3)`,
      [SEED.acmeProject, SEED.developer, new Date(T0)],
    );
    await db.sql.query(
      `insert into deliverable_versions
         (id, deliverable_id, number, summary, published_by, published_at)
       values ('ver-c', 'deliv-c', 1, 'v1', $1, $2)`,
      [SEED.developer, new Date(T0)],
    );

    await expect(
      db.sql.query(
        `insert into decisions (id, deliverable_version_id, verdict, decided_by, decided_at)
         values ('dec-bad', 'ver-c', 'rejected', $1, $2)`,
        [SEED.acmeApprover, new Date(T0)],
      ),
    ).rejects.toThrow(/decisions_rationale_required/);
  });

  it('refuses a session-scoped grant with no session', async () => {
    await expect(
      db.sql.query(
        `insert into grants
           (id, project_id, subject_user_id, capability, scope_kind,
            granted_by, granted_at)
         values ('grant-bad', $1, $2, 'session.control', 'session', $3, $4)`,
        [SEED.acmeProject, SEED.acmeApprover, SEED.developer, new Date(T0)],
      ),
    ).rejects.toThrow(/grants_scope_shape/);
  });

  it('refuses two versions sharing a number within one deliverable', async () => {
    await db.sql.query(
      `insert into deliverables (id, project_id, title, created_by, created_at)
       values ('deliv-d', $1, 'Thing', $2, $3)`,
      [SEED.acmeProject, SEED.developer, new Date(T0)],
    );
    await db.sql.query(
      `insert into deliverable_versions
         (id, deliverable_id, number, summary, published_by, published_at)
       values ('ver-d1', 'deliv-d', 1, 'v1', $1, $2)`,
      [SEED.developer, new Date(T0)],
    );

    await expect(
      db.sql.query(
        `insert into deliverable_versions
           (id, deliverable_id, number, summary, published_by, published_at)
         values ('ver-d2', 'deliv-d', 1, 'clash', $1, $2)`,
        [SEED.developer, new Date(T0)],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('refuses two events sharing a sequence number within one project', async () => {
    await db.sql.query(
      `insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
       values ('ev-s1', $1, 1, 'chat.message_posted', $2, $3, $4)`,
      [
        SEED.acmeProject,
        SEED.developer,
        new Date(T0),
        JSON.stringify({ messageId: 'm1', body: 'first' }),
      ],
    );

    await expect(
      db.sql.query(
        `insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
         values ('ev-s2', $1, 1, 'chat.message_posted', $2, $3, $4)`,
        [
          SEED.acmeProject,
          SEED.developer,
          new Date(T0),
          JSON.stringify({ messageId: 'm2', body: 'clash' }),
        ],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows the same sequence number in different projects', async () => {
    await db.sql.query(
      `insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
       values ('ev-g1', $1, 1, 'chat.message_posted', $2, $3, $4)`,
      [
        SEED.globexProject,
        SEED.developer,
        new Date(T0),
        JSON.stringify({ messageId: 'm1', body: 'globex' }),
      ],
    );

    const rows = await db.sql.query('select id from timeline_events where seq = 1');
    expect(rows.length).toBe(2);
  });
});
