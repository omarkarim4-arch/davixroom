/**
 * In-memory port implementations and fixture builders.
 *
 * These live in `src/core` rather than a test folder so later stages can reuse
 * them for local development and Storybook-style previews without a database.
 */

import { appendEvent } from '../timeline/event-log';
import type { AnyTimelineEvent, EventType, TimelineEvent } from '../timeline/event';
import type { AppendCommand } from '../timeline/event-log';
import type { Clock, EventStore, IdGenerator, ProjectRepository } from '../ports';
import type { Grant } from '../auth/grant';
import type { Membership } from '../project/membership';
import type { Project } from '../project/project';
import type { Organization } from '../org/organization';
import type { User } from '../org/user';
import { DEFAULT_INVITATION_TTL_MS, type Invitation } from '../org/invitation';
import type { Role } from '../auth/capabilities';
import { asId, type ProjectId, type UserId } from '../ids';
import type { Timestamp } from '../time';
import type { Result } from '../result';
import type { InvariantViolation } from '../errors';

export const fixedClock = (at: Timestamp): Clock => ({ now: () => at });

export const advancingClock = (start: Timestamp, stepMs: number): Clock => {
  let current = start;
  return {
    now: () => {
      const value = current;
      current += stepMs;
      return value;
    },
  };
};

export const sequentialIds = (prefix = 'id'): IdGenerator => {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
};

export class InMemoryEventStore implements EventStore {
  private readonly logs = new Map<string, AnyTimelineEvent[]>();

  async append<K extends EventType>(
    command: AppendCommand<K>,
  ): Promise<Result<TimelineEvent<K>, InvariantViolation>> {
    const existing = this.logs.get(command.projectId) ?? [];
    const result = appendEvent(existing, command);
    if (result.ok) {
      this.logs.set(command.projectId, [...existing, result.value as AnyTimelineEvent]);
    }
    return result;
  }

  async read(projectId: ProjectId): Promise<readonly AnyTimelineEvent[]> {
    return [...(this.logs.get(projectId) ?? [])].sort((a, b) => a.seq - b.seq);
  }

  async readRange(
    projectId: ProjectId,
    fromSeq: number,
    toSeq: number,
  ): Promise<readonly AnyTimelineEvent[]> {
    const all = await this.read(projectId);
    return all.filter((event) => event.seq >= fromSeq && event.seq <= toSeq);
  }
}

export class InMemoryProjectRepository implements ProjectRepository {
  constructor(
    private readonly projects: readonly Project[] = [],
    private readonly memberships: readonly Membership[] = [],
    private readonly grants: readonly Grant[] = [],
  ) {}

  async findById(projectId: ProjectId): Promise<Project | null> {
    return this.projects.find((project) => project.id === projectId) ?? null;
  }

  async findMembership(
    projectId: ProjectId,
    userId: UserId,
  ): Promise<Membership | null> {
    return (
      this.memberships.find(
        (membership) =>
          membership.projectId === projectId && membership.userId === userId,
      ) ?? null
    );
  }

  async listGrants(projectId: ProjectId, userId: UserId): Promise<readonly Grant[]> {
    return this.grants.filter(
      (grant) => grant.projectId === projectId && grant.subjectUserId === userId,
    );
  }
}

/** A fixed instant used across tests so expectations read as absolute times. */
export const T0: Timestamp = Date.parse('2026-01-01T00:00:00.000Z');

export const anOrganization = (
  overrides: Partial<Organization> = {},
): Organization => ({
  id: asId<'OrganizationId'>('org-vendor'),
  kind: 'vendor',
  name: 'Vendor Co',
  ...overrides,
});

export const aUser = (overrides: Partial<User> = {}): User => ({
  id: asId<'UserId'>('user-1'),
  organizationId: asId<'OrganizationId'>('org-vendor'),
  organizationRole: 'org_member',
  displayName: 'Dev One',
  email: 'dev@vendor.test',
  ...overrides,
});

export const anInvitation = (overrides: Partial<Invitation> = {}): Invitation => ({
  id: asId<'InvitationId'>('invitation-1'),
  organizationId: asId<'OrganizationId'>('org-client'),
  projectId: asId<'ProjectId'>('project-1'),
  role: 'client_approver',
  email: 'approver@client.test',
  invitedBy: asId<'UserId'>('user-1'),
  createdAt: T0,
  expiresAt: T0 + DEFAULT_INVITATION_TTL_MS,
  acceptedAt: null,
  revokedAt: null,
  ...overrides,
});

export const aProject = (overrides: Partial<Project> = {}): Project => ({
  id: asId<'ProjectId'>('project-1'),
  vendorOrganizationId: asId<'OrganizationId'>('org-vendor'),
  clientOrganizationId: asId<'OrganizationId'>('org-client'),
  name: 'Acme Rebuild',
  status: 'active',
  createdAt: T0,
  ...overrides,
});

export const aMembership = (
  overrides: Partial<Membership> & { role: Role },
): Membership => ({
  id: asId<'MembershipId'>('membership-1'),
  projectId: asId<'ProjectId'>('project-1'),
  userId: asId<'UserId'>('user-1'),
  joinedAt: T0,
  removedAt: null,
  ...overrides,
});
