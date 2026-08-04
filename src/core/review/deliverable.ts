import type {
  ArtifactId,
  DeliverableId,
  DeliverableVersionId,
  ProjectId,
  UserId,
} from '../ids';
import type { Timestamp } from '../time';
import { err, ok, type Result } from '../result';
import { invariantViolation, type InvariantViolation } from '../errors';

/**
 * A deliverable is a unit of work a client reviews — a feature, a screen, a
 * milestone. It is a stable identity that accumulates *versions*.
 *
 * The split matters commercially: clients approve versions, not deliverables.
 * "The login flow" is never approved; "version 3 of the login flow" is.
 */
export type DeliverableStatus =
  'draft' | 'in_review' | 'approved' | 'rejected' | 'changes_requested';

export type Deliverable = {
  readonly id: DeliverableId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly createdBy: UserId;
  readonly createdAt: Timestamp;
};

/**
 * An immutable snapshot of a deliverable at a point in time.
 *
 * Versions are never edited after publication. If the work changes, a new
 * version is published — which is precisely what invalidates any prior
 * approval, since the approval referenced the old version's id.
 */
export type DeliverableVersion = {
  readonly id: DeliverableVersionId;
  readonly deliverableId: DeliverableId;
  /** 1-based, contiguous, ordered within the deliverable. */
  readonly number: number;
  readonly summary: string;
  readonly publishedBy: UserId;
  readonly publishedAt: Timestamp;
  /** Recordings, screenshots or build outputs attached as evidence. */
  readonly artifactIds: readonly ArtifactId[];
};

export const latestVersion = (
  versions: readonly DeliverableVersion[],
): DeliverableVersion | null =>
  versions.reduce<DeliverableVersion | null>(
    (latest, version) =>
      latest === null || version.number > latest.number ? version : latest,
    null,
  );

export const nextVersionNumber = (versions: readonly DeliverableVersion[]): number =>
  (latestVersion(versions)?.number ?? 0) + 1;

export type PublishVersionCommand = {
  readonly id: DeliverableVersionId;
  readonly deliverable: Deliverable;
  readonly summary: string;
  readonly publishedBy: UserId;
  readonly publishedAt: Timestamp;
  readonly artifactIds?: readonly ArtifactId[];
};

export const publishVersion = (
  existing: readonly DeliverableVersion[],
  command: PublishVersionCommand,
): Result<DeliverableVersion, InvariantViolation> => {
  if (command.summary.trim().length === 0) {
    return err(
      invariantViolation(
        'version.summary_required',
        'A published version must describe what changed',
      ),
    );
  }

  const foreign = existing.find(
    (version) => version.deliverableId !== command.deliverable.id,
  );
  if (foreign !== undefined) {
    return err(
      invariantViolation(
        'version.single_deliverable',
        'Version history contains a version from another deliverable',
      ),
    );
  }

  return ok(
    Object.freeze({
      id: command.id,
      deliverableId: command.deliverable.id,
      number: nextVersionNumber(existing),
      summary: command.summary,
      publishedBy: command.publishedBy,
      publishedAt: command.publishedAt,
      artifactIds: Object.freeze([...(command.artifactIds ?? [])]),
    }),
  );
};
