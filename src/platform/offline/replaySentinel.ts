/**
 * Replay executor ↔ OfflineManager contract (Spec 5.1 §10.1).
 *
 * INTERNAL ONLY — deliberately NOT re-exported from `./index.ts` (the public
 * offline barrel). This module exists purely so `ApiClient` (the injected
 * replay executor) and `OfflineManager` (the conflict-policy owner) can share
 * a type without either file guessing at the other's shape. Reaching into
 * this path directly is unsupported; it carries no semver guarantee.
 *
 * Rationale (option (a) from §10.1): the executor reports a uniform
 * HTTP-outcome sentinel for ANY server response error; the offline layer
 * alone owns `conflictStatuses` membership and all conflict policy. This
 * keeps `ApiClient` a dumb transport and keeps `OfflineManager` self-contained.
 */

/**
 * Returned by the injected replay executor instead of throwing, whenever the
 * replayed request got a response but a non-2xx status. A genuine transport
 * failure (network/timeout — no `response`) is NOT represented here; the
 * executor re-throws that unchanged.
 */
export interface ReplayErrorSentinel {
  __minderReplayOutcome: 'error';
  /** HTTP status of the replay response. */
  status: number;
  /** Response body, as-is (candidate `server` value for conflict resolution). */
  serverData: unknown;
  /** Verbatim `Error#message` from the underlying transport error (axios). */
  message: string;
  /** Underlying transport error code, if any (e.g. axios `err.code`). */
  code?: string;
}

/**
 * Narrow an executor result to a {@link ReplayErrorSentinel}.
 */
export function isReplayErrorSentinel(value: unknown): value is ReplayErrorSentinel {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).__minderReplayOutcome === 'error'
  );
}
