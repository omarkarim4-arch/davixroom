import { asId } from '@/core/ids';
import type { Grant, GrantScope } from '@/core/auth/grant';
import type { Role } from '@/core/auth/capabilities';
import type { Membership } from '@/core/project/membership';
import type { Project, ProjectStatus } from '@/core/project/project';
import type { AnyTimelineEvent, EventType } from '@/core/timeline/event';
import { parseEventPayload, sealEvent } from '@/core/timeline/event';
import type { Timestamp } from '@/core/time';

/**
 * Row shapes and their translation to domain types.
 *
 * Timestamps are `timestamptz` in the database and epoch milliseconds in the
 * domain, so every boundary crossing converts. Event payloads are re-validated
 * on the way out: a row written by an older deployment must still satisfy the
 * schema the current code expects, and finding out at the boundary beats
 * discovering it three layers up.
 */

export const toTimestamp = (value: unknown): Timestamp => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  throw new TypeError(`Cannot convert ${String(value)} to a timestamp`);
};

export const toNullableTimestamp = (value: unknown): Timestamp | null =>
  value === null || value === undefined ? null : toTimestamp(value);

export const toSqlTimestamp = (at: Timestamp): Date => new Date(at);

export const toNullableSqlTimestamp = (at: Timestamp | null): Date | null =>
  at === null ? null : new Date(at);

export type ProjectRow = {
  id: string;
  vendor_organization_id: string;
  client_organization_id: string;
  name: string;
  status: string;
  created_at: unknown;
};

export const toProject = (row: ProjectRow): Project => ({
  id: asId<'ProjectId'>(row.id),
  vendorOrganizationId: asId<'OrganizationId'>(row.vendor_organization_id),
  clientOrganizationId: asId<'OrganizationId'>(row.client_organization_id),
  name: row.name,
  status: row.status as ProjectStatus,
  createdAt: toTimestamp(row.created_at),
});

export type MembershipRow = {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  joined_at: unknown;
  removed_at: unknown;
};

export const toMembership = (row: MembershipRow): Membership => ({
  id: asId<'MembershipId'>(row.id),
  projectId: asId<'ProjectId'>(row.project_id),
  userId: asId<'UserId'>(row.user_id),
  role: row.role as Role,
  joinedAt: toTimestamp(row.joined_at),
  removedAt: toNullableTimestamp(row.removed_at),
});

export type GrantRow = {
  id: string;
  project_id: string;
  subject_user_id: string;
  capability: string;
  scope_kind: string;
  scope_session_id: string | null;
  granted_by: string;
  granted_at: unknown;
  expires_at: unknown;
  revoked_at: unknown;
};

const toScope = (row: GrantRow): GrantScope =>
  row.scope_kind === 'session' && row.scope_session_id !== null
    ? { kind: 'session', sessionId: asId<'SessionId'>(row.scope_session_id) }
    : { kind: 'project' };

export const toGrant = (row: GrantRow): Grant => ({
  id: asId<'GrantId'>(row.id),
  projectId: asId<'ProjectId'>(row.project_id),
  subjectUserId: asId<'UserId'>(row.subject_user_id),
  capability: row.capability as Grant['capability'],
  scope: toScope(row),
  grantedBy: asId<'UserId'>(row.granted_by),
  grantedAt: toTimestamp(row.granted_at),
  expiresAt: toNullableTimestamp(row.expires_at),
  revokedAt: toNullableTimestamp(row.revoked_at),
});

export type TimelineEventRow = {
  id: string;
  project_id: string;
  seq: string | number;
  type: string;
  actor_id: string;
  occurred_at: unknown;
  payload: unknown;
};

/**
 * `seq` is a bigint, which drivers return as a string to avoid precision loss.
 * Project timelines will not approach 2^53 entries, so a number is safe here.
 */
export const toSeq = (value: string | number): number =>
  typeof value === 'number' ? value : Number.parseInt(value, 10);

export const toTimelineEvent = (row: TimelineEventRow): AnyTimelineEvent => {
  const type = row.type as EventType;
  const parsed = parseEventPayload(type, row.payload);

  if (!parsed.success) {
    throw new Error(
      `Stored event ${row.id} of type ${type} has a payload that no longer validates: ${parsed.error.issues
        .map((issue: { message: string }) => issue.message)
        .join('; ')}`,
    );
  }

  return sealEvent({
    id: asId<'EventId'>(row.id),
    projectId: asId<'ProjectId'>(row.project_id),
    seq: toSeq(row.seq),
    type,
    actorId: asId<'UserId'>(row.actor_id),
    occurredAt: toTimestamp(row.occurred_at),
    payload: parsed.data,
  } as AnyTimelineEvent);
};
