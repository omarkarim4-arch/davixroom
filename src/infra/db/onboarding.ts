import { err, ok, type Result } from '@/core/result';
import { asId } from '@/core/ids';
import { DEFAULT_INVITATION_TTL_MS } from '@/core/org/invitation';
import type { Role } from '@/core/auth/capabilities';
import type { SqlExecutor } from '@/core/ports/sql';
import { hashInvitationToken, newInvitationToken } from '../auth/invitation-token';
import { toSqlTimestamp } from './mappers';

/**
 * The onboarding write path.
 *
 * Every function here is a thin call into one of the SECURITY DEFINER functions
 * in migration 0005. Nothing writes a row directly, because nothing can — no
 * INSERT privilege exists on these tables for any application role.
 *
 * Capability checks do not live here either. A server action authorizes with
 * `authorize()` or `authorizeOrganization()` first; these functions add only
 * the structural guarantees the database is willing to enforce for itself.
 */

export type OnboardingErrorCode =
  | 'not_authenticated'
  | 'already_onboarded'
  | 'email_taken'
  | 'email_unconfirmed'
  | 'invalid_input'
  | 'forbidden'
  | 'client_organization'
  | 'unknown_client'
  | 'invitation_invalid'
  | 'invitation_revoked'
  | 'invitation_used'
  | 'invitation_expired'
  | 'organization_conflict'
  | 'conflict'
  | 'unknown';

export type OnboardingError = {
  readonly code: OnboardingErrorCode;
  readonly message: string;
};

const KNOWN_CODES: readonly OnboardingErrorCode[] = [
  'not_authenticated',
  'already_onboarded',
  'email_taken',
  'email_unconfirmed',
  'invalid_input',
  'forbidden',
  'client_organization',
  'unknown_client',
  'invitation_invalid',
  'invitation_revoked',
  'invitation_used',
  'invitation_expired',
  'organization_conflict',
];

/**
 * The SQL functions raise `code: human readable detail`, following the
 * convention migration 0001 established for its triggers. Parsing the prefix
 * keeps one vocabulary across the boundary instead of matching on prose.
 */
const toOnboardingError = (cause: unknown): OnboardingError => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const prefix = message.split(':', 1)[0]?.trim() ?? '';
  const code = KNOWN_CODES.find((known) => known === prefix);

  if (code !== undefined) {
    return { code, message: message.slice(prefix.length + 1).trim() };
  }

  // A unique violation that escaped the explicit checks is almost always a
  // second open invitation to the same address.
  if (/duplicate key|unique constraint/i.test(message)) {
    return { code: 'conflict', message: 'That already exists.' };
  }

  return { code: 'unknown', message };
};

const callFunction = async <T>(
  sql: SqlExecutor,
  statement: string,
  params: readonly unknown[],
  read: (row: Record<string, unknown>) => T,
): Promise<Result<T, OnboardingError>> => {
  try {
    const rows = await sql.query<Record<string, unknown>>(statement, params);
    const row = rows[0];

    if (row === undefined) {
      return err({ code: 'unknown', message: 'The database returned no result.' });
    }

    return ok(read(row));
  } catch (cause) {
    return err(toOnboardingError(cause));
  }
};

export type BootstrapOrganizationInput = {
  readonly organizationName: string;
  readonly displayName: string;
};

/** Registers a vendor organization and makes the caller its owner. */
export const bootstrapOrganization = async (
  sql: SqlExecutor,
  input: BootstrapOrganizationInput,
): Promise<Result<string, OnboardingError>> =>
  callFunction(
    sql,
    'select app.bootstrap_organization($1, $2) as user_id',
    [input.organizationName, input.displayName],
    (row) => String(row.user_id),
  );

export type CreateProjectInput = {
  readonly name: string;
  /** Provide exactly one of these. */
  readonly clientOrganizationName?: string;
  readonly clientOrganizationId?: string;
};

export const createProject = async (
  sql: SqlExecutor,
  input: CreateProjectInput,
): Promise<Result<string, OnboardingError>> =>
  callFunction(
    sql,
    'select app.create_project($1, $2, $3) as project_id',
    [
      input.name,
      input.clientOrganizationName ?? null,
      input.clientOrganizationId ?? null,
    ],
    (row) => String(row.project_id),
  );

export type CreateInvitationInput = {
  readonly projectId: string;
  readonly email: string;
  readonly role: Role;
  readonly ttlMs?: number;
};

export type CreatedInvitation = {
  readonly id: string;
  /**
   * The only moment the raw token exists on the server. It goes into the link
   * and is then unrecoverable — reissuing means creating a new invitation.
   */
  readonly token: string;
  readonly expiresAt: number;
};

export const createInvitation = async (
  sql: SqlExecutor,
  input: CreateInvitationInput,
): Promise<Result<CreatedInvitation, OnboardingError>> => {
  const token = newInvitationToken();
  const expiresAt = Date.now() + (input.ttlMs ?? DEFAULT_INVITATION_TTL_MS);

  const created = await callFunction(
    sql,
    'select app.create_invitation($1, $2, $3, $4, $5) as invitation_id',
    [
      input.projectId,
      input.email,
      input.role,
      hashInvitationToken(token),
      toSqlTimestamp(expiresAt),
    ],
    (row) => String(row.invitation_id),
  );

  return created.ok ? ok({ id: created.value, token, expiresAt }) : created;
};

/** Returns the project the invitee joined, or null for a team invitation. */
export const acceptInvitation = async (
  sql: SqlExecutor,
  token: string,
  displayName: string | null,
): Promise<Result<string | null, OnboardingError>> =>
  callFunction(
    sql,
    'select app.accept_invitation($1, $2) as project_id',
    [hashInvitationToken(token), displayName],
    (row) => (row.project_id === null ? null : String(row.project_id)),
  );

export type CurrentProfile = {
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationKind: 'vendor' | 'client';
  readonly organizationRole: 'org_owner' | 'org_admin' | 'org_member';
  readonly displayName: string;
};

/**
 * The caller's domain profile, or null when they have signed in but not yet
 * joined an organization.
 *
 * That null is the whole onboarding gate: a verified account with no user row
 * is exactly the state `bootstrap_organization` and `accept_invitation` exist
 * to resolve.
 */
export const findCurrentProfile = async (
  sql: SqlExecutor,
): Promise<CurrentProfile | null> => {
  const rows = await sql.query<{
    user_id: string;
    organization_id: string;
    organization_name: string;
    organization_kind: string;
    organization_role: string;
    display_name: string;
  }>(
    `select u.id            as user_id,
            u.organization_id,
            o.name          as organization_name,
            o.kind          as organization_kind,
            u.organization_role,
            u.display_name
       from users u
       join organizations o on o.id = u.organization_id
      where u.id = app.current_user_id()`,
  );

  const row = rows[0];
  if (row === undefined) return null;

  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationKind: row.organization_kind as CurrentProfile['organizationKind'],
    organizationRole: row.organization_role as CurrentProfile['organizationRole'],
    displayName: row.display_name,
  };
};

export type ProjectSummary = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly role: Role;
  readonly counterpartName: string;
};

/**
 * The caller's rooms.
 *
 * No WHERE clause narrows this to the caller — row level security decides which
 * projects come back, and the join to memberships is only there to report the
 * caller's own role in each.
 */
export const listProjectsForCaller = async (
  sql: SqlExecutor,
): Promise<readonly ProjectSummary[]> => {
  const rows = await sql.query<{
    id: string;
    name: string;
    status: string;
    role: string;
    counterpart_name: string;
  }>(
    `select p.id,
            p.name,
            p.status,
            m.role,
            case
              when vendor_org.id = me.organization_id then client_org.name
              else vendor_org.name
            end as counterpart_name
       from projects p
       join memberships m
         on m.project_id = p.id
        and m.user_id = app.current_user_id()
        and (m.removed_at is null or m.removed_at > now())
       join users me on me.id = app.current_user_id()
       join organizations vendor_org on vendor_org.id = p.vendor_organization_id
       join organizations client_org on client_org.id = p.client_organization_id
      order by p.created_at desc`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    role: row.role as Role,
    counterpartName: row.counterpart_name,
  }));
};

export const projectIdFrom = (raw: string) => asId<'ProjectId'>(raw);
