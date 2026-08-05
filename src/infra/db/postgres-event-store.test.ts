import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresEventStore } from './postgres-event-store';
import { createTestDatabase, type TestDatabase } from '../testing/database';
import { SEED, seedFixture } from '../testing/seed';
import { isContiguous } from '@/core/timeline/event-log';
import type { SqlExecutor, SqlRow } from '@/core/ports/sql';
import { asId } from '@/core/ids';
import { unwrap } from '@/core/result';
import { T0 } from '@/core/testing/doubles';

const acmeProject = asId<'ProjectId'>(SEED.acmeProject);
const globexProject = asId<'ProjectId'>(SEED.globexProject);
const developer = asId<'UserId'>(SEED.developer);

describe('PostgresEventStore', () => {
  let db: TestDatabase;
  let store: PostgresEventStore;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedFixture(db.sql);
    store = new PostgresEventStore(db.sql);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Truncate rather than delete: the append-only trigger blocks DELETE.
    await db.sql.query('truncate table timeline_events');
  });

  const append = (suffix: string, projectId = acmeProject, body = 'hello') =>
    store.append({
      id: asId<'EventId'>(`ev-${suffix}`),
      projectId,
      type: 'chat.message_posted',
      actorId: developer,
      occurredAt: T0,
      payload: { messageId: `m-${suffix}`, body },
    });

  it('assigns the first event sequence 1', async () => {
    const event = unwrap(await append('1'));
    expect(event.seq).toBe(1);
  });

  it('produces a gapless sequence across many appends', async () => {
    for (let index = 1; index <= 20; index += 1) {
      unwrap(await append(String(index)));
    }

    const events = await store.read(acmeProject);
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(isContiguous(events)).toBe(true);
  });

  it('sequences concurrent appends without duplicates', async () => {
    // Allocation happens inside a single INSERT ... SELECT statement, so the
    // read of max(seq) and the write cannot be separated by another append.
    await Promise.all(Array.from({ length: 15 }, (_, index) => append(`c${index}`)));

    const events = await store.read(acmeProject);
    const seqs = events.map((event) => event.seq);

    expect(new Set(seqs).size).toBe(15);
    expect(isContiguous(events)).toBe(true);
  });

  it('sequences each project independently', async () => {
    unwrap(await append('a1', acmeProject));
    unwrap(await append('g1', globexProject));
    unwrap(await append('a2', acmeProject));

    expect((await store.read(acmeProject)).map((e) => e.seq)).toEqual([1, 2]);
    expect((await store.read(globexProject)).map((e) => e.seq)).toEqual([1]);
  });

  it('rejects an invalid payload before touching the database', async () => {
    const result = await store.append({
      id: asId<'EventId'>('ev-bad'),
      projectId: acmeProject,
      type: 'chat.message_posted',
      actorId: developer,
      occurredAt: T0,
      payload: { messageId: 'm', body: '' },
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.rule).toBe('event.payload_valid');
    expect(await store.read(acmeProject)).toEqual([]);
  });

  it('round-trips payload and timestamp fidelity', async () => {
    const occurredAt = T0 + 1234;
    unwrap(
      await store.append({
        id: asId<'EventId'>('ev-rt'),
        projectId: acmeProject,
        type: 'decision.recorded',
        actorId: developer,
        occurredAt,
        payload: {
          decisionId: 'dec-1',
          versionId: 'ver-1',
          verdict: 'changes_requested',
        },
      }),
    );

    const [event] = await store.read(acmeProject);

    expect(event?.occurredAt).toBe(occurredAt);
    expect(event?.type).toBe('decision.recorded');
    expect(event?.payload).toEqual({
      decisionId: 'dec-1',
      versionId: 'ver-1',
      verdict: 'changes_requested',
    });
  });

  it('returns events sealed against mutation', async () => {
    unwrap(await append('1'));
    const [event] = await store.read(acmeProject);

    expect(Object.isFrozen(event)).toBe(true);
  });

  it('reads an inclusive range for summary generation', async () => {
    for (let index = 1; index <= 6; index += 1) {
      unwrap(await append(String(index)));
    }

    const range = await store.readRange(acmeProject, 2, 4);
    expect(range.map((event) => event.seq)).toEqual([2, 3, 4]);
  });

  it('propagates a duplicate id rather than retrying forever', async () => {
    unwrap(await append('dup'));
    await expect(append('dup')).rejects.toThrow();
  });
});

/**
 * PGlite runs one connection, so a genuine two-writer race cannot be staged
 * against it. These stubs drive the retry path directly, which is the part of
 * the adapter that a real race would exercise.
 */
describe('PostgresEventStore — sequence contention', () => {
  class StubExecutor implements SqlExecutor {
    public attempts = 0;

    constructor(private readonly failures: number) {}

    async query<R extends SqlRow>(): Promise<R[]> {
      this.attempts += 1;
      if (this.attempts <= this.failures) {
        throw Object.assign(new Error('duplicate key value'), {
          code: '23505',
          constraint: 'timeline_events_project_id_seq_key',
        });
      }
      return [{ seq: String(this.attempts) } as unknown as R];
    }

    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      return fn(this);
    }
  }

  const command = {
    id: asId<'EventId'>('ev-1'),
    projectId: acmeProject,
    type: 'chat.message_posted' as const,
    actorId: developer,
    occurredAt: T0,
    payload: { messageId: 'm1', body: 'hi' },
  };

  it('retries when the sequence number is taken, then succeeds', async () => {
    const executor = new StubExecutor(2);
    const result = await new PostgresEventStore(executor).append(command);

    expect(result.ok).toBe(true);
    expect(executor.attempts).toBe(3);
  });

  it('gives up with a clear error after repeated contention', async () => {
    const executor = new StubExecutor(99);
    const result = await new PostgresEventStore(executor).append(command);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.rule).toBe('event.append_contention');
    expect(executor.attempts).toBe(5);
  });

  it('does not retry a duplicate primary key', async () => {
    class DuplicateIdExecutor implements SqlExecutor {
      public attempts = 0;
      async query<R extends SqlRow>(): Promise<R[]> {
        this.attempts += 1;
        throw Object.assign(new Error('duplicate key value'), {
          code: '23505',
          constraint: 'timeline_events_pkey',
        });
      }
      async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
        return fn(this);
      }
    }

    const executor = new DuplicateIdExecutor();
    await expect(new PostgresEventStore(executor).append(command)).rejects.toThrow();
    expect(executor.attempts).toBe(1);
  });
});
