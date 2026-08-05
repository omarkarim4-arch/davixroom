import {
  capabilitiesForOrganizationRole,
  type OrganizationCapability,
} from './organization-capabilities';
import type { Organization } from '../org/organization';
import type { User } from '../org/user';
import { err, ok, type Result } from '../result';
import type { OrganizationDenial } from '../errors';

/**
 * Everything needed to decide an organization-level permission.
 *
 * Like `authorize`, this performs no I/O — the caller loads the organization
 * and hands it in, which keeps the rule testable in isolation and the loading
 * concern in one adapter.
 */
export type OrganizationAuthorizationRequest = {
  readonly user: User;
  readonly organization: Organization;
  readonly capability: OrganizationCapability;
};

/**
 * The chokepoint for permissions above a project.
 *
 * Order matters, and the second check is the product rule that shapes the whole
 * onboarding model: **a client organization can never own projects or enlarge
 * itself.** Vendors register themselves; clients exist only because a vendor
 * invited them into a project. Encoding that here rather than in the UI means a
 * client organization cannot reach it by any route, including a hand-crafted
 * request — and it is checked before the role, so a client org whose first user
 * is necessarily its owner still cannot act.
 */
export const authorizeOrganization = (
  request: OrganizationAuthorizationRequest,
): Result<{ readonly role: User['organizationRole'] }, OrganizationDenial> => {
  const { user, organization, capability } = request;

  if (user.organizationId !== organization.id) {
    return err({ kind: 'not_in_organization', capability });
  }

  if (organization.kind === 'client') {
    return err({ kind: 'client_organization', capability });
  }

  if (!capabilitiesForOrganizationRole(user.organizationRole).has(capability)) {
    return err({ kind: 'organization_capability_not_granted', capability });
  }

  return ok({ role: user.organizationRole });
};

/** Boolean convenience wrapper for call sites that do not need the reason. */
export const canInOrganization = (
  request: OrganizationAuthorizationRequest,
): boolean => authorizeOrganization(request).ok;
