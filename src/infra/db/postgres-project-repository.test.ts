import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresProjectRepository } from './postgres-project-repository';
import { createTestDatabase, type TestDatabase } from '../testing/database';
import { AUTH, SEED, seedFixture } from '../testing/seed';
import { authorize } from '@/core/auth/authorize';
import { sessionScope } from '@/core/auth/grant';
import { asId } from '@/core/ids';
import { MINUTE_MS } from '@/core/time';
import { T0 } from '@/core/testing/doubles';
import type { User } from '@/core/org/user';

const acmeProject = asId<'ProjectId'>(SEED.acmeProject);
const globexProject = asId<'ProjectId'>(SEED.globexProject);
const acmeApprover = asId<'UserId'>(SEED.acmeApprover);
const developer = asId<'UserId'>(SEED.developer);
const sessionId = asId<'SessionId'>('session-1');

const approverUser: User = {
  id: acmeApprover,
  organizationId: asId<'OrganizationId'>(SEED.acmeOrg),
  organizationRole: 'org_owner',
  displayName: 'Acme Approver',
  email: 'approver@acme.test',
};

describe('PostgresProjectRepository', () => {
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
        new Date(T0 + 15 * MINUTE_MS),
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('maps a project row to the domain type', async () => {
    const project = await db.withUser(AUTH.acmeApprover, (sql) =>
      new PostgresProjectRepository(sql).findById(acmeProject),
    );

    expect(project).toEqual({
      id: acmeProject,
      vendorOrganizationId: SEED.vendorOrg,
      clientOrganizationId: SEED.acmeOrg,
      name: 'Acme Rebuild',
      status: 'active',
      createdAt: T0,
    });
  });

  it('returns null for a project outside the caller’s tenancy', async () => {
    // RLS filters the row out, so the repository never sees it — the tenancy
    // boundary is enforced below the application, not by this code.
    const project = await db.withUser(AUTH.acmeApprover, (sql) =>
      new PostgresProjectRepository(sql).findById(globexProject),
    );

    expect(project).toBeNull();
  });

  it('maps a membership row, preserving role and null removal', async () => {
    const membership = await db.withUser(AUTH.acmeApprover, (sql) =>
      new PostgresProjectRepository(sql).findMembership(acmeProject, acmeApprover),
    );

    expect(membership?.role).toBe('client_approver');
    expect(membership?.removedAt).toBeNull();
    expect(membership?.joinedAt).toBe(T0);
  });

  it('returns null when the user has no membership', async () => {
    const membership = await db.withUser(AUTH.acmeApprover, (sql) =>
      new PostgresProjectRepository(sql).findMembership(
        acmeProject,
        asId<'UserId'>(SEED.strangerUser),
      ),
    );

    expect(membership).toBeNull();
  });

  it('maps a session-scoped grant back to its domain shape', async () => {
    const grants = await db.withUser(AUTH.acmeApprover, (sql) =>
      new PostgresProjectRepository(sql).listGrants(acmeProject, acmeApprover),
    );

    expect(grants).toHaveLength(1);
    expect(grants[0]?.scope).toEqual({ kind: 'session', sessionId });
    expect(grants[0]?.capability).toBe('session.control');
    expect(grants[0]?.expiresAt).toBe(T0 + 15 * MINUTE_MS);
    expect(grants[0]?.revokedAt).toBeNull();
  });

  it('feeds authorize() end to end from stored rows', async () => {
    // The full Stage 1 + Stage 2 path: real rows, real mapping, real rule.
    const { project, membership, grants } = await db.withUser(
      AUTH.acmeApprover,
      async (sql) => {
        const repo = new PostgresProjectRepository(sql);
        return {
          project: await repo.findById(acmeProject),
          membership: await repo.findMembership(acmeProject, acmeApprover),
          grants: await repo.listGrants(acmeProject, acmeApprover),
        };
      },
    );

    if (project === null) throw new Error('expected the project to be readable');

    const controlWhileValid = authorize({
      user: approverUser,
      project,
      membership,
      grants,
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + MINUTE_MS,
    });

    const controlAfterExpiry = authorize({
      user: approverUser,
      project,
      membership,
      grants,
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 30 * MINUTE_MS,
    });

    const decisionByRole = authorize({
      user: approverUser,
      project,
      membership,
      grants,
      capability: 'decision.record',
      now: T0,
    });

    expect(controlWhileValid.ok).toBe(true);
    expect(controlAfterExpiry.ok === false && controlAfterExpiry.error.kind).toBe(
      'grant_expired',
    );
    expect(decisionByRole.ok).toBe(true);
  });

  it('reflects a revocation stored in the database', async () => {
    await db.sql.query(`update grants set revoked_at = $1 where id = 'grant-1'`, [
      new Date(T0 + MINUTE_MS),
    ]);

    const { project, membership, grants } = await db.withUser(
      AUTH.acmeApprover,
      async (sql) => {
        const repo = new PostgresProjectRepository(sql);
        return {
          project: await repo.findById(acmeProject),
          membership: await repo.findMembership(acmeProject, acmeApprover),
          grants: await repo.listGrants(acmeProject, acmeApprover),
        };
      },
    );

    if (project === null) throw new Error('expected the project to be readable');

    const result = authorize({
      user: approverUser,
      project,
      membership,
      grants,
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 2 * MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('grant_revoked');
  });

  it('lists grants for the vendor developer separately', async () => {
    const grants = await db.withUser(AUTH.developer, (sql) =>
      new PostgresProjectRepository(sql).listGrants(acmeProject, developer),
    );

    expect(grants).toEqual([]);
  });
});
