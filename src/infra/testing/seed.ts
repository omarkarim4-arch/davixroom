import type { SqlExecutor } from '@/core/ports/sql';
import { T0 } from '@/core/testing/doubles';

/**
 * A two-tenant fixture used across the integration tests.
 *
 * One vendor builds for two *different* clients. That shape is what makes
 * cross-tenant assertions meaningful: Acme and Globex share a vendor, so if
 * isolation were keyed on the vendor org rather than the project, the tests
 * would catch it.
 *
 * Seeding runs as the superuser, before any role switch, so it bypasses RLS.
 */
export const SEED = {
  vendorOrg: 'org-vendor',
  acmeOrg: 'org-acme',
  globexOrg: 'org-globex',

  developer: 'user-dev',
  vendorOwner: 'user-owner',
  acmeApprover: 'user-acme-approver',
  acmeReviewer: 'user-acme-reviewer',
  globexApprover: 'user-globex-approver',
  strangerUser: 'user-stranger',

  acmeProject: 'project-acme',
  globexProject: 'project-globex',
} as const;

/**
 * Authentication subjects, one per seeded user.
 *
 * Tests act as one of these — the value goes into `request.jwt.claims.sub`,
 * and `app.current_user_id()` resolves it back to the domain user id. Fixed
 * uuids keep failures readable.
 */
export const AUTH = {
  developer: '00000000-0000-0000-0000-000000000001',
  vendorOwner: '00000000-0000-0000-0000-000000000002',
  acmeApprover: '00000000-0000-0000-0000-000000000003',
  acmeReviewer: '00000000-0000-0000-0000-000000000004',
  globexApprover: '00000000-0000-0000-0000-000000000005',
  strangerUser: '00000000-0000-0000-0000-000000000006',
  /** A valid subject with no matching domain user. */
  unlinked: '00000000-0000-0000-0000-0000000000ff',
} as const;

export const seedFixture = async (sql: SqlExecutor): Promise<void> => {
  const at = new Date(T0);

  await sql.query(
    `insert into organizations (id, kind, name) values
       ($1, 'vendor', 'Davix Software'),
       ($2, 'client', 'Acme'),
       ($3, 'client', 'Globex')`,
    [SEED.vendorOrg, SEED.acmeOrg, SEED.globexOrg],
  );

  // Authentication subjects must exist before users can reference them.
  await sql.query(
    `insert into auth.users (id, email) values
       ($1, 'dev@davix.test'),
       ($2, 'owner@davix.test'),
       ($3, 'approver@acme.test'),
       ($4, 'reviewer@acme.test'),
       ($5, 'approver@globex.test'),
       ($6, 'stranger@globex.test'),
       ($7, 'unlinked@davix.test')`,
    [
      AUTH.developer,
      AUTH.vendorOwner,
      AUTH.acmeApprover,
      AUTH.acmeReviewer,
      AUTH.globexApprover,
      AUTH.strangerUser,
      AUTH.unlinked,
    ],
  );

  await sql.query(
    `insert into users (id, organization_id, display_name, email, auth_user_id) values
       ($1,  $7, 'Dev One',         'dev@davix.test',       $10),
       ($2,  $7, 'Owner',           'owner@davix.test',     $11),
       ($3,  $8, 'Acme Approver',   'approver@acme.test',   $12),
       ($4,  $8, 'Acme Reviewer',   'reviewer@acme.test',   $13),
       ($5,  $9, 'Globex Approver', 'approver@globex.test', $14),
       ($6,  $9, 'Globex Stranger', 'stranger@globex.test', $15)`,
    [
      SEED.developer,
      SEED.vendorOwner,
      SEED.acmeApprover,
      SEED.acmeReviewer,
      SEED.globexApprover,
      SEED.strangerUser,
      SEED.vendorOrg,
      SEED.acmeOrg,
      SEED.globexOrg,
      AUTH.developer,
      AUTH.vendorOwner,
      AUTH.acmeApprover,
      AUTH.acmeReviewer,
      AUTH.globexApprover,
      AUTH.strangerUser,
    ],
  );

  await sql.query(
    `insert into projects
       (id, vendor_organization_id, client_organization_id, name, status, created_at) values
       ($1, $3, $4, 'Acme Rebuild', 'active', $5),
       ($2, $3, $6, 'Globex Portal', 'active', $5)`,
    [
      SEED.acmeProject,
      SEED.globexProject,
      SEED.vendorOrg,
      SEED.acmeOrg,
      at,
      SEED.globexOrg,
    ],
  );

  await sql.query(
    `insert into memberships (id, project_id, user_id, role, joined_at) values
       ('m-1', $1, $3, 'vendor_developer', $8),
       ('m-2', $1, $4, 'vendor_owner',     $8),
       ('m-3', $1, $5, 'client_approver',  $8),
       ('m-4', $1, $6, 'client_reviewer',  $8),
       ('m-5', $2, $3, 'vendor_developer', $8),
       ('m-6', $2, $7, 'client_approver',  $8)`,
    [
      SEED.acmeProject,
      SEED.globexProject,
      SEED.developer,
      SEED.vendorOwner,
      SEED.acmeApprover,
      SEED.acmeReviewer,
      SEED.globexApprover,
      new Date(T0),
    ],
  );
};
