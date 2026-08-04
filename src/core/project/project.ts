import type { OrganizationId, ProjectId } from '../ids';
import type { Timestamp } from '../time';

/**
 * A project is the collaboration boundary and the unit of tenancy.
 *
 * It always spans exactly two organizations — the vendor building the software
 * and the client receiving it. Every timeline event, deliverable, decision and
 * session hangs off a project, and every authorization check is evaluated
 * against one.
 */
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export type Project = {
  readonly id: ProjectId;
  readonly vendorOrganizationId: OrganizationId;
  readonly clientOrganizationId: OrganizationId;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly createdAt: Timestamp;
};

/** Which side of the project an organization sits on, if any. */
export const organizationSide = (
  project: Project,
  organizationId: OrganizationId,
): 'vendor' | 'client' | null => {
  if (project.vendorOrganizationId === organizationId) return 'vendor';
  if (project.clientOrganizationId === organizationId) return 'client';
  return null;
};

export const isParticipatingOrganization = (
  project: Project,
  organizationId: OrganizationId,
): boolean => organizationSide(project, organizationId) !== null;
