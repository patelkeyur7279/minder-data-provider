import { useCallback, useEffect, useState } from "react";
import { registerSentryProvider } from "minder-data-provider/providers/sentry";
import { pluginManager } from "minder-data-provider";
import type { PluginError } from "minder-data-provider";

// Mock mode: zero DSN, zero Sentry project, zero network calls. The same
// registered plugin lights up against a real Sentry project by flipping
// `mock: false` and supplying a real `dsn` — see providers/sentry/README.md
// and providers/sentry/example.ts.
//
// Note: Sentry's `dsn` is a public identifier, not a secret — like a Firebase
// `apiKey` or Stripe `publishableKey`, it is safe to ship in client bundles
// (see providers/sentry/src/index.ts).
const SENTRY_CONFIG = {
  dsn: "https://public@demo.ingest.sentry.io/1",
  mock: true,
};

export default function SentryPage() {
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  // Sentry is a PLUGIN, not a capability contract — there is no useX() hook.
  // Once registered, every error the plugin bus observes (fired by
  // ApiClient/MinderClient on request failure) flows to Sentry automatically,
  // with no call-site changes anywhere in the app. The mock sink's contents
  // live inside the `providers/sentry` package (not part of its published
  // export surface), so this counter tracks what THIS page has triggered —
  // it demonstrates the same onError path the plugin bus fires for real.
  const [capturedCount, setCapturedCount] = useState(0);

  useEffect(() => {
    let unregister: (() => void) | undefined;
    try {
      unregister = registerSentryProvider(SENTRY_CONFIG);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : String(err));
    }

    return () => {
      unregister?.();
    };
  }, []);

  const handleTriggerError = useCallback(async () => {
    setTriggerError(null);
    try {
      const fakeError: PluginError = {
        message: "Demo error triggered from the Sentry example page",
        code: "DEMO_ERROR",
        timestamp: Date.now(),
      };
      // Fires the same onError hook the plugin bus calls when ApiClient /
      // MinderClient observes a real request failure — the registered Sentry
      // plugin forwards it to the mock sink (zero network, zero DSN).
      await pluginManager.executeErrorHooks(fakeError);
      setCapturedCount((n) => n + 1);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1>Sentry provider &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        Mock mode &mdash; no Sentry account required. DSN is public; flip mock:false to send to
        real Sentry.
      </p>

      <p style={{ fontSize: "0.875rem", color: "#555" }}>
        Sentry DSN is public by design, not a secret.
      </p>

      <p style={{ fontSize: "0.875rem", color: "#555" }}>
        Errors from useMinder/ApiClient are forwarded to Sentry automatically &mdash; no call-site
        changes required once the provider is registered.
      </p>

      {registerError && (
        <p role="alert">Failed to register the Sentry provider: {registerError}</p>
      )}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Error reporting</h2>
        <button onClick={handleTriggerError}>Trigger demo error</button>
        <p>Captured events: {capturedCount}</p>
        {triggerError && <p role="alert">Trigger failed: {triggerError}</p>}
      </section>
    </main>
  );
}
