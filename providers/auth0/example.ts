/**
 * Runnable example for @minder/provider-auth0 (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the shape of an
 * Auth0 integration:
 *   1. describe the provider in Minder config (no secret ever passes through
 *      Minder config for this provider — Auth0 SPA clients have none),
 *   2. mount the SERVER session-verify handler on a server route, which calls
 *      Auth0's own public `/userinfo` endpoint directly (no DI seam needed),
 *   3. register the provider once at startup and consume it via `useAuth()`.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerAuth0Provider, createAuth0SessionHandler }
 *     from 'minder-data-provider/providers/auth0';
 *   import { useAuth } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration.
 */
import { registerAuth0Provider, createAuth0SessionHandler } from './src/index.js';
import type { Auth0ProviderConfig } from './src/index.js';
import { useAuth } from '../../src/hooks/contracts.js';

// 1. Config. Every value here is client-safe — Auth0 SPA/PKCE clients have no
//    secret at all.
const auth0Config: Auth0ProviderConfig = {
  domain: 'your-tenant.us.auth0.com',
  clientId: 'your_client_id',
  audience: 'https://your-api-identifier', // optional
  redirectUri: 'https://your-app.example.com/callback', // optional
};

// 2. SERVER — the session-verify route. Reads the caller's `Authorization:
//    Bearer <token>` header and forwards it to Auth0's own public
//    `GET {domain}/userinfo` endpoint — no SDK, no DI seam, no secret. Mount
//    this on a server route (Next.js App Router example: export it as `GET`).
export const GET_verifySession = createAuth0SessionHandler({
  domain: auth0Config.domain!,
});

// 3. Register once at app startup. For credential-free UI development, pass
//    `{ ...auth0Config, mock: true }` (or set providers.auth0.mock) instead —
//    getSession then returns a deterministic mock session with zero SDK/keys.
export async function startAuth0(): Promise<() => void> {
  return registerAuth0Provider(auth0Config);
}

// 4. Consume it anywhere via the stable `useAuth()` hook — no Auth0 glue.
export function AuthStatus(): { ready: boolean; userId: string | null } {
  const { ready, session } = useAuth();
  return { ready, userId: session?.userId ?? null };
}
