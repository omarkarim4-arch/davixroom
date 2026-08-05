import type { OrganizationId, UserId } from '../ids';
import type { OrganizationRole } from '../auth/organization-capabilities';

/**
 * A person. Every user belongs to exactly one organization; collaboration
 * happens by joining projects, never by belonging to two tenants at once.
 *
 * `organizationRole` is the team-level standing — who may create projects and
 * enlarge the team. It is deliberately separate from the project `Role` on a
 * membership: being an owner of the organization grants nothing inside a
 * project you have not been added to.
 */
export type User = {
  readonly id: UserId;
  readonly organizationId: OrganizationId;
  readonly organizationRole: OrganizationRole;
  readonly displayName: string;
  readonly email: string;
};
