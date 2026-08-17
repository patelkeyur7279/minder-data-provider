import { useMinder } from 'minder-data-provider';

interface User {
  id: number;
  name: string;
  email: string;
}

/**
 * A minimal minder-data-provider demo.
 *
 * `useMinder(url)` fetches, caches (via TanStack Query), and tracks loading/error
 * for you. Point it at any REST endpoint — here a public demo API. For your own
 * API, call `configureMinder({ apiUrl: '...' })` once (e.g. in main.tsx) and then
 * use named routes like `useMinder('users')`.
 */
export function App() {
  const { data: users, loading, error } = useMinder<User[]>(
    'https://jsonplaceholder.typicode.com/users'
  );

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>minder-data-provider</h1>
      <p>One hook — fetch, cache, loading &amp; error handled for you.</p>

      {loading && <p>Loading users…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error.message}</p>}

      <ul>
        {users?.map((u) => (
          <li key={u.id}>
            <strong>{u.name}</strong> — {u.email}
          </li>
        ))}
      </ul>
    </main>
  );
}
