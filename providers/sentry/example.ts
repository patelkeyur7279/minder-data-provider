/**
 * Runnable example for @minder/provider-sentry (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. Unlike the capability-
 * contract providers (Stripe, Supabase, …), there is no hook to call: once
 * registered, the Sentry plugin observes the plugin bus automatically. Every
 * error that `useMinder`/`ApiClient` would already have surfaced now ALSO
 * flows to Sentry — no call-site changes anywhere in the app.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerSentryProvider } from 'minder-data-provider/providers/sentry';
 *
 * In-repo, this resolves via a relative path for illustration.
 */
import { registerSentryProvider } from './src/index.js';
import type { SentryProviderConfig } from './src/index.js';

// Config. `dsn` is PUBLIC BY DESIGN (see README.md → Security) — it identifies
// which Sentry project to send events to and grants no read access, so unlike
// Stripe's secretKey/webhookSecret it is fine inline, with no secret() wrapper.
const sentryConfig: SentryProviderConfig = {
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
};

// Register once at app startup. From this point on, errors observed by the
// plugin bus (fired from ApiClient/MinderClient on request failure) flow to
// Sentry.captureException automatically — useMinder(), useQuery-style hooks,
// and any direct ApiClient usage all report through the same path.
export function startSentry(): () => void {
  return registerSentryProvider(sentryConfig);
}

// For credential-free development, flip `mock: true` (or set
// providers.sentry.mock) instead — errors are recorded in an in-memory sink
// (see mock.ts → getSentryMockEvents()) with zero DSN and zero network, so
// tests and demos can assert on what would have been reported.
export function startSentryMock(): () => void {
  return registerSentryProvider({ ...sentryConfig, mock: true });
}

// Teardown: the returned unregister() removes the plugin from the plugin bus.
export async function demoLifecycle(): Promise<void> {
  const unregister = startSentryMock();
  // ...errors from useMinder()/ApiClient now flow to Sentry (or the mock sink)...
  unregister();
}
