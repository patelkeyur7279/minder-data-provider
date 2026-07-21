import Link from "next/link";
import { useMinder } from "minder-data-provider/nextjs";

interface User {
  id: number;
  name: string;
  email: string;
}

// Local-first demo: useMinder("users", { source: "local-first" }) fetches
// /api/users normally, then persists a successful response to on-device
// storage (localStorage in this browser example, via LocalStore /
// StorageAdapterFactory). On a later load where the network fails — try
// throttling to "Offline" in DevTools and reloading — the same list still
// renders, served from the last persisted copy instead of an error. See
// docs/LOCAL_FIRST.md for the full guide (this is not a sync engine — it
// persists the last successful query result only).
export default function LocalFirstPage() {
  const { data, loading, error, query } = useMinder<User[]>("users", {
    source: "local-first",
    // Explicit queryKey so it's easy to see (and reuse) the exact key
    // LocalStore persists under — see "Query keys and pre-seeding" in
    // docs/LOCAL_FIRST.md.
    queryKey: ["users"],
  });

  const users = data ?? [];
  // The raw MinderResult (available via the escape-hatch `query` object, not
  // just `data`) carries `metadata.cached: true` when this render came from
  // the local fallback rather than a live network response.
  const servedFromLocalCache = query?.data?.metadata?.cached === true;

  return (
    <main style={{ fontFamily: "sans-serif", padding: "1.5rem", maxWidth: 640 }}>
      <h1>Local-first data &mdash; mock mode</h1>

      <p
        role="note"
        style={{
          background: "#fffbe6",
          border: "1px solid #f0d975",
          borderRadius: 4,
          padding: "0.75rem 1rem",
        }}
      >
        <code>source: &quot;local-first&quot;</code> fetches <code>/api/users</code> normally
        and persists a successful response locally. Reload this page with your network
        disabled (or throttled to &quot;Offline&quot; in DevTools) and the same list still
        renders &mdash; served from the last persisted copy instead of an error.
      </p>

      <p>
        <Link href="/">&larr; Back to the index example</Link>
      </p>

      {loading && <p>Loading users&hellip;</p>}
      {error && <p role="alert">Failed to load users: {String(error.message || error)}</p>}

      {servedFromLocalCache && (
        <p role="status">
          Served from the local persisted copy &mdash; the network read failed or was
          unavailable.
        </p>
      )}

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.name} &mdash; {user.email}
          </li>
        ))}
      </ul>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>How this works</h2>
        <ul>
          <li>
            First load (network available): the query hits <code>/api/users</code>, the
            response renders above, and it&apos;s persisted under the query key{" "}
            <code>[&quot;users&quot;]</code>.
          </li>
          <li>
            A later load with the network unavailable: the fetch fails, and{" "}
            <code>useMinder</code> falls back to the persisted copy instead of surfacing the
            network error &mdash; same shape, same <code>data</code>, no extra code in this
            component.
          </li>
          <li>
            This is <em>not</em> a sync engine: it persists the last successful query result
            only, with no conflict resolution and no offline mutation queue. Full guide,
            storage-backend table, and limitations: <code>docs/LOCAL_FIRST.md</code>.
          </li>
        </ul>
      </section>
    </main>
  );
}
