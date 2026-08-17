import { useCallback, useEffect, useState } from "react";
import { registerClerkProvider } from "minder-data-provider/providers/clerk";
import { useAuth } from "minder-data-provider/nextjs";

// Mock mode: zero keys, zero Clerk account, zero network calls. The same
// `useAuth()` hook lights up against a real Clerk account by flipping
// `mock: false`, supplying a real `publishableKey`, and adding the server
// session-verify route with a real `CLERK_SECRET_KEY` — see
// providers/clerk/README.md and providers/clerk/example.ts.
const CLERK_CONFIG = {
  publishableKey: "pk_test_demo",
  mock: true,
};

export default function ClerkPage() {
  const [registerError, setRegisterError] = useState<string | null>(null);
  const auth = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;

    registerClerkProvider(CLERK_CONFIG)
      .then((unregisterFn) => {
        if (cancelled) {
          // Effect cleanup already ran before registration resolved — tear
          // down immediately instead of leaking the mock provider.
          unregisterFn();
          return;
        }
        unregister = unregisterFn;
      })
      .catch((err) => {
        if (!cancelled) {
          setRegisterError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      unregister?.();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setSignOutError(null);
    try {
      await auth.signOut();
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : String(err));
    }
  }, [auth]);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1>Clerk provider &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        Mock mode &mdash; no Clerk account required. Flip mock:false + add server route with real
        keys to go live.
      </p>

      {registerError && (
        <p role="alert">Failed to register the Clerk provider: {registerError}</p>
      )}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Auth</h2>
        {!auth.ready ? (
          <p>Registering mock provider&hellip;</p>
        ) : auth.session ? (
          <p>
            Signed in as <code>{auth.session.userId}</code>
          </p>
        ) : (
          <p>Not signed in.</p>
        )}
        <button onClick={handleSignOut} disabled={!auth.ready}>
          Sign out
        </button>
        {signOutError && <p role="alert">Sign out failed: {signOutError}</p>}
      </section>
    </main>
  );
}
