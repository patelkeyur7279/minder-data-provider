import { useCallback, useEffect, useState } from "react";
import { registerSupabaseProvider } from "minder-data-provider/providers/supabase";
import { useAuth, useStorage } from "minder-data-provider/nextjs";

// Mock mode: zero keys, zero Supabase project, zero network calls. The same
// `useAuth()` / `useStorage()` hooks light up against a real project by
// flipping `mock: false` and supplying real `url` / `anonKey` values — see
// providers/supabase/README.md and providers/supabase/example.ts.
const SUPABASE_CONFIG = {
  url: "https://example.supabase.co",
  anonKey: "mock",
  mock: true,
};

export default function SupabasePage() {
  const [registerError, setRegisterError] = useState<string | null>(null);
  const auth = useAuth();
  const storage = useStorage();
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unregister: (() => void) | undefined;

    registerSupabaseProvider(SUPABASE_CONFIG)
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
      const blob = new Blob(["hello from the mock Supabase storage demo"], {
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
      <h1>Supabase provider &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        Mock mode &mdash; no Supabase account required. Flip mock:false + real keys to go live.
      </p>

      {registerError && (
        <p role="alert">Failed to register the Supabase provider: {registerError}</p>
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
