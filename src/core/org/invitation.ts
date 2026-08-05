import type { InvitationId, OrganizationId, ProjectId, UserId } from '../ids';
import type { Role } from '../auth/capabilities';
import type { Timestamp } from '../time';

/**
 * An invitation is the only way anybody joins DavixRoom after the first user of
 * a vendor organization.
 *
 * Two shapes share one type because they share a lifecycle — issue, expire,
 * revoke, accept — and differ only in what accepting produces:
 *
 * - **team**: joins the invitee to an organization. No project, no project
 *   role; they become available to be added to projects later.
 * - **client**: joins the invitee to a client organization *and* to one
 *   project with a client role. This is how a client organization comes into
 *   existence at all, since clients never register themselves.
 *
 * The pair is constrained rather than left conventional: a project invitation
 * without a role could produce a membership with no permissions, and a team
 * invitation carrying one would silently discard it.
 */
export type Invitation = {
  readonly id: InvitationId;
  /** The organization the invitee will belong to once they accept. */
  readonly organizationId: OrganizationId;
  /** Set for a client invitation, null for a team invitation. */
  readonly projectId: ProjectId | null;
  /** Set for a client invitation, null for a team invitation. */
  readonly role: Role | null;
  readonly email: string;
  readonly invitedBy: UserId;
  readonly createdAt: Timestamp;
  readonly expiresAt: Timestamp;
  readonly acceptedAt: Timestamp | null;
  readonly revokedAt: Timestamp | null;
};

export type InvitationKind = 'team' | 'client';

export const invitationKind = (invitation: Invitation): InvitationKind =>
  invitation.projectId === null ? 'team' : 'client';

/**
 * Reported in precedence order, not chronological order.
 *
 * Revocation outranks acceptance so that a revoked-then-somehow-accepted row
 * reads as revoked rather than granting access, and acceptance outranks expiry
 * because an invitation already used does not become unused when its window
 * closes.
 */
export type InvitationStatus = 'revoked' | 'accepted' | 'expired' | 'pending';

export const invitationStatus = (
  invitation: Invitation,
  now: Timestamp,
): InvitationStatus => {
  if (invitation.revokedAt !== null) return 'revoked';
  if (invitation.acceptedAt !== null) return 'accepted';
  if (invitation.expiresAt <= now) return 'expired';
  return 'pending';
};

/** Only a pending invitation may be accepted. */
export const isInvitationOpen = (invitation: Invitation, now: Timestamp): boolean =>
  invitationStatus(invitation, now) === 'pending';

/**
 * Addresses are compared case-insensitively and trimmed.
 *
 * An invitation names the person it is for, and the token alone must never be
 * the credential — otherwise anyone who obtains the link becomes that person.
 * Acceptance therefore checks the address of the *verified* signed-in account
 * against this, and mail addresses do not vary meaningfully by case.
 */
export const invitationMatchesEmail = (
  invitation: Invitation,
  email: string,
): boolean => invitation.email.trim().toLowerCase() === email.trim().toLowerCase();

export const DEFAULT_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
