/**
 * Domain error taxonomy.
 *
 * Errors are discriminated by `kind` so callers can branch exhaustively and so
 * the transport layer can map them to status codes in one place later.
 */

import type { Capability } from './auth/capabilities';

export type AuthorizationDenial =
  | { readonly kind: 'not_a_member'; readonly capability: Capability }
  | { readonly kind: 'cross_tenant'; readonly capability: Capability }
  | { readonly kind: 'capability_not_granted'; readonly capability: Capability }
  | { readonly kind: 'grant_expired'; readonly capability: Capability }
  | { readonly kind: 'grant_revoked'; readonly capability: Capability }
  | { readonly kind: 'scope_mismatch'; readonly capability: Capability };

export type InvariantViolation = {
  readonly kind: 'invariant_violation';
  readonly rule: string;
  readonly detail: string;
};

export type DomainError = AuthorizationDenial | InvariantViolation;

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
  }
};
