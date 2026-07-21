/**
 * Runnable example for @minder/provider-authjs (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the zero-SDK shape of
 * an Auth.js (NextAuth.js v5) integration:
 *   1. describe the provider in Minder config (`basePath` only — no secret ever
 *      passes through Minder config for this provider),
 *   2. mount the SERVER session-verify handler on a server route, bridging YOUR
 *      app's own `auth()` (from `auth.ts`, built with `next-auth`) via the
 *      `sessionResolver` DI seam,
 *   3. register the provider once at startup and consume it via `useAuth()`.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerAuthjsProvider, createAuthjsSessionHandler }
 *     from 'minder-data-provider/providers/authjs';
 *   import { useAuth } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration.
 */
import { registerAuthjsProvider, createAuthjsSessionHandler } from './src/index.js';
import type { AuthjsProviderConfig } from './src/index.js';
import { useAuth } from '../../src/hooks/contracts.js';

// 1. Config. `basePath` is the only value Minder ever sees for this provider — it
//    is a same-origin route path, never a secret. Auth.js's own secret
//    (`AUTH_SECRET`) lives entirely in your app's `auth.ts` / environment.
const authjsConfig: AuthjsProviderConfig = {
  basePath: '/api/auth', // Auth.js's default; change only if you customized it
};

// 2. SERVER — the session-verify route. `sessionResolver` bridges YOUR app's own
//    `auth()` (from `auth.ts`, built with `next-auth`) into the handler; this
//    library never imports it directly (app-specific config). Next.js App Router:
//
//      // app/api/minder/authjs/verify-session/route.ts
//      import { auth } from '@/auth'; // your own auth.ts
//      import { createAuthjsSessionHandler } from 'minder-data-provider/providers/authjs';
//      export const GET = createAuthjsSessionHandler({ sessionResolver: () => auth() });
//
// Inlined here for illustration with a placeholder resolver:
export const GET_verifySession = createAuthjsSessionHandler({
  sessionResolver: async () => {
    // Replace with your own `auth()` call, e.g.: return auth();
    return null;
  },
});

// 3. Register once at app startup. For credential-free UI development, pass
//    `{ ...authjsConfig, mock: true }` (or set providers.authjs.mock) instead —
//    getSession then returns a deterministic mock session with zero network and no
//    Auth.js route mounted at all.
export async function startAuthjs(): Promise<() => void> {
  return registerAuthjsProvider(authjsConfig);
}

// 4. Consume it anywhere via the stable `useAuth()` hook — no Auth.js glue.
export function AuthStatus(): { ready: boolean; userId: string | null } {
  const { ready, session } = useAuth();
  return { ready, userId: session?.userId ?? null };
}
