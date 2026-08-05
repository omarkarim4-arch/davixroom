import { z } from 'zod';
import type {
  ArtifactId,
  DecisionId,
  DeliverableId,
  DeliverableVersionId,
  EventId,
  FeedbackId,
  GrantId,
  ProjectId,
  SessionId,
  UserId,
} from '../ids';
import type { Timestamp } from '../time';

/**
 * The timeline is the durable record of a project — the substrate that project
 * history, decision review, and AI summaries all read from. Events are append
 * only and never edited: correcting something means appending a new event, so
 * the record of what was known at each point survives.
 *
 * Every capability in the product either appends to this log or reads from it.
 */
export const EVENT_TYPES = [
  'project.created',
  'member.joined',
  'member.removed',
  'deliverable.created',
  'deliverable.version_published',
  'feedback.left',
  'decision.recorded',
  'chat.message_posted',
  'session.started',
  'session.ended',
  'recording.published',
  'summary.generated',
  'grant.issued',
  'grant.revoked',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Payload schemas.
 *
 * These are validated on the way *out* of storage as well as in. An event
 * written by an older version of the code must still parse, so payloads only
 * ever gain optional fields — never change the meaning of an existing one.
 */
export const eventPayloadSchemas = {
  'project.created': z.object({ name: z.string().min(1) }),
  'member.joined': z.object({ userId: z.string(), role: z.string() }),
  'member.removed': z.object({ userId: z.string() }),
  'deliverable.created': z.object({
    deliverableId: z.string(),
    title: z.string().min(1),
  }),
  'deliverable.version_published': z.object({
    deliverableId: z.string(),
    versionId: z.string(),
    versionNumber: z.number().int().positive(),
  }),
  'feedback.left': z.object({
    feedbackId: z.string(),
    versionId: z.string(),
    body: z.string().min(1),
  }),
  'decision.recorded': z.object({
    decisionId: z.string(),
    versionId: z.string(),
    verdict: z.enum(['approved', 'rejected', 'changes_requested']),
  }),
  'chat.message_posted': z.object({
    messageId: z.string(),
    body: z.string().min(1),
  }),
  'session.started': z.object({ sessionId: z.string() }),
  'session.ended': z.object({
    sessionId: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),
  'recording.published': z.object({
    artifactId: z.string(),
    sessionId: z.string(),
  }),
  'summary.generated': z.object({
    fromSeq: z.number().int().nonnegative(),
    toSeq: z.number().int().nonnegative(),
    summary: z.string().min(1),
  }),
  'grant.issued': z.object({
    grantId: z.string(),
    subjectUserId: z.string(),
    capability: z.string(),
    expiresAt: z.number().nullable(),
  }),
  'grant.revoked': z.object({ grantId: z.string() }),
} as const satisfies Record<EventType, z.ZodType>;

export type EventPayloads = {
  [K in EventType]: z.infer<(typeof eventPayloadSchemas)[K]>;
};

/**
 * A single immutable entry in a project's timeline.
 *
 * `seq` is a per-project, gapless, monotonically increasing position. It gives
 * the timeline a total order independent of wall-clock time (which can skew)
 * and lets AI summaries reference an exact range of history.
 */
export type TimelineEvent<K extends EventType = EventType> = {
  readonly id: EventId;
  readonly projectId: ProjectId;
  readonly seq: number;
  readonly type: K;
  readonly actorId: UserId;
  readonly occurredAt: Timestamp;
  readonly payload: EventPayloads[K];
};

export type AnyTimelineEvent = {
  [K in EventType]: TimelineEvent<K>;
}[EventType];

/** Validates a payload against its event type's schema. */
export const parseEventPayload = <K extends EventType>(
  type: K,
  payload: unknown,
): z.ZodSafeParseResult<EventPayloads[K]> =>
  eventPayloadSchemas[type].safeParse(payload) as z.ZodSafeParseResult<
    EventPayloads[K]
  >;

/**
 * Freezes an event so accidental mutation fails loudly in development rather
 * than silently corrupting the record.
 */
/**
 * Generic over the event object rather than over its type parameter, so a
 * concrete `TimelineEvent<K>` and a union `AnyTimelineEvent` both come back
 * unchanged instead of collapsing to a single member of the union.
 */
export const sealEvent = <E extends { readonly payload: unknown }>(event: E): E => {
  Object.freeze(event.payload);
  Object.freeze(event);
  return event;
};

/** Referenced entity ids, kept as a type-level reminder of what events point at. */
export type EventReferences = {
  readonly deliverableId?: DeliverableId;
  readonly versionId?: DeliverableVersionId;
  readonly decisionId?: DecisionId;
  readonly feedbackId?: FeedbackId;
  readonly sessionId?: SessionId;
  readonly artifactId?: ArtifactId;
  readonly grantId?: GrantId;
};
