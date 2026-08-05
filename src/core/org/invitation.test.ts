import { describe, expect, it } from 'vitest';
import {
  invitationKind,
  invitationMatchesEmail,
  invitationStatus,
  isInvitationOpen,
} from './invitation';
import { anInvitation, T0 } from '../testing/doubles';

const HOUR = 60 * 60 * 1000;

describe('invitationKind', () => {
  it('is client when a project is named and team when it is not', () => {
    expect(invitationKind(anInvitation())).toBe('client');
    expect(invitationKind(anInvitation({ projectId: null, role: null }))).toBe('team');
  });
});

describe('invitationStatus', () => {
  it('is pending inside its window', () => {
    expect(invitationStatus(anInvitation(), T0 + HOUR)).toBe('pending');
    expect(isInvitationOpen(anInvitation(), T0 + HOUR)).toBe(true);
  });

  it('expires exactly at its boundary rather than a moment later', () => {
    const invitation = anInvitation({ expiresAt: T0 + HOUR });

    expect(invitationStatus(invitation, T0 + HOUR - 1)).toBe('pending');
    expect(invitationStatus(invitation, T0 + HOUR)).toBe('expired');
  });

  it('reports revoked ahead of accepted', () => {
    const invitation = anInvitation({
      acceptedAt: T0 + HOUR,
      revokedAt: T0 + 2 * HOUR,
    });

    expect(invitationStatus(invitation, T0 + 3 * HOUR)).toBe('revoked');
    expect(isInvitationOpen(invitation, T0 + 3 * HOUR)).toBe(false);
  });

  /**
   * An invitation already used does not become reusable when its window
   * closes — otherwise "expired" would read as a safer state than "accepted".
   */
  it('reports accepted ahead of expired', () => {
    const invitation = anInvitation({
      acceptedAt: T0 + HOUR,
      expiresAt: T0 + 2 * HOUR,
    });

    expect(invitationStatus(invitation, T0 + 3 * HOUR)).toBe('accepted');
  });

  it('is not open once accepted, revoked or expired', () => {
    const now = T0 + 3 * HOUR;

    expect(isInvitationOpen(anInvitation({ acceptedAt: T0 }), now)).toBe(false);
    expect(isInvitationOpen(anInvitation({ revokedAt: T0 }), now)).toBe(false);
    expect(isInvitationOpen(anInvitation({ expiresAt: T0 + HOUR }), now)).toBe(false);
  });
});

describe('invitationMatchesEmail', () => {
  it('ignores case and surrounding space', () => {
    const invitation = anInvitation({ email: 'Approver@Client.test' });

    expect(invitationMatchesEmail(invitation, 'approver@client.test')).toBe(true);
    expect(invitationMatchesEmail(invitation, '  APPROVER@CLIENT.TEST  ')).toBe(true);
  });

  it('rejects a different address', () => {
    // The token must never be the credential on its own: whoever obtains the
    // link still has to be signed in as the person it names.
    expect(invitationMatchesEmail(anInvitation(), 'someone.else@client.test')).toBe(
      false,
    );
  });
});
