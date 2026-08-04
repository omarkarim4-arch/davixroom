import { describe, expect, it } from 'vitest';
import {
  decisionForVersion,
  deliverableStatus,
  isCurrentlyApproved,
  recordDecision,
  type Decision,
} from './decision';
import {
  publishVersion,
  latestVersion,
  nextVersionNumber,
  type Deliverable,
  type DeliverableVersion,
} from './deliverable';
import { leaveFeedback, openFeedback, resolveFeedback } from './feedback';
import { asId } from '../ids';
import { unwrap } from '../result';
import { HOUR_MS, DAY_MS } from '../time';
import { T0 } from '../testing/doubles';

const deliverable: Deliverable = {
  id: asId<'DeliverableId'>('deliverable-1'),
  projectId: asId<'ProjectId'>('project-1'),
  title: 'Checkout flow',
  createdBy: asId<'UserId'>('dev-1'),
  createdAt: T0,
};

const approver = asId<'UserId'>('client-approver');
const developer = asId<'UserId'>('dev-1');

const publish = (existing: readonly DeliverableVersion[], suffix: string) =>
  unwrap(
    publishVersion(existing, {
      id: asId<'DeliverableVersionId'>(`version-${suffix}`),
      deliverable,
      summary: `Iteration ${suffix}`,
      publishedBy: developer,
      publishedAt: T0 + Number(suffix) * HOUR_MS,
    }),
  );

describe('publishVersion', () => {
  it('numbers versions from 1 contiguously', () => {
    const v1 = publish([], '1');
    const v2 = publish([v1], '2');
    const v3 = publish([v1, v2], '3');

    expect([v1.number, v2.number, v3.number]).toEqual([1, 2, 3]);
    expect(nextVersionNumber([v1, v2, v3])).toBe(4);
  });

  it('requires a summary of what changed', () => {
    const result = publishVersion([], {
      id: asId<'DeliverableVersionId'>('version-x'),
      deliverable,
      summary: '   ',
      publishedBy: developer,
      publishedAt: T0,
    });

    expect(result.ok === false && result.error.rule).toBe('version.summary_required');
  });

  it('rejects a history containing another deliverable’s versions', () => {
    const foreign: DeliverableVersion = {
      ...publish([], '1'),
      deliverableId: asId<'DeliverableId'>('deliverable-other'),
    };

    const result = publishVersion([foreign], {
      id: asId<'DeliverableVersionId'>('version-2'),
      deliverable,
      summary: 'next',
      publishedBy: developer,
      publishedAt: T0,
    });

    expect(result.ok === false && result.error.rule).toBe('version.single_deliverable');
  });

  it('produces an immutable version', () => {
    const version = publish([], '1');
    expect(Object.isFrozen(version)).toBe(true);
  });

  it('reports the latest version by number, not array order', () => {
    const v1 = publish([], '1');
    const v2 = publish([v1], '2');

    expect(latestVersion([v2, v1])?.id).toBe(v2.id);
    expect(latestVersion([])).toBeNull();
  });
});

describe('recordDecision', () => {
  const version = publish([], '1');

  it('binds the decision to the exact version judged', () => {
    const decision = unwrap(
      recordDecision({
        id: asId<'DecisionId'>('decision-1'),
        version,
        verdict: 'approved',
        decidedBy: approver,
        decidedAt: version.publishedAt + HOUR_MS,
      }),
    );

    expect(decision.deliverableVersionId).toBe(version.id);
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it('requires a rationale when rejecting', () => {
    const result = recordDecision({
      id: asId<'DecisionId'>('decision-1'),
      version,
      verdict: 'rejected',
      decidedBy: approver,
      decidedAt: version.publishedAt + HOUR_MS,
    });

    expect(result.ok === false && result.error.rule).toBe(
      'decision.rationale_required',
    );
  });

  it('requires a rationale when requesting changes', () => {
    const result = recordDecision({
      id: asId<'DecisionId'>('decision-1'),
      version,
      verdict: 'changes_requested',
      decidedBy: approver,
      decidedAt: version.publishedAt + HOUR_MS,
      rationale: '   ',
    });

    expect(result.ok).toBe(false);
  });

  it('allows approval without a rationale', () => {
    const decision = unwrap(
      recordDecision({
        id: asId<'DecisionId'>('decision-1'),
        version,
        verdict: 'approved',
        decidedBy: approver,
        decidedAt: version.publishedAt,
      }),
    );

    expect(decision.rationale).toBeNull();
  });

  it('rejects a decision dated before the version was published', () => {
    const result = recordDecision({
      id: asId<'DecisionId'>('decision-1'),
      version,
      verdict: 'approved',
      decidedBy: approver,
      decidedAt: version.publishedAt - 1,
    });

    expect(result.ok === false && result.error.rule).toBe('decision.after_publication');
  });
});

describe('deliverableStatus — approval binds to a version', () => {
  const v1 = publish([], '1');

  const approvalOf = (
    version: DeliverableVersion,
    at = version.publishedAt + HOUR_MS,
  ): Decision =>
    unwrap(
      recordDecision({
        id: asId<'DecisionId'>(`decision-${version.number}`),
        version,
        verdict: 'approved',
        decidedBy: approver,
        decidedAt: at,
      }),
    );

  it('is draft with no versions', () => {
    expect(deliverableStatus([], [])).toBe('draft');
  });

  it('is in_review once published and undecided', () => {
    expect(deliverableStatus([v1], [])).toBe('in_review');
  });

  it('is approved once the latest version is approved', () => {
    expect(deliverableStatus([v1], [approvalOf(v1)])).toBe('approved');
    expect(isCurrentlyApproved([v1], [approvalOf(v1)])).toBe(true);
  });

  it('returns to in_review when a newer version is published', () => {
    // The central rule: approving version 1 must not silently approve version 2.
    const approval = approvalOf(v1);
    const v2 = publish([v1], '2');

    expect(deliverableStatus([v1, v2], [approval])).toBe('in_review');
    expect(isCurrentlyApproved([v1, v2], [approval])).toBe(false);
  });

  it('keeps the historical decision on the superseded version', () => {
    const approval = approvalOf(v1);
    const v2 = publish([v1], '2');

    expect(decisionForVersion([approval], v1.id)?.verdict).toBe('approved');
    expect(decisionForVersion([approval], v2.id)).toBeNull();
  });

  it('reflects a rejection of the latest version', () => {
    const rejection = unwrap(
      recordDecision({
        id: asId<'DecisionId'>('decision-r'),
        version: v1,
        verdict: 'rejected',
        decidedBy: approver,
        decidedAt: v1.publishedAt + HOUR_MS,
        rationale: 'Wrong payment provider',
      }),
    );

    expect(deliverableStatus([v1], [rejection])).toBe('rejected');
  });

  it('uses the most recent decision when a version is decided twice', () => {
    const changes = unwrap(
      recordDecision({
        id: asId<'DecisionId'>('decision-c'),
        version: v1,
        verdict: 'changes_requested',
        decidedBy: approver,
        decidedAt: v1.publishedAt + HOUR_MS,
        rationale: 'Spacing is off',
      }),
    );
    const later = approvalOf(v1, v1.publishedAt + DAY_MS);

    expect(deliverableStatus([v1], [changes, later])).toBe('approved');
    expect(decisionForVersion([changes, later], v1.id)?.id).toBe(later.id);
  });

  it('ignores decisions belonging to other versions entirely', () => {
    const v2 = publish([v1], '2');
    expect(deliverableStatus([v1, v2], [approvalOf(v1)])).toBe('in_review');
  });
});

describe('feedback', () => {
  const versionId = asId<'DeliverableVersionId'>('version-1');

  it('trims and requires a body', () => {
    expect(
      leaveFeedback({
        id: asId<'FeedbackId'>('f1'),
        deliverableVersionId: versionId,
        authorId: approver,
        body: '   ',
        createdAt: T0,
      }).ok,
    ).toBe(false);
  });

  it('anchors feedback to a moment in a recording', () => {
    const feedback = unwrap(
      leaveFeedback({
        id: asId<'FeedbackId'>('f1'),
        deliverableVersionId: versionId,
        authorId: approver,
        body: 'The spinner never stops here',
        createdAt: T0,
        anchor: { kind: 'recording_time', offsetMs: 42_000 },
      }),
    );

    expect(feedback.anchor).toEqual({ kind: 'recording_time', offsetMs: 42_000 });
    expect(feedback.resolvedAt).toBeNull();
  });

  it('tracks resolution', () => {
    const feedback = unwrap(
      leaveFeedback({
        id: asId<'FeedbackId'>('f1'),
        deliverableVersionId: versionId,
        authorId: approver,
        body: 'Fix the label',
        createdAt: T0,
      }),
    );

    expect(openFeedback([feedback])).toHaveLength(1);
    expect(openFeedback([resolveFeedback(feedback, T0 + HOUR_MS)])).toHaveLength(0);
  });
});
