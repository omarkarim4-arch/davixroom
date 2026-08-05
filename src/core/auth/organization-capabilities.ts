/**
 * Permissions that exist above a project.
 *
 * The ownership hierarchy is:
 *
 *   Organization → Team Members → Projects → Client Invitations → Review Sessions
 *
 * `Capability` in ./capabilities answers "what may this member do *inside* this
 * project". These answer the questions one level up, before any project exists:
 * who may create a project at all, and who may add a person to the team.
 *
 * They are a separate type from `Capability` deliberately. The two are decided
 * by different functions against different subjects, so keeping them distinct
 * makes passing one where the other belongs a compile error rather than a check
 * that silently never passes.
 */

export const ORGANIZATION_CAPABILITIES = [
  /** Rename the organization and change its settings. */
  'organization.manage',
  /** Add another person to the organization's team. */
  'organization.member.invite',
  /** Create a project the organization owns and delivers. */
  'project.create',
] as const;

export type OrganizationCapability = (typeof ORGANIZATION_CAPABILITIES)[number];

/**
 * Roles within an organization, distinct from the project roles in
 * ./capabilities. A person holds exactly one of these in the one organization
 * they belong to, and it says nothing about any individual project — project
 * access still comes from a membership.
 */
export type OrganizationRole = 'org_owner' | 'org_admin' | 'org_member';

export const ORGANIZATION_ROLES = [
  'org_owner',
  'org_admin',
  'org_member',
] as const satisfies readonly OrganizationRole[];

/**
 * A plain team member holds nothing at this level.
 *
 * Being on the team is what makes someone available to be added to a project;
 * it is not itself permission to do anything. Anyone who can create projects or
 * enlarge the team is an admin or the owner, by definition.
 */
const ORG_MEMBER_CAPABILITIES = [] as const satisfies readonly OrganizationCapability[];

const ORG_ADMIN_CAPABILITIES = [
  'organization.member.invite',
  'project.create',
] as const satisfies readonly OrganizationCapability[];

const ORG_OWNER_CAPABILITIES = [
  ...ORG_ADMIN_CAPABILITIES,
  'organization.manage',
] as const satisfies readonly OrganizationCapability[];

const ORGANIZATION_ROLE_CAPABILITIES: Readonly<
  Record<OrganizationRole, readonly OrganizationCapability[]>
> = {
  org_member: ORG_MEMBER_CAPABILITIES,
  org_admin: ORG_ADMIN_CAPABILITIES,
  org_owner: ORG_OWNER_CAPABILITIES,
};

export const capabilitiesForOrganizationRole = (
  role: OrganizationRole,
): ReadonlySet<OrganizationCapability> =>
  new Set(ORGANIZATION_ROLE_CAPABILITIES[role]);

export const organizationRoleHasCapability = (
  role: OrganizationRole,
  capability: OrganizationCapability,
): boolean => ORGANIZATION_ROLE_CAPABILITIES[role].includes(capability);
