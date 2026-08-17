// Home page — a Server Component (no "use client"). It renders the
// client component that calls useMinder(), proving the App Router
// RSC → client-component boundary works with minder-data-provider.
import UsersClient from "./users-client";

export default function Home() {
  return (
    <main>
      <h1>Minder Data Provider — Next.js App Router example</h1>
      <p>
        This page is a Server Component; the user list below is a client
        component rendered via useMinder(&quot;users&quot;) against a local
        /api/users route handler.
      </p>
      <UsersClient />
    </main>
  );
}
