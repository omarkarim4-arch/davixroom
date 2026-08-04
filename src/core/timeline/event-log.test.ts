import { describe, expect, it } from 'vitest';
import { appendEvent, isContiguous, nextSeq, slice } from './event-log';
import type { AnyTimelineEvent } from './event';
import { asId } from '../ids';
import { unwrap } from '../result';
import { T0, InMemoryEventStore } from '../testing/doubles';

const projectId = asId<'ProjectId'>('project-1');
const actorId = asId<'UserId'>('user-1');

const append = (log: readonly AnyTimelineEvent[], suffix: string, body = 'hello') =>
  appendEvent(log, {
    id: asId<'EventId'>(`event-${suffix}`),
    projectId,
    type: 'chat.message_posted',
    actorId,
    occurredAt: T0,
    payload: { messageId: `msg-${suffix}`, body },
  });

describe('appendEvent', () => {
  it('assigns sequence numbers starting at 1', () => {
    const first = unwrap(append([], '1'));
    expect(first.seq).toBe(1);
  });

  it('produces a gapless, monotonic sequence', () => {
    const log: AnyTimelineEvent[] = [];
    for (let index = 1; index <= 25; index += 1) {
      log.push(unwrap(append(log, String(index))) as AnyTimelineEvent);
    }

    expect(log.map((event) => event.seq)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(isContiguous(log)).toBe(true);
  });

  it('rejects a payload that fails its schema', () => {
    const result = appendEvent([], {
      id: asId<'EventId'>('event-bad'),
      projectId,
      type: 'chat.message_posted',
      actorId,
      occurredAt: T0,
      // Empty body violates the schema's min(1).
      payload: { messageId: 'msg-1', body: '' },
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.rule).toBe('event.payload_valid');
  });

  it('validates decision verdicts against the allowed set', () => {
    const result = appendEvent([], {
      id: asId<'EventId'>('event-bad'),
      projectId,
      type: 'decision.recorded',
      actorId,
      occurredAt: T0,
      payload: {
        decisionId: 'decision-1',
        versionId: 'version-1',
        // @ts-expect-error — 'maybe' is not a valid verdict
        verdict: 'maybe',
      },
    });

    expect(result.ok).toBe(false);
  });

  it('refuses to append to a log containing another project’s events', () => {
    const foreign = unwrap(
      appendEvent([], {
        id: asId<'EventId'>('event-foreign'),
        projectId: asId<'ProjectId'>('project-other'),
        type: 'chat.message_posted',
        actorId,
        occurredAt: T0,
        payload: { messageId: 'msg-x', body: 'hi' },
      }),
    ) as AnyTimelineEvent;

    const result = append([foreign], '2');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.rule).toBe('event.single_project_log');
  });

  it('returns an event that cannot be mutated', () => {
    const event = unwrap(append([], '1'));

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(() => {
      // @ts-expect-error — deliberately violating readonly at runtime
      event.seq = 99;
    }).toThrow();
  });
});

describe('nextSeq', () => {
  it('is 1 for an empty log', () => {
    expect(nextSeq([])).toBe(1);
  });

  it('continues from the highest existing sequence regardless of order', () => {
    const log: AnyTimelineEvent[] = [];
    for (let index = 1; index <= 3; index += 1) {
      log.push(unwrap(append(log, String(index))) as AnyTimelineEvent);
    }
    const shuffled = [log[2], log[0], log[1]].filter(
      (event): event is AnyTimelineEvent => event !== undefined,
    );

    expect(nextSeq(shuffled)).toBe(4);
  });
});

describe('slice', () => {
  it('returns an inclusive, ordered range', () => {
    const log: AnyTimelineEvent[] = [];
    for (let index = 1; index <= 6; index += 1) {
      log.push(unwrap(append(log, String(index))) as AnyTimelineEvent);
    }

    expect(slice(log, 2, 4).map((event) => event.seq)).toEqual([2, 3, 4]);
  });

  it('returns nothing for a range beyond the log', () => {
    expect(slice([], 1, 10)).toEqual([]);
  });
});

describe('InMemoryEventStore', () => {
  it('keeps separate, independently sequenced logs per project', async () => {
    const store = new InMemoryEventStore();
    const other = asId<'ProjectId'>('project-2');

    await store.append({
      id: asId<'EventId'>('e1'),
      projectId,
      type: 'chat.message_posted',
      actorId,
      occurredAt: T0,
      payload: { messageId: 'm1', body: 'a' },
    });
    await store.append({
      id: asId<'EventId'>('e2'),
      projectId: other,
      type: 'chat.message_posted',
      actorId,
      occurredAt: T0,
      payload: { messageId: 'm2', body: 'b' },
    });
    await store.append({
      id: asId<'EventId'>('e3'),
      projectId,
      type: 'chat.message_posted',
      actorId,
      occurredAt: T0,
      payload: { messageId: 'm3', body: 'c' },
    });

    expect((await store.read(projectId)).map((event) => event.seq)).toEqual([1, 2]);
    expect((await store.read(other)).map((event) => event.seq)).toEqual([1]);
  });

  it('reads a summary-style range', async () => {
    const store = new InMemoryEventStore();
    for (let index = 1; index <= 5; index += 1) {
      await store.append({
        id: asId<'EventId'>(`e${index}`),
        projectId,
        type: 'chat.message_posted',
        actorId,
        occurredAt: T0,
        payload: { messageId: `m${index}`, body: 'x' },
      });
    }

    const range = await store.readRange(projectId, 2, 3);
    expect(range.map((event) => event.seq)).toEqual([2, 3]);
  });
});
