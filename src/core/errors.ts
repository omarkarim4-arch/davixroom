/**
 * Domain error taxonomy.
 *
 * Errors are discriminated by `kind` so callers can branch exhaustively and so
 * the transport layer can map them to status codes in one place later.
 */

import type { Capability } from './auth/capabilities';
import type { OrganizationCapability } from './auth/organization-capabilities';

export type AuthorizationDenial =
  | { readonly kind: 'not_a_member'; readonly capability: Capability }
  | { readonly kind: 'cross_tenant'; readonly capability: Capability }
  | { readonly kind: 'capability_not_granted'; readonly capability: Capability }
  | { readonly kind: 'grant_expired'; readonly capability: Capability }
  | { readonly kind: 'grant_revoked'; readonly capability: Capability }
  | { readonly kind: 'scope_mismatch'; readonly capability: Capability };

/**
 * Denials from the organization level, above any project.
 *
 * Kept separate from `AuthorizationDenial` because the capability vocabularies
 * differ; a call site handling one should not silently compile against the
 * other.
 */
export type OrganizationDenial =
  | {
      readonly kind: 'not_in_organization';
      readonly capability: OrganizationCapability;
    }
  | {
      readonly kind: 'client_organization';
      readonly capability: OrganizationCapability;
    }
  | {
      readonly kind: 'organization_capability_not_granted';
      readonly capability: OrganizationCapability;
    };

export type InvariantViolation = {
  readonly kind: 'invariant_violation';
  readonly rule: string;
  readonly detail: string;
};

export type DomainError =
  | AuthorizationDenial
  | OrganizationDenial
  | InvariantViolation;

export const invariantViolation = (
  rule: string,
  detail: string,
): InvariantViolation => ({ kind: 'invariant_violation', rule, detail });

/** Human-readable rendering, for logs and test failure messages. */
export const describeError = (error: DomainError): string => {
  switch (error.kind) {
    case 'invariant_violation':
      return `${error.rule}: ${error.detail}`;
    case 'not_a_member':
      return `Actor is not a member of this project (needed ${error.capability})`;
    case 'cross_tenant':
      return `Actor belongs to a different tenant (needed ${error.capability})`;
    case 'capability_not_granted':
      return `Capability ${error.capability} is not granted`;
    case 'grant_expired':
      return `Grant for ${error.capability} has expired`;
    case 'grant_revoked':
      return `Grant for ${error.capability} was revoked`;
    case 'scope_mismatch':
      return `Grant for ${error.capability} does not cover the requested scope`;
    case 'not_in_organization':
      return `Actor belongs to a different organization (needed ${error.capability})`;
    case 'client_organization':
      return `Client organizations cannot ${error.capability}; they join through invitations`;
    case 'organization_capability_not_granted':
      return `Organization capability ${error.capability} is not granted`;
  }
};
