import type { SqlExecutor } from '@/core/ports/sql';
import type { Role } from '@/core/auth/capabilities';
import type { InvitationStatus } from '@/core/org/invitation';
import { toTimestamp } from './mappers';

/**
 * Read models for the project surface.
 *
 * None of these queries filter by the caller. Row level security decides what
 * comes back — a project the caller does not belong to yields no rows, and its
 * members and invitations are unreachable for the same reason.
 */

export type ProjectMemberView = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: Role;
  readonly organizationName: string;
  readonly side: 'vendor' | 'client';
};

export type ProjectInvitationView = {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly status: InvitationStatus;
  readonly expiresAt: number;
};

export type ProjectView = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly vendorName: string;
  readonly clientName: string;
  readonly createdAt: number;
  readonly members: readonly ProjectMemberView[];
  readonly invitations: readonly ProjectInvitationView[];
};

export const findProjectView = async (
  sql: SqlExecutor,
  projectId: string,
): Promise<ProjectView | null> => {
  const [project] = await sql.query<{
    id: string;
    name: string;
    status: string;
    vendor_name: string;
    client_name: string;
    created_at: unknown;
  }>(
    `select p.id, p.name, p.status,
            v.name as vendor_name,
            c.name as client_name,
            p.created_at
       from projects p
       join organizations v on v.id = p.vendor_organization_id
       join organizations c on c.id = p.client_organization_id
      where p.id = $1`,
    [projectId],
  );

  if (project === undefined) return null;

  const members = await sql.query<{
    user_id: string;
    display_name: string;
    email: string;
    role: string;
    organization_name: string;
    side: string;
  }>(
    `select u.id as user_id, u.display_name, u.email, m.role,
            o.name as organization_name,
            case when o.id = p.vendor_organization_id then 'vendor' else 'client' end as side
       from memberships m
       join users u on u.id = m.user_id
       join organizations o on o.id = u.organization_id
       join projects p on p.id = m.project_id
      where m.project_id = $1
        and (m.removed_at is null or m.removed_at > now())
      order by side, u.display_name`,
    [projectId],
  );

  const invitations = await sql.query<{
    id: string;
    email: string;
    role: string;
    expires_at: unknown;
    accepted_at: unknown;
    revoked_at: unknown;
  }>(
    `select id, email, role, expires_at, accepted_at, revoked_at
       from invitations
      where project_id = $1
      order by created_at desc`,
    [projectId],
  );

  const now = Date.now();

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    vendorName: project.vendor_name,
    clientName: project.client_name,
    createdAt: toTimestamp(project.created_at),
    members: members.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      role: row.role as Role,
      organizationName: row.organization_name,
      side: row.side as 'vendor' | 'client',
    })),
    invitations: invitations.map((row) => {
      const expiresAt = toTimestamp(row.expires_at);
      const status: InvitationStatus =
        row.revoked_at !== null
          ? 'revoked'
          : row.accepted_at !== null
            ? 'accepted'
            : expiresAt <= now
              ? 'expired'
              : 'pending';

      return {
        id: row.id,
        email: row.email,
        role: row.role as Role,
        status,
        expiresAt,
      };
    }),
  };
};
