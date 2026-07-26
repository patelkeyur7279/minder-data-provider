// Resource route (no default export → no UI, just a loader). Same-origin JSON
// endpoint the client-side useMinder("users") call in ../users-client.tsx
// hits, so the browser never needs CORS against the mock upstream on :8788.
// It proxies the mock upstream via minder() itself — the same call the index
// route's loader makes — so both the SSR and CSR paths go through minder().
import { minder } from "minder-data-provider";

interface User {
  id: number;
  name: string;
  email: string;
}

const MOCK_UPSTREAM_URL = process.env.MOCK_UPSTREAM_URL ?? "http://127.0.0.1:8788";

export async function loader() {
  const { data, success, error, status } = await minder<User[]>("/users", undefined, {
    baseURL: MOCK_UPSTREAM_URL,
    transport: "fetch",
  });

  if (!success) {
    return Response.json(
      { error: error?.message ?? "upstream request failed" },
      { status: status || 502 }
    );
  }
  return Response.json(data ?? []);
}
