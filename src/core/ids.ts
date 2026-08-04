/**
 * Branded identifier types.
 *
 * Every entity id is a `string` at runtime but a distinct type at compile time,
 * so passing a `ProjectId` where a `UserId` is expected is a type error. This
 * matters in a multi-tenant system where mixing up ids silently crosses a
 * tenancy boundary rather than crashing.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type MembershipId = Brand<string, 'MembershipId'>;
export type GrantId = Brand<string, 'GrantId'>;
export type EventId = Brand<string, 'EventId'>;
export type DeliverableId = Brand<string, 'DeliverableId'>;
export type DeliverableVersionId = Brand<string, 'DeliverableVersionId'>;
export type DecisionId = Brand<string, 'DecisionId'>;
export type FeedbackId = Brand<string, 'FeedbackId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;

/**
 * Casts a raw string into a branded id. Use only at system boundaries —
 * when reading from the database, parsing a request, or in tests. Domain code
 * should receive already-branded ids.
 */
export const asId = <T extends string>(raw: string): Brand<string, T> =>
  raw as Brand<string, T>;
