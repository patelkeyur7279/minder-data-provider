"use client";

import { useMinder } from "minder-data-provider";

interface User {
  id: number;
  name: string;
  email: string;
}

export default function UsersClient() {
  const { data, loading, error } = useMinder<User[]>("users");

  if (loading) {
    return <p>Loading users&hellip;</p>;
  }

  if (error) {
    return <p role="alert">Failed to load users: {String(error.message || error)}</p>;
  }

  const users = data ?? [];

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>
          {user.name} &mdash; {user.email}
        </li>
      ))}
    </ul>
  );
}
