/**
 * Runnable example for @minder/provider-cognito (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the shape of a
 * Cognito integration:
 *   1. describe the provider in Minder config (no secret ever passes through
 *      Minder config for this provider — the Cognito App Client used here has
 *      none),
 *   2. mount the SERVER session-verify handler on a server route, which calls
 *      the user pool's own OAuth2 `/oauth2/userInfo` endpoint directly (no DI
 *      seam needed),
 *   3. register the provider once at startup and consume it via `useAuth()`.
 *
 * In a real app you would import from the published package:
 *
 *   import { registerCognitoProvider, createCognitoSessionHandler }
 *     from 'minder-data-provider/providers/cognito';
 *   import { useAuth } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration.
 */
import { registerCognitoProvider, createCognitoSessionHandler } from './src/index.js';
import type { CognitoProviderConfig } from './src/index.js';
import { useAuth } from '../../src/hooks/contracts.js';

// 1. Config. Every value here is client-safe — the Cognito App Client used by
//    this adapter MUST be a "public client" (no client secret generated).
const cognitoConfig: CognitoProviderConfig = {
  userPoolId: 'us-east-1_ExamplePool',
  userPoolClientId: 'example_app_client_id',
};

// 2. SERVER — the session-verify route. Reads the caller's `Authorization:
//    Bearer <token>` header and forwards it to the user pool's own OAuth2
//    `GET https://{userPoolDomain}/oauth2/userInfo` endpoint — no SDK, no DI
//    seam, no secret. Requires a Hosted UI domain configured for the user pool
//    (Cognito console -> App integration -> Domain) and an access token
//    obtained via the Hosted UI / OAuth2 authorization-code flow. Mount this
//    on a server route (Next.js App Router example: export it as `GET`).
export const GET_verifySession = createCognitoSessionHandler({
  userPoolDomain: 'your-app.auth.us-east-1.amazoncognito.com',
});

// 3. Register once at app startup. For credential-free UI development, pass
//    `{ ...cognitoConfig, mock: true }` (or set providers.cognito.mock)
//    instead — getSession then returns a deterministic mock session with zero
//    SDK/pool.
export async function startCognito(): Promise<() => void> {
  return registerCognitoProvider(cognitoConfig);
}

// 4. Consume it anywhere via the stable `useAuth()` hook — no Cognito glue.
export function AuthStatus(): { ready: boolean; userId: string | null } {
  const { ready, session } = useAuth();
  return { ready, userId: session?.userId ?? null };
}
