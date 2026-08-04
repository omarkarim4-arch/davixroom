/**
 * Explicit success/failure results.
 *
 * Domain rules return `Result` rather than throwing. Authorization denials and
 * invariant violations are expected outcomes that callers must handle, not
 * exceptional conditions — making them values keeps the handling visible at the
 * call site instead of hidden in a catch block somewhere up the stack.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok;

/** Unwraps a result, throwing on failure. Intended for tests and seed code. */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(
      `Attempted to unwrap a failed Result: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
};
