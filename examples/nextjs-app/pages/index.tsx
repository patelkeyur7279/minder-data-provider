import { useMinder } from "minder-data-provider/nextjs";

interface User {
  id: number;
  name: string;
  email: string;
}

export default function Home() {
  const { data, loading, error } = useMinder<User[]>("users");

  if (loading) {
    return <p>Loading users&hellip;</p>;
  }

  if (error) {
    return <p role="alert">Failed to load users: {String(error.message || error)}</p>;
  }

  const users = data ?? [];

  return (
    <main>
      <h1>Minder Data Provider — Next.js example</h1>
      <p>Rendered via useMinder(&quot;users&quot;) against a local /api/users route.</p>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.name} &mdash; {user.email}
          </li>
        ))}
      </ul>
    </main>
  );
}
