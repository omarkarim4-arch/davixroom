import type { DeliverableVersionId, FeedbackId, UserId } from '../ids';
import type { Timestamp } from '../time';
import { err, ok, type Result } from '../result';
import { invariantViolation, type InvariantViolation } from '../errors';

/**
 * A comment anchored to a specific version. Like decisions, feedback names the
 * version it refers to, so "this button is misaligned" stays attached to the
 * build it was written about.
 *
 * `anchor` is optional structured context — a timestamp within a recording or a
 * region of a screen — so feedback can point at a moment, not just a build.
 */
export type FeedbackAnchor =
  | { readonly kind: 'recording_time'; readonly offsetMs: number }
  | { readonly kind: 'region'; readonly x: number; readonly y: number };

export type Feedback = {
  readonly id: FeedbackId;
  readonly deliverableVersionId: DeliverableVersionId;
  readonly authorId: UserId;
  readonly body: string;
  readonly createdAt: Timestamp;
  readonly anchor: FeedbackAnchor | null;
  readonly resolvedAt: Timestamp | null;
};

export type LeaveFeedbackCommand = {
  readonly id: FeedbackId;
  readonly deliverableVersionId: DeliverableVersionId;
  readonly authorId: UserId;
  readonly body: string;
  readonly createdAt: Timestamp;
  readonly anchor?: FeedbackAnchor;
};

export const leaveFeedback = (
  command: LeaveFeedbackCommand,
): Result<Feedback, InvariantViolation> => {
  const body = command.body.trim();
  if (body.length === 0) {
    return err(
      invariantViolation('feedback.body_required', 'Feedback cannot be empty'),
    );
  }

  return ok(
    Object.freeze({
      id: command.id,
      deliverableVersionId: command.deliverableVersionId,
      authorId: command.authorId,
      body,
      createdAt: command.createdAt,
      anchor: command.anchor ?? null,
      resolvedAt: null,
    }),
  );
};

export const resolveFeedback = (feedback: Feedback, at: Timestamp): Feedback =>
  Object.freeze({ ...feedback, resolvedAt: at });

export const openFeedback = (items: readonly Feedback[]): readonly Feedback[] =>
  items.filter((item) => item.resolvedAt === null);
