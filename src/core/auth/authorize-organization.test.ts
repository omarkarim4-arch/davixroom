import { describe, expect, it } from 'vitest';
import { authorizeOrganization } from './authorize-organization';
import {
  ORGANIZATION_CAPABILITIES,
  ORGANIZATION_ROLES,
  capabilitiesForOrganizationRole,
} from './organization-capabilities';
import { anOrganization, aUser } from '../testing/doubles';
import { asId } from '../ids';

describe('authorizeOrganization', () => {
  const vendor = anOrganization({ kind: 'vendor' });

  it('lets an owner create projects', () => {
    const result = authorizeOrganization({
      user: aUser({ organizationRole: 'org_owner' }),
      organization: vendor,
      capability: 'project.create',
    });

    expect(result).toEqual({ ok: true, value: { role: 'org_owner' } });
  });

  it('lets an admin create projects and grow the team', () => {
    const admin = aUser({ organizationRole: 'org_admin' });

    expect(
      authorizeOrganization({
        user: admin,
        organization: vendor,
        capability: 'project.create',
      }).ok,
    ).toBe(true);
    expect(
      authorizeOrganization({
        user: admin,
        organization: vendor,
        capability: 'organization.member.invite',
      }).ok,
    ).toBe(true);
  });

  it('does not let an admin change the organization itself', () => {
    const result = authorizeOrganization({
      user: aUser({ organizationRole: 'org_admin' }),
      organization: vendor,
      capability: 'organization.manage',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'organization_capability_not_granted',
        capability: 'organization.manage',
      },
    });
  });

  it('gives a plain team member nothing at this level', () => {
    for (const capability of ORGANIZATION_CAPABILITIES) {
      expect(
        authorizeOrganization({
          user: aUser({ organizationRole: 'org_member' }),
          organization: vendor,
          capability,
        }).ok,
      ).toBe(false);
    }
  });

  it('rejects a user asking about an organization that is not theirs', () => {
    const result = authorizeOrganization({
      user: aUser({
        organizationRole: 'org_owner',
        organizationId: asId<'OrganizationId'>('org-somewhere-else'),
      }),
      organization: vendor,
      capability: 'project.create',
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'not_in_organization', capability: 'project.create' },
    });
  });

  /**
   * The product rule: clients enter DavixRoom only through invitations. A
   * client organization's first user is necessarily its owner, so role alone
   * would let them act — the kind check is what actually stops it, and it has
   * to run before the role is consulted.
   */
  it('refuses every capability to a client organization, whatever the role', () => {
    const client = anOrganization({ kind: 'client' });

    for (const role of ORGANIZATION_ROLES) {
      for (const capability of ORGANIZATION_CAPABILITIES) {
        expect(
          authorizeOrganization({
            user: aUser({
              organizationRole: role,
              organizationId: client.id,
            }),
            organization: client,
            capability,
          }),
        ).toEqual({ ok: false, error: { kind: 'client_organization', capability } });
      }
    }
  });
});

describe('organization capabilities', () => {
  it('nests owner over admin over member', () => {
    const owner = capabilitiesForOrganizationRole('org_owner');
    const admin = capabilitiesForOrganizationRole('org_admin');
    const member = capabilitiesForOrganizationRole('org_member');

    for (const capability of admin) expect(owner.has(capability)).toBe(true);
    for (const capability of member) expect(admin.has(capability)).toBe(true);
    expect(member.size).toBe(0);
  });

  it('grants organization.manage to the owner alone', () => {
    const holders = ORGANIZATION_ROLES.filter((role) =>
      capabilitiesForOrganizationRole(role).has('organization.manage'),
    );

    expect(holders).toEqual(['org_owner']);
  });
});
