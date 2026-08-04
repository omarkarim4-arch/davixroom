/**
 * Time as an explicit value.
 *
 * The domain never reads the wall clock directly. Grant expiry, decision
 * timestamps, and event ordering all take `now` as a parameter, which makes
 * time-dependent rules deterministically testable.
 */

/** Milliseconds since the Unix epoch, UTC. */
export type Timestamp = number;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const toIso = (at: Timestamp): string => new Date(at).toISOString();

export const fromIso = (iso: string): Timestamp => Date.parse(iso);
