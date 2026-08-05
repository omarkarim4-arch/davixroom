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

export const seedFixture = async (sql: SqlExecutor): Promise<void> => {
  const at = new Date(T0);

  await sql.query(
    `insert into organizations (id, kind, name) values
       ($1, 'vendor', 'Davix Software'),
       ($2, 'client', 'Acme'),
       ($3, 'client', 'Globex')`,
    [SEED.vendorOrg, SEED.acmeOrg, SEED.globexOrg],
  );

  await sql.query(
    `insert into users (id, organization_id, display_name, email) values
       ($1, $7, 'Dev One', 'dev@davix.test'),
       ($2, $7, 'Owner', 'owner@davix.test'),
       ($3, $8, 'Acme Approver', 'approver@acme.test'),
       ($4, $8, 'Acme Reviewer', 'reviewer@acme.test'),
       ($5, $9, 'Globex Approver', 'approver@globex.test'),
       ($6, $9, 'Globex Stranger', 'stranger@globex.test')`,
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
