import { describe, expect, it } from 'vitest';
import {
  grantStatus,
  isGrantActive,
  projectScope,
  revoke,
  scopeCovers,
  sessionScope,
  type Grant,
} from './grant';
import { asId } from '../ids';
import { MINUTE_MS } from '../time';
import { T0 } from '../testing/doubles';

const session = asId<'SessionId'>('session-1');
const otherSession = asId<'SessionId'>('session-2');

const grant: Grant = {
  id: asId<'GrantId'>('grant-1'),
  projectId: asId<'ProjectId'>('project-1'),
  subjectUserId: asId<'UserId'>('user-1'),
  capability: 'session.control',
  scope: sessionScope(session),
  grantedBy: asId<'UserId'>('dev-1'),
  grantedAt: T0,
  expiresAt: T0 + 15 * MINUTE_MS,
  revokedAt: null,
};

describe('grantStatus', () => {
  it('is active before expiry', () => {
    expect(grantStatus(grant, T0 + MINUTE_MS)).toBe('active');
    expect(isGrantActive(grant, T0 + MINUTE_MS)).toBe(true);
  });

  it('is expired at and after the expiry instant', () => {
    expect(grantStatus(grant, T0 + 15 * MINUTE_MS)).toBe('expired');
    expect(grantStatus(grant, T0 + 16 * MINUTE_MS)).toBe('expired');
  });

  it('never expires when expiresAt is null', () => {
    expect(grantStatus({ ...grant, expiresAt: null }, T0 + 10_000 * MINUTE_MS)).toBe(
      'active',
    );
  });

  it('reports revoked in preference to expired, for a clean audit trail', () => {
    const revoked = revoke(grant, T0 + MINUTE_MS);
    expect(grantStatus(revoked, T0 + 60 * MINUTE_MS)).toBe('revoked');
  });

  it('treats a future revocation as not yet in effect', () => {
    const revoked = revoke(grant, T0 + 10 * MINUTE_MS);
    expect(grantStatus(revoked, T0 + 5 * MINUTE_MS)).toBe('active');
  });
});

describe('scopeCovers', () => {
  it('lets project scope cover everything within the project', () => {
    expect(scopeCovers(projectScope(), projectScope())).toBe(true);
    expect(scopeCovers(projectScope(), sessionScope(session))).toBe(true);
  });

  it('confines session scope to its own session', () => {
    expect(scopeCovers(sessionScope(session), sessionScope(session))).toBe(true);
    expect(scopeCovers(sessionScope(session), sessionScope(otherSession))).toBe(false);
    expect(scopeCovers(sessionScope(session), projectScope())).toBe(false);
  });
});
