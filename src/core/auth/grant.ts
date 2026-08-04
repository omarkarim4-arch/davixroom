import type { Capability } from './capabilities';
import type { GrantId, ProjectId, SessionId, UserId } from '../ids';
import type { Timestamp } from '../time';

/**
 * The scope a grant applies to.
 *
 * Project scope covers ongoing capabilities. Session scope exists so a
 * capability can be handed out for one live session and nothing else — this is
 * what makes temporary remote control safe: control is never granted to a user
 * in general, only to a user *within a specific session*, with an expiry.
 */
export type GrantScope =
  | { readonly kind: 'project' }
  | { readonly kind: 'session'; readonly sessionId: SessionId };

export const projectScope = (): GrantScope => ({ kind: 'project' });

export const sessionScope = (sessionId: SessionId): GrantScope => ({
  kind: 'session',
  sessionId,
});

/**
 * An explicit, attributable, revocable permission.
 *
 * Grants are additive on top of role capabilities and always record who issued
 * them. Every field here exists because the audit trail needs it: a client
 * asking "who gave the developer control of my machine, when, and for how
 * long?" must be answerable from stored data alone.
 */
export type Grant = {
  readonly id: GrantId;
  readonly projectId: ProjectId;
  readonly subjectUserId: UserId;
  readonly capability: Capability;
  readonly scope: GrantScope;
  readonly grantedBy: UserId;
  readonly grantedAt: Timestamp;
  /** `null` means the grant does not expire on its own. */
  readonly expiresAt: Timestamp | null;
  /** Set when a grant is withdrawn early; revocation always wins. */
  readonly revokedAt: Timestamp | null;
};

export type GrantStatus = 'active' | 'expired' | 'revoked';

export const grantStatus = (grant: Grant, now: Timestamp): GrantStatus => {
  // Revocation is checked first: a grant revoked before its expiry should read
  // as revoked, because that distinction matters in an audit log.
  if (grant.revokedAt !== null && grant.revokedAt <= now) {
    return 'revoked';
  }
  if (grant.expiresAt !== null && grant.expiresAt <= now) {
    return 'expired';
  }
  return 'active';
};

export const isGrantActive = (grant: Grant, now: Timestamp): boolean =>
  grantStatus(grant, now) === 'active';

/**
 * Whether a grant's scope covers the scope being requested.
 *
 * A project-scoped grant covers any request within that project, including
 * session requests. A session-scoped grant covers only that exact session —
 * never a different session, and never a project-wide request.
 */
export const scopeCovers = (granted: GrantScope, requested: GrantScope): boolean => {
  if (granted.kind === 'project') {
    return true;
  }
  return requested.kind === 'session' && requested.sessionId === granted.sessionId;
};

export const revoke = (grant: Grant, at: Timestamp): Grant => ({
  ...grant,
  revokedAt: at,
});
