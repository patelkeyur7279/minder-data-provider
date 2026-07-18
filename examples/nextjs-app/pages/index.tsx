import Link from "next/link";
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
      <p>
        <Link href="/supabase">See the Supabase provider demo (mock mode, zero keys) &rarr;</Link>
      </p>
      <p>
        <Link href="/stripe">See the Stripe provider demo (mock mode, zero keys) &rarr;</Link>
      </p>
      <p>
        <Link href="/clerk">See the Clerk provider demo (mock mode, zero keys) &rarr;</Link>
      </p>
      <p>
        <Link href="/firebase">See the Firebase provider demo (mock mode, zero keys) &rarr;</Link>
      </p>
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
