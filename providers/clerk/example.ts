/**
 * Runnable example for @minder/provider-clerk (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the dedicated-auth
 * shape of a Clerk integration:
 *   1. describe the provider in Minder config (public publishableKey inline; the
 *      secretKey via `secret()` — its value stays on the server),
 *   2. mount the SERVER session-verify handler on a server route,
 *   3. register the provider once at startup and consume it via `useAuth()`.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerClerkProvider, createClerkSessionHandler }
 *     from 'minder-data-provider/providers/clerk';
 *   import { useAuth, secret } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration. `minder add clerk`
 * (D-02) scaffolds the route file below for you.
 */
import { registerClerkProvider, createClerkSessionHandler } from './src/index.js';
import type { ClerkProviderConfig } from './src/index.js';
import { secret } from '../../src/security/secrets.js';
import { useAuth } from '../../src/hooks/contracts.js';

// 1. Config. `publishableKey` is PUBLIC (safe inline). `secretKey` is a secret
//    referenced by env-var name — its value stays on the server, and a raw string
//    here would hard-fail config validation in the browser.
const clerkConfig: ClerkProviderConfig = {
  publishableKey: 'pk_test_your_publishable_key',
  secretKey: secret('CLERK_SECRET_KEY'),
};

// 2. SERVER — the session-verify route. Reads `{ sessionToken }`, resolves the
//    secret key per-request, calls Clerk's session-verify API over fetch, and
//    returns `{ userId, valid }`. Mount this on a server route (Next.js App
//    Router example: export it as `POST`).
export const POST_verifySession = createClerkSessionHandler({
  secretKey: clerkConfig.secretKey!,
});

// 3. Register once at app startup. For credential-free UI development, pass
//    `{ ...clerkConfig, mock: true }` (or set providers.clerk.mock) instead —
//    getSession then returns a deterministic mock session with zero SDK/keys.
export async function startClerk(): Promise<() => void> {
  return registerClerkProvider(clerkConfig);
}

// 4. Consume it anywhere via the stable `useAuth()` hook — no Clerk glue.
export function AuthStatus(): { ready: boolean; userId: string | null } {
  const { ready, session } = useAuth();
  return { ready, userId: session?.userId ?? null };
}
