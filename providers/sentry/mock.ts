/**
 * In-memory mock sink for the Sentry provider — zero SDK, zero DSN, zero
 * network. `mock: true` (see ./src/index.ts) forwards plugin-bus errors here
 * instead of `@sentry/browser`, so an app can build + test its whole error
 * pipeline with no Sentry project.
 *
 * `createSentryFactory` (the DI seam on `registerSentryProvider`) lets a test
 * or an app swap in ANY object shaped like `{ captureException, captureMessage? }`
 * — including this sink itself — without touching the real SDK path.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */

/** A single captured event, recorded exactly as handed to captureException/captureMessage. */
export interface SentryMockEvent {
  /** 'exception' for captureException, 'message' for captureMessage. */
  kind: 'exception' | 'message';
  /** The raw value passed in — an Error-like object for exceptions, a string for messages. */
  value: unknown;
  timestamp: number;
}

// Module-level so `getSentryMockEvents` reflects every capture regardless of
// which plugin instance forwarded it (mirrors providers/stripe/mock.ts).
const events: SentryMockEvent[] = [];

/** All events captured by the mock sink so far (a copy — safe to keep/iterate). */
export function getSentryMockEvents(): SentryMockEvent[] {
  return events.slice();
}

/** Test/demo helper: clear the recorded mock events. */
export function __resetSentryMockEvents(): void {
  events.length = 0;
}

/**
 * A fresh mock "Sentry instance" — the same shape `getProviderClient()` returns
 * for the real SDK (`captureException` + `captureMessage`) — that records into
 * the shared in-memory sink instead of calling out to Sentry.
 */
export function createSentryMockClient(): {
  captureException: (e: unknown) => void;
  captureMessage: (m: string) => void;
} {
  return {
    captureException(e: unknown) {
      events.push({ kind: 'exception', value: e, timestamp: Date.now() });
    },
    captureMessage(m: string) {
      events.push({ kind: 'message', value: m, timestamp: Date.now() });
    },
  };
}
