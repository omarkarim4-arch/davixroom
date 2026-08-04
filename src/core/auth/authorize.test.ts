import { describe, expect, it } from 'vitest';
import { authorize, can, isRoleValidForSide } from './authorize';
import { projectScope, sessionScope, revoke, type Grant } from './grant';
import { capabilitiesForRole } from './capabilities';
import { asId } from '../ids';
import { HOUR_MS, MINUTE_MS } from '../time';
import { T0, aMembership, aProject, aUser } from '../testing/doubles';

const project = aProject();
const clientUser = aUser({
  id: asId<'UserId'>('client-user'),
  organizationId: asId<'OrganizationId'>('org-client'),
  email: 'client@acme.test',
});
const devUser = aUser();

const sessionId = asId<'SessionId'>('session-1');

const aGrant = (overrides: Partial<Grant> = {}): Grant => ({
  id: asId<'GrantId'>('grant-1'),
  projectId: project.id,
  subjectUserId: clientUser.id,
  capability: 'session.control',
  scope: sessionScope(sessionId),
  grantedBy: devUser.id,
  grantedAt: T0,
  expiresAt: T0 + 15 * MINUTE_MS,
  revokedAt: null,
  ...overrides,
});

describe('authorize — tenancy', () => {
  it('denies a user whose organization is not part of the project', () => {
    const outsider = aUser({
      id: asId<'UserId'>('outsider'),
      organizationId: asId<'OrganizationId'>('org-unrelated'),
    });

    const result = authorize({
      user: outsider,
      project,
      membership: aMembership({ role: 'vendor_owner', userId: outsider.id }),
      grants: [],
      capability: 'project.view',
      now: T0,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'cross_tenant', capability: 'project.view' },
    });
  });

  it('denies a grant that references a user from another tenant', () => {
    // A grant must never widen access past the tenancy check.
    const outsider = aUser({
      id: asId<'UserId'>('outsider'),
      organizationId: asId<'OrganizationId'>('org-unrelated'),
    });

    const result = authorize({
      user: outsider,
      project,
      membership: aMembership({ role: 'observer', userId: outsider.id }),
      grants: [aGrant({ subjectUserId: outsider.id, scope: projectScope() })],
      capability: 'session.control',
      now: T0,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.kind).toBe('cross_tenant');
  });

  it('denies a membership belonging to a different project', () => {
    const result = authorize({
      user: devUser,
      project,
      membership: aMembership({
        role: 'vendor_owner',
        projectId: asId<'ProjectId'>('project-other'),
      }),
      grants: [],
      capability: 'project.view',
      now: T0,
    });

    expect(result.ok === false && result.error.kind).toBe('cross_tenant');
  });

  it('denies a user with no membership', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership: null,
      grants: [],
      capability: 'project.view',
      now: T0,
    });

    expect(result.ok === false && result.error.kind).toBe('not_a_member');
  });

  it('denies a removed member', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership: aMembership({
        role: 'client_approver',
        userId: clientUser.id,
        removedAt: T0 - HOUR_MS,
      }),
      grants: [],
      capability: 'project.view',
      now: T0,
    });

    expect(result.ok === false && result.error.kind).toBe('not_a_member');
  });

  it('still authorizes a member removed at a future date', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership: aMembership({
        role: 'client_approver',
        userId: clientUser.id,
        removedAt: T0 + HOUR_MS,
      }),
      grants: [],
      capability: 'project.view',
      now: T0,
    });

    expect(result.ok).toBe(true);
  });
});

describe('authorize — role capabilities', () => {
  it('authorizes via role when the role carries the capability', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership: aMembership({ role: 'client_approver', userId: clientUser.id }),
      grants: [],
      capability: 'decision.record',
      now: T0,
    });

    expect(result).toEqual({
      ok: true,
      value: { via: 'role', role: 'client_approver' },
    });
  });

  it('denies a reviewer the ability to record a decision', () => {
    // Only the approver converts "work shown" into "work accepted".
    const result = authorize({
      user: clientUser,
      project,
      membership: aMembership({ role: 'client_reviewer', userId: clientUser.id }),
      grants: [],
      capability: 'decision.record',
      now: T0,
    });

    expect(result.ok === false && result.error.kind).toBe('capability_not_granted');
  });

  it('denies an observer any write capability', () => {
    const observer = capabilitiesForRole('observer');
    expect(observer.has('feedback.create')).toBe(false);
    expect(observer.has('chat.post')).toBe(false);
    expect(observer.has('decision.record')).toBe(false);
    expect(observer.has('deliverable.submit')).toBe(false);
    expect(observer.has('project.view')).toBe(true);
  });

  it('never grants session.control through a role alone', () => {
    // Remote control must always come from an explicit, expiring grant.
    for (const role of [
      'vendor_owner',
      'vendor_developer',
      'client_approver',
      'client_reviewer',
      'observer',
    ] as const) {
      expect(capabilitiesForRole(role).has('session.control')).toBe(false);
    }
  });

  it('lets a client reviewer request control but not grant it', () => {
    const reviewer = capabilitiesForRole('client_reviewer');
    expect(reviewer.has('session.control.request')).toBe(true);
    expect(reviewer.has('session.control.grant')).toBe(false);

    const developer = capabilitiesForRole('vendor_developer');
    expect(developer.has('session.control.grant')).toBe(true);
  });
});

describe('authorize — grants', () => {
  const membership = aMembership({
    role: 'client_reviewer',
    userId: clientUser.id,
  });

  it('authorizes a capability the role lacks when an active grant covers it', () => {
    const grant = aGrant();
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [grant],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + MINUTE_MS,
    });

    expect(result).toEqual({ ok: true, value: { via: 'grant', grant } });
  });

  it('denies once the grant has expired', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant()],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 16 * MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('grant_expired');
  });

  it('denies at the exact expiry instant', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant()],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 15 * MINUTE_MS,
    });

    expect(result.ok).toBe(false);
  });

  it('denies once the grant has been revoked, even before expiry', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [revoke(aGrant(), T0 + MINUTE_MS)],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 2 * MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('grant_revoked');
  });

  it('denies a grant scoped to a different session', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant({ scope: sessionScope(asId<'SessionId'>('session-other')) })],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('scope_mismatch');
  });

  it('denies a session-scoped grant used for a project-wide request', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant()],
      capability: 'session.control',
      scope: projectScope(),
      now: T0 + MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('scope_mismatch');
  });

  it('accepts a project-scoped grant for a session request', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant({ scope: projectScope(), expiresAt: null })],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 10 * HOUR_MS,
    });

    expect(result.ok).toBe(true);
  });

  it('ignores grants issued to a different user', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant({ subjectUserId: asId<'UserId'>('someone-else') })],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('capability_not_granted');
  });

  it('ignores grants issued for a different project', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant({ projectId: asId<'ProjectId'>('project-other') })],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('capability_not_granted');
  });

  it('prefers an active grant when an expired one also exists', () => {
    const expired = aGrant({ id: asId<'GrantId'>('grant-old') });
    const active = aGrant({
      id: asId<'GrantId'>('grant-new'),
      grantedAt: T0 + 20 * MINUTE_MS,
      expiresAt: T0 + 40 * MINUTE_MS,
    });

    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [expired, active],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 25 * MINUTE_MS,
    });

    expect(result).toEqual({ ok: true, value: { via: 'grant', grant: active } });
  });

  it('reports the most recent grant when reporting a denial reason', () => {
    const older = aGrant({ id: asId<'GrantId'>('grant-old') });
    const newerRevoked = revoke(
      aGrant({ id: asId<'GrantId'>('grant-new'), grantedAt: T0 + MINUTE_MS }),
      T0 + 2 * MINUTE_MS,
    );

    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [older, newerRevoked],
      capability: 'session.control',
      scope: sessionScope(sessionId),
      now: T0 + 30 * MINUTE_MS,
    });

    expect(result.ok === false && result.error.kind).toBe('grant_revoked');
  });

  it('defaults to project scope when no scope is supplied', () => {
    const result = authorize({
      user: clientUser,
      project,
      membership,
      grants: [aGrant({ scope: projectScope(), expiresAt: null })],
      capability: 'session.control',
      now: T0,
    });

    expect(result.ok).toBe(true);
  });
});

describe('can', () => {
  it('reduces an authorization to a boolean', () => {
    expect(
      can({
        user: clientUser,
        project,
        membership: aMembership({ role: 'client_approver', userId: clientUser.id }),
        grants: [],
        capability: 'decision.record',
        now: T0,
      }),
    ).toBe(true);
  });
});

describe('isRoleValidForSide', () => {
  it('rejects a vendor role held by a client-side user', () => {
    expect(isRoleValidForSide('vendor_developer', 'client')).toBe(false);
    expect(isRoleValidForSide('client_approver', 'vendor')).toBe(false);
  });

  it('accepts roles on their own side and observers on either', () => {
    expect(isRoleValidForSide('vendor_developer', 'vendor')).toBe(true);
    expect(isRoleValidForSide('client_approver', 'client')).toBe(true);
    expect(isRoleValidForSide('observer', 'vendor')).toBe(true);
    expect(isRoleValidForSide('observer', 'client')).toBe(true);
  });
});
