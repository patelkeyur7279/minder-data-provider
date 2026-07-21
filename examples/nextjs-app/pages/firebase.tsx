import { useCallback, useEffect, useState } from "react";
import { registerFirebaseProvider } from "minder-data-provider/providers/firebase";
import { useAuth, useStorage } from "minder-data-provider/nextjs";

// Mock mode: zero keys, zero Firebase project, zero network calls. The same
// `useAuth()` / `useStorage()` hooks light up against a real Firebase project
// by flipping `mock: false`, supplying the real web config (apiKey,
// authDomain, projectId, ...), and adding a service-account file server-side
// for admin operations — see providers/firebase/README.md and
// providers/firebase/example.ts.
//
// Note: Firebase's `apiKey` is a public identifier, not a secret — it's safe
// to ship in client bundles (see providers/firebase/src/index.ts).
const FIREBASE_CONFIG = {
  apiKey: "demo-public-key",
  projectId: "demo",
  mock: true,
};

export default function FirebasePage() {
  const [registerError, setRegisterError] = useState<string | null>(null);
  const auth = useAuth();
  const storage = useStorage();
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;

    registerFirebaseProvider(FIREBASE_CONFIG)
      .then((unregisterFn) => {
        if (cancelled) {
          // Effect cleanup already ran before registration resolved — tear
          // down immediately instead of leaking the mock providers.
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

  const handleUpload = useCallback(async () => {
    setUploadError(null);
    setUploadUrl(null);
    try {
      const blob = new Blob(["hello from the mock Firebase storage demo"], {
        type: "text/plain",
      });
      const { url } = await storage.upload(blob, "demo-bucket/hello.txt");
      setUploadUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  }, [storage]);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1>Firebase provider &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        Mock mode &mdash; no Firebase account required. Flip mock:false + add a service-account
        file server-side to go live.
      </p>

      <p style={{ fontSize: "0.875rem", color: "#555" }}>
        Note: Firebase&apos;s <code>apiKey</code> is a public identifier, not a secret.
      </p>

      {registerError && (
        <p role="alert">Failed to register the Firebase provider: {registerError}</p>
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
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Storage</h2>
        <button onClick={handleUpload} disabled={!storage.ready}>
          Upload demo file
        </button>
        {uploadUrl && (
          <p>
            Uploaded to <code>{uploadUrl}</code>
          </p>
        )}
        {uploadError && <p role="alert">Upload failed: {uploadError}</p>}
      </section>
    </main>
  );
}
