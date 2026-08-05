import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/database';
import { AUTH, SEED, seedFixture } from '../testing/seed';
import type { SqlRow } from '@/core/ports/sql';

/**
 * The onboarding write path, asserted against real Postgres as `authenticated`.
 *
 * These functions are SECURITY DEFINER and therefore bypass row level security,
 * which makes validating the caller their entire job. Every test here is really
 * asking the same question: can a signed-in stranger reach something that is
 * not theirs?
 *
 * A fresh database per test rather than per file — these mutate organizations,
 * users and projects, so shared state between cases would let one test's writes
 * satisfy another's preconditions.
 */

const NEW_VENDOR = '00000000-0000-0000-0000-0000000000a1';
const NEW_CLIENT = '00000000-0000-0000-0000-0000000000a2';
const UNCONFIRMED = '00000000-0000-0000-0000-0000000000a3';

const call = async <T extends SqlRow>(
  db: TestDatabase,
  subject: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<readonly T[]> => db.withUser(subject, (scoped) => scoped.query<T>(sql, params));

/** The single value a `select app.fn(...)` returns, as the acting subject. */
const callScalar = async (
  db: TestDatabase,
  subject: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<string> => {
  const [row] = await call(db, subject, sql, params);
  if (row === undefined) throw new Error(`No row returned by: ${sql}`);
  return String(Object.values(row)[0]);
};

const HOUR = 60 * 60 * 1000;
const hoursFromNow = (hours: number): Date => new Date(Date.now() + hours * HOUR);

describe('onboarding write path', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
    await seedFixture(db.sql);

    await db.sql.query(
      `insert into auth.users (id, email, email_confirmed_at) values
         ($1, 'founder@newvendor.test', $4),
         ($2, 'buyer@newclient.test',   $4),
         ($3, 'pending@newclient.test', null)`,
      [NEW_VENDOR, NEW_CLIENT, UNCONFIRMED, new Date()],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  describe('bootstrap_organization', () => {
    it('creates a vendor organization and makes the caller its owner', async () => {
      await call(db, NEW_VENDOR, 'select app.bootstrap_organization($1, $2)', [
        'New Vendor Co',
        'Founder',
      ]);

      const [row] = await db.sql.query<{
        kind: string;
        name: string;
        organization_role: string;
        email: string;
      }>(
        `select o.kind, o.name, u.organization_role, u.email
           from users u join organizations o on o.id = u.organization_id
          where u.auth_user_id = $1`,
        [NEW_VENDOR],
      );

      expect(row).toEqual({
        kind: 'vendor',
        name: 'New Vendor Co',
        organization_role: 'org_owner',
        // Taken from the verified auth record, never from the form.
        email: 'founder@newvendor.test',
      });
    });

    it('refuses a second organization for the same account', async () => {
      await call(db, NEW_VENDOR, 'select app.bootstrap_organization($1, $2)', [
        'First',
        'Founder',
      ]);

      await expect(
        call(db, NEW_VENDOR, 'select app.bootstrap_organization($1, $2)', [
          'Second',
          'Founder',
        ]),
      ).rejects.toThrow(/already_onboarded/);

      const orphans = await db.sql.query(
        `select id from organizations where name = 'Second'`,
      );
      expect(orphans).toEqual([]);
    });

    it('refuses a caller with no verified subject', async () => {
      await expect(
        db.sql.query('select app.bootstrap_organization($1, $2)', ['Nobody Co', 'X']),
      ).rejects.toThrow(/not_authenticated/);
    });

    it('refuses when the address already belongs to a DavixRoom user', async () => {
      await db.sql.query(
        `insert into auth.users (id, email, email_confirmed_at)
         values ('00000000-0000-0000-0000-0000000000b1', 'dev@davix.test', $1)`,
        [new Date()],
      );

      await expect(
        call(
          db,
          '00000000-0000-0000-0000-0000000000b1',
          'select app.bootstrap_organization($1, $2)',
          ['Impostor Co', 'Impostor'],
        ),
      ).rejects.toThrow(/email_taken/);
    });
  });

  describe('create_project', () => {
    it('creates the client org, project, membership and timeline atomically', async () => {
      const projectId = await callScalar(
        db,
        AUTH.vendorOwner,
        'select app.create_project($1, $2)',
        ['Portal Rebuild', 'Initech'],
      );

      const [project] = await db.sql.query<{
        name: string;
        vendor_organization_id: string;
        client_kind: string;
        client_name: string;
      }>(
        `select p.name, p.vendor_organization_id, c.kind as client_kind, c.name as client_name
           from projects p join organizations c on c.id = p.client_organization_id
          where p.id = $1`,
        [projectId],
      );

      expect(project).toEqual({
        name: 'Portal Rebuild',
        vendor_organization_id: SEED.vendorOrg,
        client_kind: 'client',
        client_name: 'Initech',
      });

      const [membership] = await db.sql.query<{ role: string; user_id: string }>(
        'select role, user_id from memberships where project_id = $1',
        [projectId],
      );
      expect(membership).toEqual({ role: 'vendor_owner', user_id: SEED.vendorOwner });

      const events = await db.sql.query<{ type: string; seq: string }>(
        'select type, seq::text as seq from timeline_events where project_id = $1 order by seq',
        [projectId],
      );
      expect(events).toEqual([
        { type: 'project.created', seq: '1' },
        { type: 'member.joined', seq: '2' },
      ]);
    });

    /**
     * The membership is what makes the project reachable. If it were written
     * separately and failed, the row would exist and be invisible to everyone
     * forever — unfindable, unjoinable, undeletable.
     */
    it('leaves the creator able to see the project through row level security', async () => {
      const projectId = await callScalar(
        db,
        AUTH.vendorOwner,
        'select app.create_project($1, $2)',
        ['Portal Rebuild', 'Initech'],
      );

      const visible = await call<{ id: string }>(
        db,
        AUTH.vendorOwner,
        'select id from projects where id = $1',
        [projectId],
      );
      expect(visible).toEqual([{ id: projectId }]);
    });

    it('refuses a plain team member', async () => {
      await expect(
        call(db, AUTH.developer, 'select app.create_project($1, $2)', ['X', 'Y']),
      ).rejects.toThrow(/forbidden/);
    });

    it('refuses a client organization outright', async () => {
      // Acme's approver is org_owner of Acme, so role alone would let them
      // through. Being a client is what stops it.
      await expect(
        call(db, AUTH.acmeApprover, 'select app.create_project($1, $2)', ['X', 'Y']),
      ).rejects.toThrow(/client_organization/);
    });

    it('refuses a caller with no DavixRoom user', async () => {
      await expect(
        call(db, AUTH.unlinked, 'select app.create_project($1, $2)', ['X', 'Y']),
      ).rejects.toThrow(/not_authenticated/);
    });

    it('reuses a client organization the vendor already delivers to', async () => {
      const projectId = await callScalar(
        db,
        AUTH.vendorOwner,
        'select app.create_project($1, null, $2)',
        ['Second Acme Project', SEED.acmeOrg],
      );

      const [row] = await db.sql.query<{ client_organization_id: string }>(
        'select client_organization_id from projects where id = $1',
        [projectId],
      );
      expect(row?.client_organization_id).toBe(SEED.acmeOrg);
    });

    it('refuses to attach an organization the vendor has never worked with', async () => {
      // Otherwise a guessed organization id becomes a read path into that
      // tenant, since creating the project also creates a membership.
      await db.sql.query(
        `insert into organizations (id, kind, name)
         values ('org-unrelated', 'client', 'Unrelated')`,
      );

      await expect(
        call(db, AUTH.vendorOwner, 'select app.create_project($1, null, $2)', [
          'Sneaky',
          'org-unrelated',
        ]),
      ).rejects.toThrow(/unknown_client/);
    });

    it('requires exactly one of a new or existing client organization', async () => {
      await expect(
        call(db, AUTH.vendorOwner, 'select app.create_project($1, null, null)', ['X']),
      ).rejects.toThrow(/invalid_input/);

      await expect(
        call(db, AUTH.vendorOwner, 'select app.create_project($1, $2, $3)', [
          'X',
          'Both',
          SEED.acmeOrg,
        ]),
      ).rejects.toThrow(/invalid_input/);
    });
  });

  describe('create_invitation', () => {
    const invite = (
      subject: string,
      role: string,
      email = 'buyer@newclient.test',
      hash = 'hash-1',
    ) =>
      call<{ create_invitation: string }>(
        db,
        subject,
        'select app.create_invitation($1, $2, $3, $4, $5)',
        [SEED.acmeProject, email, role, hash, hoursFromNow(48)],
      );

    it('sends a client invitation into the project’s client organization', async () => {
      await invite(AUTH.vendorOwner, 'client_approver');

      const [row] = await db.sql.query<{
        organization_id: string;
        role: string;
        email: string;
      }>('select organization_id, role, email from invitations');

      expect(row).toEqual({
        organization_id: SEED.acmeOrg,
        role: 'client_approver',
        // Normalised on the way in, so the acceptance check cannot be dodged
        // by varying case.
        email: 'buyer@newclient.test',
      });
    });

    it('normalises a mixed-case address', async () => {
      await invite(AUTH.vendorOwner, 'client_reviewer', '  BUYER@NewClient.TEST ');

      const [row] = await db.sql.query<{ email: string }>('select email from invitations');
      expect(row?.email).toBe('buyer@newclient.test');
    });

    it('refuses the client side', async () => {
      await expect(invite(AUTH.acmeApprover, 'client_reviewer')).rejects.toThrow(
        /only the vendor side invites/,
      );
    });

    it('refuses a non-member of the project', async () => {
      await expect(invite(AUTH.globexApprover, 'client_reviewer')).rejects.toThrow(
        /not a member/,
      );
    });

    it('refuses an unknown role', async () => {
      await expect(invite(AUTH.vendorOwner, 'superuser')).rejects.toThrow(
        /invalid_input/,
      );
    });

    it('refuses an expiry in the past', async () => {
      await expect(
        call(db, AUTH.vendorOwner, 'select app.create_invitation($1,$2,$3,$4,$5)', [
          SEED.acmeProject,
          'buyer@newclient.test',
          'client_reviewer',
          'hash-past',
          hoursFromNow(-1),
        ]),
      ).rejects.toThrow(/invalid_input/);
    });

    it('refuses a second open invitation to the same address', async () => {
      await invite(AUTH.vendorOwner, 'client_reviewer', 'buyer@newclient.test', 'h1');

      await expect(
        invite(AUTH.vendorOwner, 'client_approver', 'buyer@newclient.test', 'h2'),
      ).rejects.toThrow();
    });
  });

  describe('accept_invitation', () => {
    const openInvitation = async (overrides: {
      email?: string;
      hash?: string;
      role?: string;
      createdAt?: Date;
      expiresAt?: Date;
      organizationId?: string;
    }): Promise<void> => {
      // Rows are inserted directly rather than through create_invitation so a
      // test can produce states the function refuses to create — an already
      // expired window, for one. `invitations_window` still applies, so an
      // expired fixture has to be backdated rather than given a past expiry.
      await db.sql.query(
        `insert into invitations
           (id, organization_id, project_id, role, email, token_hash, invited_by,
            created_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $9, $8)`,
        [
          `inv-${overrides.hash ?? 'default'}`,
          overrides.organizationId ?? SEED.acmeOrg,
          SEED.acmeProject,
          overrides.role ?? 'client_approver',
          overrides.email ?? 'buyer@newclient.test',
          overrides.hash ?? 'hash-default',
          SEED.vendorOwner,
          overrides.expiresAt ?? hoursFromNow(48),
          overrides.createdAt ?? new Date(),
        ],
      );
    };

    it('creates the user, the membership and a member.joined event', async () => {
      await openInvitation({});

      const projectId = await callScalar(
        db,
        NEW_CLIENT,
        'select app.accept_invitation($1, $2)',
        ['hash-default', 'Buyer'],
      );

      expect(projectId).toBe(SEED.acmeProject);

      const [user] = await db.sql.query<{
        organization_id: string;
        organization_role: string;
        display_name: string;
      }>(
        `select organization_id, organization_role, display_name
           from users where auth_user_id = $1`,
        [NEW_CLIENT],
      );
      expect(user).toEqual({
        organization_id: SEED.acmeOrg,
        // Joining by invitation never confers standing over the organization.
        organization_role: 'org_member',
        display_name: 'Buyer',
      });

      const [membership] = await db.sql.query<{ role: string }>(
        `select m.role from memberships m join users u on u.id = m.user_id
          where u.auth_user_id = $1 and m.project_id = $2`,
        [NEW_CLIENT, SEED.acmeProject],
      );
      expect(membership?.role).toBe('client_approver');

      const joined = await db.sql.query<{ type: string }>(
        `select type from timeline_events
          where project_id = $1 and type = 'member.joined'`,
        [SEED.acmeProject],
      );
      expect(joined).toHaveLength(1);
    });

    it('lets the invitee see that project and nothing else', async () => {
      await openInvitation({});
      await call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
        'hash-default',
        'Buyer',
      ]);

      const visible = await call<{ id: string }>(
        db,
        NEW_CLIENT,
        'select id from projects order by id',
      );
      expect(visible.map((row) => row.id)).toEqual([SEED.acmeProject]);
    });

    it('falls back to the local part of the address for a display name', async () => {
      await openInvitation({});
      await call(db, NEW_CLIENT, 'select app.accept_invitation($1, null)', [
        'hash-default',
      ]);

      const [user] = await db.sql.query<{ display_name: string }>(
        'select display_name from users where auth_user_id = $1',
        [NEW_CLIENT],
      );
      expect(user?.display_name).toBe('buyer');
    });

    /**
     * The token is not the credential. A forwarded link is worthless unless you
     * are signed in as the person the invitation names.
     */
    it('refuses somebody signed in as a different address', async () => {
      await openInvitation({ email: 'someone.else@newclient.test' });

      await expect(
        call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
          'hash-default',
          'Buyer',
        ]),
      ).rejects.toThrow(/invitation_invalid/);
    });

    it('refuses an unknown token with the same message as a mismatched one', async () => {
      await expect(
        call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', ['nope', 'Buyer']),
      ).rejects.toThrow(/invitation_invalid/);
    });

    /**
     * Without this, signing up while claiming somebody else's address would be
     * enough to walk into their project.
     */
    it('refuses an unconfirmed address', async () => {
      await openInvitation({ email: 'pending@newclient.test', hash: 'hash-pending' });

      await expect(
        call(db, UNCONFIRMED, 'select app.accept_invitation($1, $2)', [
          'hash-pending',
          'Pending',
        ]),
      ).rejects.toThrow(/email_unconfirmed/);
    });

    it('refuses an expired invitation', async () => {
      await openInvitation({
        hash: 'hash-old',
        createdAt: hoursFromNow(-48),
        expiresAt: hoursFromNow(-1),
      });

      await expect(
        call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
          'hash-old',
          'Buyer',
        ]),
      ).rejects.toThrow(/invitation_expired/);
    });

    it('refuses a revoked invitation', async () => {
      await openInvitation({ hash: 'hash-revoked' });
      await db.sql.query('update invitations set revoked_at = now() where token_hash = $1', [
        'hash-revoked',
      ]);

      await expect(
        call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
          'hash-revoked',
          'Buyer',
        ]),
      ).rejects.toThrow(/invitation_revoked/);
    });

    it('cannot be replayed', async () => {
      await openInvitation({});
      await call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
        'hash-default',
        'Buyer',
      ]);

      await expect(
        call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
          'hash-default',
          'Buyer',
        ]),
      ).rejects.toThrow(/invitation_used/);
    });

    it('refuses to move an existing user into another organization', async () => {
      // The Globex approver already belongs to Globex; accepting an Acme
      // invitation would have to change that, which 0003 forbids outright.
      await openInvitation({
        email: 'approver@globex.test',
        hash: 'hash-cross',
      });

      await expect(
        call(db, AUTH.globexApprover, 'select app.accept_invitation($1, $2)', [
          'hash-cross',
          'Globex',
        ]),
      ).rejects.toThrow(/organization_conflict/);
    });

    it('rejects a role that does not match the side it is issued for', async () => {
      // A vendor role pointed at the client organization. The function refuses
      // rather than writing a membership authorize() would never honour.
      await openInvitation({ hash: 'hash-side', role: 'vendor_developer' });

      await expect(
        call(db, NEW_CLIENT, 'select app.accept_invitation($1, $2)', [
          'hash-side',
          'Buyer',
        ]),
      ).rejects.toThrow(/invalid_input/);
    });
  });

  /**
   * The claim the whole design rests on: these functions are the only way to
   * write onboarding rows. If any direct insert succeeds, the SECURITY DEFINER
   * validation can simply be walked around.
   */
  describe('direct writes', () => {
    it.each([
      ['organizations', `insert into organizations (id, kind, name) values ('x','vendor','X')`],
      [
        'users',
        `insert into users (id, organization_id, display_name, email) values ('x','${SEED.vendorOrg}','X','x@x.test')`,
      ],
      [
        'projects',
        `insert into projects (id, vendor_organization_id, client_organization_id, name, status, created_at) values ('x','${SEED.vendorOrg}','${SEED.acmeOrg}','X','active', now())`,
      ],
      [
        'memberships',
        `insert into memberships (id, project_id, user_id, role, joined_at) values ('x','${SEED.acmeProject}','${SEED.developer}','vendor_owner', now())`,
      ],
      [
        'invitations',
        `insert into invitations (id, organization_id, project_id, role, email, token_hash, invited_by, created_at, expires_at) values ('x','${SEED.acmeOrg}','${SEED.acmeProject}','observer','a@b.test','h','${SEED.vendorOwner}', now(), now() + interval '1 day')`,
      ],
    ])('are refused on %s', async (_table, statement) => {
      await expect(call(db, AUTH.vendorOwner, statement)).rejects.toThrow(/permission/i);
    });
  });
});
