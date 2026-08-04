import {
  parseEventPayload,
  sealEvent,
  type EventPayloads,
  type EventType,
  type TimelineEvent,
} from './event';
import type { EventId, ProjectId, UserId } from '../ids';
import type { Timestamp } from '../time';
import { err, ok, type Result } from '../result';
import { invariantViolation, type InvariantViolation } from '../errors';

/**
 * Appends an event to a project's timeline.
 *
 * The sequence number is derived from the log rather than supplied by the
 * caller, which is what guarantees the gapless ordering that history views and
 * summary ranges depend on. Concurrency is handled at the storage layer later
 * (a unique constraint on `(project_id, seq)` turns a race into a retry).
 */
export type AppendCommand<K extends EventType> = {
  readonly id: EventId;
  readonly projectId: ProjectId;
  readonly type: K;
  readonly actorId: UserId;
  readonly occurredAt: Timestamp;
  readonly payload: EventPayloads[K];
};

export const nextSeq = (existing: readonly TimelineEvent[]): number =>
  existing.reduce((max, event) => (event.seq > max ? event.seq : max), 0) + 1;

export const appendEvent = <K extends EventType>(
  existing: readonly TimelineEvent[],
  command: AppendCommand<K>,
): Result<TimelineEvent<K>, InvariantViolation> => {
  const parsed = parseEventPayload(command.type, command.payload);
  if (!parsed.success) {
    return err(
      invariantViolation(
        'event.payload_valid',
        `Payload for ${command.type} is invalid: ${parsed.error.issues
          .map((issue: { message: string }) => issue.message)
          .join('; ')}`,
      ),
    );
  }

  const foreign = existing.find((event) => event.projectId !== command.projectId);
  if (foreign !== undefined) {
    return err(
      invariantViolation(
        'event.single_project_log',
        'Cannot append to a log containing events from another project',
      ),
    );
  }

  return ok(
    sealEvent({
      id: command.id,
      projectId: command.projectId,
      seq: nextSeq(existing),
      type: command.type,
      actorId: command.actorId,
      occurredAt: command.occurredAt,
      payload: parsed.data,
    }),
  );
};

/** Events in `[fromSeq, toSeq]`, the range form AI summaries reference. */
export const slice = (
  events: readonly TimelineEvent[],
  fromSeq: number,
  toSeq: number,
): readonly TimelineEvent[] =>
  events
    .filter((event) => event.seq >= fromSeq && event.seq <= toSeq)
    .sort((a, b) => a.seq - b.seq);

/**
 * Verifies the log is a contiguous 1..n run with no duplicates or gaps.
 * Used in tests and as a storage-integrity check later.
 */
export const isContiguous = (events: readonly TimelineEvent[]): boolean => {
  const seqs = events.map((event) => event.seq).sort((a, b) => a - b);
  return seqs.every((seq, index) => seq === index + 1);
};
