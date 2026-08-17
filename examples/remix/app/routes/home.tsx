// Index route. The loader below is the point of this example: it fetches
// server-side via minder() (root "minder-data-provider" export) against a
// local mock upstream, and the result renders straight into the SSR'd HTML —
// no client JS required to see it. A separate client-side path (Providers +
// UsersClient, mounted below) exercises useMinder() against the same-origin
// /api/users resource route to prove the hook works in this framework too.
import { useLoaderData } from "react-router";
import { minder } from "minder-data-provider";
import Providers from "../providers";
import UsersClient from "../users-client";

interface User {
  id: number;
  name: string;
  email: string;
}

interface LoaderData {
  users: User[];
  error: string | null;
}

const MOCK_UPSTREAM_URL = process.env.MOCK_UPSTREAM_URL ?? "http://127.0.0.1:8788";

export async function loader(): Promise<LoaderData> {
  const { data, success, error } = await minder<User[]>("/users", undefined, {
    baseURL: MOCK_UPSTREAM_URL,
    // Force the native-fetch transport (same one minder auto-selects on
    // edge/SSR runtimes) rather than the default axios transport, so this
    // example also documents that path — see ../edge-worker for the same
    // choice under real workerd.
    transport: "fetch",
  });

  return {
    users: success ? data ?? [] : [],
    error: success ? null : error?.message ?? "upstream request failed",
  };
}

export default function Home() {
  const { users, error } = useLoaderData<LoaderData>();

  return (
    <main data-testid="app-root">
      <h1>minder-data-provider &mdash; React Router (Remix) example</h1>
      <p>
        This page&apos;s <code>loader</code> fetches server-side via{" "}
        <code>minder()</code> against a local mock upstream. The list below
        renders from that SSR data with no client-side request required.
      </p>

      <section aria-label="Server-loaded users (loader)">
        <h2>Server users (loader)</h2>
        {error ? (
          <p role="alert">Failed to load users: {error}</p>
        ) : (
          <ul data-testid="server-users">
            {users.map((user) => (
              <li key={user.id}>
                {user.name} &mdash; {user.email}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Providers>
        <UsersClient />
      </Providers>
    </main>
  );
}
