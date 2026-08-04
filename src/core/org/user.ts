import type { OrganizationId, UserId } from '../ids';

/**
 * A person. Every user belongs to exactly one organization; collaboration
 * happens by joining projects, never by belonging to two tenants at once.
 */
export type User = {
  readonly id: UserId;
  readonly organizationId: OrganizationId;
  readonly displayName: string;
  readonly email: string;
};
