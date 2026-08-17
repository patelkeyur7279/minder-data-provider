// React island entry point — mounted from src/pages/index.astro with
// `client:load`. Proves useMinder() works client-side inside a hydrated
// Astro island (not just SSR).
import Providers from './Providers';
import UsersList from './UsersList';

export default function UsersIsland() {
  return (
    <Providers>
      <div data-testid="users-island">
        <h2>Client-side (React island, useMinder)</h2>
        <UsersList />
      </div>
    </Providers>
  );
}
