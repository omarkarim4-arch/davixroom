import {
  latestVersion,
  type DeliverableStatus,
  type DeliverableVersion,
} from './deliverable';
import type { DecisionId, DeliverableVersionId, UserId } from '../ids';
import type { Timestamp } from '../time';
import { err, ok, type Result } from '../result';
import { invariantViolation, type InvariantViolation } from '../errors';

export type Verdict = 'approved' | 'rejected' | 'changes_requested';

/**
 * A recorded client decision. Immutable once made — changing your mind means
 * recording a new decision, leaving the original in the audit trail.
 *
 * A decision always names the exact `deliverableVersionId` it judged. That
 * binding is the whole point: it is what lets the system prove *what* was
 * approved rather than merely *that* something was.
 */
export type Decision = {
  readonly id: DecisionId;
  readonly deliverableVersionId: DeliverableVersionId;
  readonly verdict: Verdict;
  readonly decidedBy: UserId;
  readonly decidedAt: Timestamp;
  readonly rationale: string | null;
};

export type RecordDecisionCommand = {
  readonly id: DecisionId;
  readonly version: DeliverableVersion;
  readonly verdict: Verdict;
  readonly decidedBy: UserId;
  readonly decidedAt: Timestamp;
  readonly rationale?: string;
};

export const recordDecision = (
  command: RecordDecisionCommand,
): Result<Decision, InvariantViolation> => {
  if (command.decidedAt < command.version.publishedAt) {
    return err(
      invariantViolation(
        'decision.after_publication',
        'A version cannot be decided before it was published',
      ),
    );
  }

  // Rejecting or requesting changes without saying why produces an unusable
  // record for the developer on the other side.
  const rationale = command.rationale?.trim() ?? '';
  if (command.verdict !== 'approved' && rationale.length === 0) {
    return err(
      invariantViolation(
        'decision.rationale_required',
        `A ${command.verdict} decision must include a rationale`,
      ),
    );
  }

  return ok(
    Object.freeze({
      id: command.id,
      deliverableVersionId: command.version.id,
      verdict: command.verdict,
      decidedBy: command.decidedBy,
      decidedAt: command.decidedAt,
      rationale: rationale.length > 0 ? rationale : null,
    }),
  );
};

/** The most recent decision recorded against a specific version. */
export const decisionForVersion = (
  decisions: readonly Decision[],
  versionId: DeliverableVersionId,
): Decision | null =>
  decisions
    .filter((decision) => decision.deliverableVersionId === versionId)
    .reduce<Decision | null>(
      (latest, decision) =>
        latest === null || decision.decidedAt > latest.decidedAt ? decision : latest,
      null,
    );

/**
 * The status of a deliverable, derived from its versions and decisions rather
 * than stored.
 *
 * Publishing a new version returns the deliverable to `in_review` even if an
 * earlier version was approved — a stored status field would have to be
 * remembered-to-be-reset, and forgetting once would let unapproved work appear
 * approved. Deriving it makes that class of bug unrepresentable.
 */
export const deliverableStatus = (
  versions: readonly DeliverableVersion[],
  decisions: readonly Decision[],
): DeliverableStatus => {
  const latest = latestVersion(versions);
  if (latest === null) return 'draft';

  const decision = decisionForVersion(decisions, latest.id);
  if (decision === null) return 'in_review';

  switch (decision.verdict) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'changes_requested':
      return 'changes_requested';
  }
};

/**
 * Whether the deliverable's *current* state is client-approved.
 * Returns false the moment a newer version is published.
 */
export const isCurrentlyApproved = (
  versions: readonly DeliverableVersion[],
  decisions: readonly Decision[],
): boolean => deliverableStatus(versions, decisions) === 'approved';
