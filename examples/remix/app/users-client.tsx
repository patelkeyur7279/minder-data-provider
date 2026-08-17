// Client component exercising the useMinder() hook path (as opposed to the
// server-side minder() call in ../routes/home.tsx). Mirrors
// ../nextjs-app-router/app/users-client.tsx.
import { useMinder } from "minder-data-provider";

interface User {
  id: number;
  name: string;
  email: string;
}

export default function UsersClient() {
  const { data, loading, error } = useMinder<User[]>("users");

  return (
    <section aria-label="Client-fetched users (useMinder)">
      <h2>Client users (useMinder)</h2>
      {loading && <p>Loading users&hellip;</p>}
      {error && (
        <p role="alert">Failed to load users: {String(error.message || error)}</p>
      )}
      {!loading && !error && (
        <ul data-testid="client-users">
          {(data ?? []).map((user) => (
            <li key={user.id}>
              {user.name} &mdash; {user.email}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
