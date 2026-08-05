import type { ProjectRepository } from '@/core/ports';
import type { SqlExecutor } from '@/core/ports/sql';
import type { Project } from '@/core/project/project';
import type { Membership } from '@/core/project/membership';
import type { Grant } from '@/core/auth/grant';
import type { ProjectId, UserId } from '@/core/ids';
import {
  toGrant,
  toMembership,
  toProject,
  type GrantRow,
  type MembershipRow,
  type ProjectRow,
} from './mappers';

/**
 * Reads the data `authorize()` needs.
 *
 * Every query is additionally filtered by row level security, so a caller
 * asking for a project outside their tenancy receives no row rather than a
 * denial — the boundary is enforced before this code sees anything.
 */
export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(projectId: ProjectId): Promise<Project | null> {
    const rows = await this.sql.query<ProjectRow>(
      `select id, vendor_organization_id, client_organization_id, name, status, created_at
       from projects
       where id = $1`,
      [projectId],
    );
    const row = rows[0];
    return row === undefined ? null : toProject(row);
  }

  async findMembership(
    projectId: ProjectId,
    userId: UserId,
  ): Promise<Membership | null> {
    const rows = await this.sql.query<MembershipRow>(
      `select id, project_id, user_id, role, joined_at, removed_at
       from memberships
       where project_id = $1 and user_id = $2`,
      [projectId, userId],
    );
    const row = rows[0];
    return row === undefined ? null : toMembership(row);
  }

  async listGrants(projectId: ProjectId, userId: UserId): Promise<readonly Grant[]> {
    const rows = await this.sql.query<GrantRow>(
      `select id, project_id, subject_user_id, capability, scope_kind, scope_session_id,
              granted_by, granted_at, expires_at, revoked_at
       from grants
       where project_id = $1 and subject_user_id = $2
       order by granted_at asc`,
      [projectId, userId],
    );
    return rows.map(toGrant);
  }
}
