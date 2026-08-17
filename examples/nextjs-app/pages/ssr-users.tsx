import type { GetServerSideProps } from "next";
import Link from "next/link";
import { minder } from "minder-data-provider";

interface UpstreamUser {
  id: number;
  name: string;
}

interface SsrUsersProps {
  users: UpstreamUser[];
  error: string | null;
}

// Pages Router specifics, proven for real: this runs ONLY on the server, once
// per request, before the page is rendered — never in the browser. It calls
// `minder()` (the library's server-callable core function, not the
// `useMinder` client hook) directly against a local mock upstream HTTP
// server (mock-upstream.mjs, mirroring examples/edge-worker's pattern),
// exactly like examples/edge-worker/src/index.ts does on workerd. The
// resulting HTML — rendered before this ever reaches a browser — contains
// the fetched name; view-source (or a plain curl) proves it without any
// client-side JavaScript running.
export const getServerSideProps: GetServerSideProps<SsrUsersProps> = async () => {
  const baseURL = process.env.MOCK_UPSTREAM_URL ?? "http://127.0.0.1:8790";

  const { data, error, success } = await minder<UpstreamUser[]>("/users", undefined, {
    baseURL,
    transport: "fetch",
  });

  return {
    props: {
      users: success && data ? data : [],
      error: success ? null : (error?.message ?? "upstream request failed"),
    },
  };
};

export default function SsrUsersPage({ users, error }: SsrUsersProps) {
  return (
    <main>
      <h1>Server-rendered users (getServerSideProps + minder())</h1>
      <p>
        This page calls <code>minder()</code> directly inside{" "}
        <code>getServerSideProps</code> &mdash; no client fetch, no{" "}
        <code>useMinder</code> &mdash; against a local mock upstream HTTP server
        (<code>mock-upstream.mjs</code>, mirroring{" "}
        <code>examples/edge-worker</code>). The list below is already in the
        HTML this route returns; disable JavaScript and reload to confirm.
      </p>
      <p>
        <Link href="/">&larr; Back to the index example</Link>
      </p>
      {error && <p role="alert">Failed to load users server-side: {error}</p>}
      <ul>
        {users.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </main>
  );
}
