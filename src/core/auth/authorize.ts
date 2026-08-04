import { capabilitiesForRole, type Capability, roleSide } from './capabilities';
import {
  isGrantActive,
  grantStatus,
  projectScope,
  scopeCovers,
  type Grant,
  type GrantScope,
} from './grant';
import { isMembershipActive, type Membership } from '../project/membership';
import { organizationSide, type Project } from '../project/project';
import type { User } from '../org/user';
import type { Timestamp } from '../time';
import { err, ok, type Result } from '../result';
import type { AuthorizationDenial } from '../errors';

/**
 * Everything needed to make a permission decision, passed explicitly.
 *
 * `authorize` performs no I/O — the caller loads the membership and grants and
 * hands them in. That keeps the rule itself trivially testable and forces the
 * data-loading concern to live in one adapter rather than being smeared across
 * every guarded action.
 */
export type AuthorizationRequest = {
  readonly user: User;
  readonly project: Project;
  /** The actor's membership in this project, or `null` if they have none. */
  readonly membership: Membership | null;
  /** Grants issued to this actor. Grants for other users are ignored. */
  readonly grants: readonly Grant[];
  readonly capability: Capability;
  /** Defaults to project scope when omitted. */
  readonly scope?: GrantScope;
  readonly now: Timestamp;
};

export type AuthorizationGrantSource =
  | { readonly via: 'role'; readonly role: Membership['role'] }
  | { readonly via: 'grant'; readonly grant: Grant };

/**
 * The single chokepoint for permission decisions.
 *
 * Order matters. Tenancy is checked before anything else so that a user from an
 * unrelated organization is rejected as `cross_tenant` regardless of what
 * grants happen to reference them — a grant pointing at a foreign user is a
 * data bug, and it must never widen access.
 *
 * Denial reasons are specific (`grant_expired` vs `grant_revoked` vs
 * `capability_not_granted`) because the UI needs to distinguish "your control
 * session ended" from "you were never allowed to do this".
 */
export const authorize = (
  request: AuthorizationRequest,
): Result<AuthorizationGrantSource, AuthorizationDenial> => {
  const { user, project, membership, grants, capability, now } = request;
  const scope = request.scope ?? projectScope();

  if (organizationSide(project, user.organizationId) === null) {
    return err({ kind: 'cross_tenant', capability });
  }

  if (membership === null || !isMembershipActive(membership, now)) {
    return err({ kind: 'not_a_member', capability });
  }

  // A membership belonging to a different project (or a different user) can
  // never authorize this request.
  if (membership.projectId !== project.id || membership.userId !== user.id) {
    return err({ kind: 'cross_tenant', capability });
  }

  // Role capabilities are project-wide by definition, so they only satisfy a
  // request when the role actually carries the capability.
  if (capabilitiesForRole(membership.role).has(capability)) {
    return ok({ via: 'role', role: membership.role });
  }

  const relevant = grants.filter(
    (grant) =>
      grant.subjectUserId === user.id &&
      grant.projectId === project.id &&
      grant.capability === capability,
  );

  if (relevant.length === 0) {
    return err({ kind: 'capability_not_granted', capability });
  }

  const inScope = relevant.filter((grant) => scopeCovers(grant.scope, scope));

  if (inScope.length === 0) {
    return err({ kind: 'scope_mismatch', capability });
  }

  const active = inScope.find((grant) => isGrantActive(grant, now));
  if (active !== undefined) {
    return ok({ via: 'grant', grant: active });
  }

  // Nothing active: report why the most recently issued in-scope grant failed,
  // which is the one the user most likely just tried to use.
  const mostRecent = inScope.reduce((latest, grant) =>
    grant.grantedAt > latest.grantedAt ? grant : latest,
  );

  return err({
    kind:
      grantStatus(mostRecent, now) === 'revoked' ? 'grant_revoked' : 'grant_expired',
    capability,
  });
};

/** Boolean convenience wrapper for call sites that do not need the reason. */
export const can = (request: AuthorizationRequest): boolean => authorize(request).ok;

/**
 * Guards a membership against its organization side, e.g. a user in the client
 * org must not hold `vendor_developer`. Enforced when memberships are created.
 */
export const isRoleValidForSide = (
  role: Membership['role'],
  side: 'vendor' | 'client',
): boolean => {
  const required = roleSide(role);
  return required === 'either' || required === side;
};
