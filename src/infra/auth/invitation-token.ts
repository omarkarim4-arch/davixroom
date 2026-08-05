import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Invitation tokens.
 *
 * The raw token exists in exactly two places: the link sent to the invitee, and
 * the request in which they present it. Only its SHA-256 hash is stored, so a
 * leaked database backup is not a set of working invitation links.
 *
 * 32 bytes because the token is the only thing standing between a stranger and
 * an invitation lookup. It is not sufficient on its own — acceptance also
 * requires being signed in as the confirmed address the invitation names — but
 * it should not be guessable either.
 */
export const newInvitationToken = (): string => randomBytes(32).toString('base64url');

export const hashInvitationToken = (token: string): string =>
  createHash('sha256').update(token.trim()).digest('hex');

/**
 * Constant-time comparison, for the rare call site that compares two hashes in
 * application code rather than letting Postgres match on the unique index.
 */
export const invitationHashesMatch = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
