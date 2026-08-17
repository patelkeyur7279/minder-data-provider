// Client-side data path: useMinder("users") against this app's own
// /api/users Astro server endpoint. Split out from UsersIsland.tsx so it can
// be unit-tested with a minimal QueryClientProvider (see tests/UsersList.test.tsx)
// without needing the full Astro runtime.
import { useMinder } from 'minder-data-provider';
import type { User } from '../lib/minder-config';

export default function UsersList() {
  const { data, loading, error } = useMinder<User[]>('users');

  if (loading) {
    return <p data-testid="island-loading">Loading users&hellip;</p>;
  }

  if (error) {
    return (
      <p role="alert" data-testid="island-error">
        Failed to load users: {String(error.message || error)}
      </p>
    );
  }

  const users = data ?? [];

  return (
    <ul data-testid="island-users">
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
