/**
 * Ports: the boundary between the domain and the outside world.
 *
 * The domain depends only on these interfaces, never on Supabase, LiveKit, or
 * an AI vendor. Stage 1 ships the interfaces plus in-memory implementations for
 * tests; later stages supply real adapters without the domain changing.
 */

import type { AnyTimelineEvent, EventType, TimelineEvent } from '../timeline/event';
import type { AppendCommand } from '../timeline/event-log';
import type { Membership } from '../project/membership';
import type { Project } from '../project/project';
import type { Grant } from '../auth/grant';
import type { ArtifactId, ProjectId, SessionId, UserId } from '../ids';
import type { Timestamp } from '../time';
import type { Result } from '../result';
import type { InvariantViolation } from '../errors';

/** Wall clock, injected so time-dependent rules are testable. */
export type Clock = {
  now(): Timestamp;
};

/** Id minting, injected so ids are deterministic in tests. */
export type IdGenerator = {
  next(): string;
};

/**
 * Append-only timeline storage. There is deliberately no `update` or `delete` —
 * the absence of those methods is the guarantee.
 */
export type EventStore = {
  append<K extends EventType>(
    command: AppendCommand<K>,
  ): Promise<Result<TimelineEvent<K>, InvariantViolation>>;
  read(projectId: ProjectId): Promise<readonly AnyTimelineEvent[]>;
  readRange(
    projectId: ProjectId,
    fromSeq: number,
    toSeq: number,
  ): Promise<readonly AnyTimelineEvent[]>;
};

export type ProjectRepository = {
  findById(projectId: ProjectId): Promise<Project | null>;
  findMembership(projectId: ProjectId, userId: UserId): Promise<Membership | null>;
  listGrants(projectId: ProjectId, userId: UserId): Promise<readonly Grant[]>;
};

/** Presence, chat fan-out and live cursors. Backed by Supabase Realtime later. */
export type RealtimeGateway = {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, handler: (payload: unknown) => void): Promise<() => void>;
  presence(channel: string): Promise<readonly UserId[]>;
};

/**
 * Live audio/video/screen transport. Backed by an SFU later.
 *
 * `grantControl` takes an explicit expiry because remote control is never
 * open-ended — the transport-level permission and the domain-level grant expire
 * together.
 */
export type MediaGateway = {
  createSession(projectId: ProjectId): Promise<SessionId>;
  issueJoinToken(sessionId: SessionId, userId: UserId): Promise<string>;
  endSession(sessionId: SessionId): Promise<void>;
  grantControl(
    sessionId: SessionId,
    userId: UserId,
    expiresAt: Timestamp,
  ): Promise<void>;
  revokeControl(sessionId: SessionId, userId: UserId): Promise<void>;
};

/** Recordings and attachments. */
export type BlobStorage = {
  put(key: string, data: Uint8Array, contentType: string): Promise<ArtifactId>;
  signedUrl(artifactId: ArtifactId, expiresInMs: number): Promise<string>;
  remove(artifactId: ArtifactId): Promise<void>;
};

export type SummaryRequest = {
  readonly projectId: ProjectId;
  readonly events: readonly AnyTimelineEvent[];
  readonly audience: 'client' | 'vendor';
};

/**
 * AI summarisation reads the timeline and returns prose. It is a consumer of
 * the event log like any other view — never a privileged path that sees data
 * the requesting user could not.
 */
export type AiSummarizer = {
  summarize(request: SummaryRequest): Promise<string>;
};

export type Ports = {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly events: EventStore;
  readonly projects: ProjectRepository;
  readonly realtime: RealtimeGateway;
  readonly media: MediaGateway;
  readonly blobs: BlobStorage;
  readonly ai: AiSummarizer;
};
