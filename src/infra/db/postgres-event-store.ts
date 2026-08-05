import { parseEventPayload, sealEvent } from '@/core/timeline/event';
import type { AnyTimelineEvent, EventType, TimelineEvent } from '@/core/timeline/event';
import type { AppendCommand } from '@/core/timeline/event-log';
import type { EventStore } from '@/core/ports';
import { isUniqueViolation, type SqlExecutor } from '@/core/ports/sql';
import { invariantViolation, type InvariantViolation } from '@/core/errors';
import { err, ok, type Result } from '@/core/result';
import type { ProjectId } from '@/core/ids';
import { toSqlTimestamp, toTimelineEvent, type TimelineEventRow } from './mappers';

/** How many times to retry when two appends race for the same sequence number. */
const MAX_APPEND_ATTEMPTS = 5;

/**
 * Append-only timeline storage backed by Postgres.
 *
 * Sequence numbers are allocated by reading the current maximum and inserting
 * at max + 1. Two concurrent appends will compute the same number; the unique
 * constraint on `(project_id, seq)` rejects the loser, which retries and lands
 * on the next position. This keeps the log gapless without serialising every
 * append behind a lock, and contention within a single project is low enough
 * that a handful of attempts is ample.
 */
export class PostgresEventStore implements EventStore {
  constructor(private readonly sql: SqlExecutor) {}

  async append<K extends EventType>(
    command: AppendCommand<K>,
  ): Promise<Result<TimelineEvent<K>, InvariantViolation>> {
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

    for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt += 1) {
      try {
        const rows = await this.sql.query<{ seq: string | number }>(
          `insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
           select $1, $2, coalesce(max(seq), 0) + 1, $3, $4, $5, $6
           from timeline_events
           where project_id = $2
           returning seq`,
          [
            command.id,
            command.projectId,
            command.type,
            command.actorId,
            toSqlTimestamp(command.occurredAt),
            JSON.stringify(parsed.data),
          ],
        );

        const row = rows[0];
        if (row === undefined) {
          return err(
            invariantViolation(
              'event.append_failed',
              'Insert reported success but returned no row',
            ),
          );
        }

        return ok(
          sealEvent({
            id: command.id,
            projectId: command.projectId,
            seq: typeof row.seq === 'number' ? row.seq : Number.parseInt(row.seq, 10),
            type: command.type,
            actorId: command.actorId,
            occurredAt: command.occurredAt,
            payload: parsed.data,
          }),
        );
      } catch (error) {
        // A duplicate id is a caller error and will never succeed on retry;
        // only a contested sequence number is worth attempting again.
        if (!isUniqueViolation(error) || isDuplicateId(error)) {
          throw error;
        }
      }
    }

    return err(
      invariantViolation(
        'event.append_contention',
        `Could not allocate a sequence number after ${MAX_APPEND_ATTEMPTS} attempts`,
      ),
    );
  }

  async read(projectId: ProjectId): Promise<readonly AnyTimelineEvent[]> {
    const rows = await this.sql.query<TimelineEventRow>(
      `select id, project_id, seq, type, actor_id, occurred_at, payload
       from timeline_events
       where project_id = $1
       order by seq asc`,
      [projectId],
    );
    return rows.map(toTimelineEvent);
  }

  async readRange(
    projectId: ProjectId,
    fromSeq: number,
    toSeq: number,
  ): Promise<readonly AnyTimelineEvent[]> {
    const rows = await this.sql.query<TimelineEventRow>(
      `select id, project_id, seq, type, actor_id, occurred_at, payload
       from timeline_events
       where project_id = $1 and seq >= $2 and seq <= $3
       order by seq asc`,
      [projectId, fromSeq, toSeq],
    );
    return rows.map(toTimelineEvent);
  }
}

const isDuplicateId = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'constraint' in error &&
  String((error as { constraint?: unknown }).constraint).includes('pkey');
