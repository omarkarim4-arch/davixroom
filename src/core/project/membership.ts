import type { MembershipId, ProjectId, UserId } from '../ids';
import type { Role } from '../auth/capabilities';
import type { Timestamp } from '../time';

/**
 * Binds a user to a project with a role. Absence of a membership is what makes
 * a project invisible to everyone else — there is no global "all projects"
 * view in DavixRoom.
 */
export type Membership = {
  readonly id: MembershipId;
  readonly projectId: ProjectId;
  readonly userId: UserId;
  readonly role: Role;
  readonly joinedAt: Timestamp;
  /** Set when a member is removed; past events retain their attribution. */
  readonly removedAt: Timestamp | null;
};

export const isMembershipActive = (membership: Membership, now: Timestamp): boolean =>
  membership.removedAt === null || membership.removedAt > now;
