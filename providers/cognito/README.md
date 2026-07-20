# @minder/provider-cognito

The Amazon Cognito adapter for [Minder](../../README.md). One stable hook —
`useAuth()` — over AWS Amplify's Cognito auth module, so you switch auth
providers by config, not by rewriting integration code. On the server, a
Cognito access token is verified by calling the user pool's own OAuth2
`/oauth2/userInfo` endpoint — no crypto library, no secret, no DI seam
required.

- **Categories:** auth
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed —
  untested here, even though Amplify ships an RN-compatible build)
- **Peer dependency:** `aws-amplify` `^6.0.0` (optional; only for the client
  auth adapter / raw-SDK escape hatch via `getProviderClient()` — server
  session verification uses `fetch`, no SDK)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Cognito user pool and app client** in the
   [Amazon Cognito console](https://console.aws.amazon.com/cognito):
   - **User pool id** (`userPoolId`, e.g. `us-east-1_AbCdEfGhI`) — public,
     client-safe.
   - **App client id** (`userPoolClientId`) — create the app client as a
     **public client (no client secret)**. This adapter runs in the browser;
     a client secret cannot be kept safe there, and Amplify's browser SDK path
     does not support one.
   - **(Server verification only) Hosted UI domain** — under **App
     integration -> Domain**, configure either a Cognito domain
     (`your-app.auth.<region>.amazoncognito.com`) or a custom domain. This is
     a **prerequisite** for `createCognitoSessionHandler` — without a
     configured domain, `/oauth2/userInfo` does not exist to call.
2. **Install the SDK** — only needed for the client auth adapter and the
   raw-client escape hatch (`getProviderClient()`); server session
   verification works without it:
   ```sh
   npm i aws-amplify
   ```
3. **Configure Minder.** There is no secret value in this provider's config at
   all — everything below is safe to inline:
   ```ts
   // minder.config.ts
   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       cognito: {
         userPoolId: 'us-east-1_AbCdEfGhI',
         userPoolClientId: 'your_app_client_id',
       },
     },
   };
   ```
4. **Mount the server route** — a session-verify route that calls the user
   pool's own OAuth2 `/oauth2/userInfo` endpoint:
   ```ts
   // app/api/minder/cognito/verify-session/route.ts (Next.js App Router)
   import { createCognitoSessionHandler } from 'minder-data-provider/providers/cognito';
   export const GET = createCognitoSessionHandler({
     userPoolDomain: 'your-app.auth.us-east-1.amazoncognito.com',
   });
   ```
   **Important:** this endpoint only accepts access tokens obtained via the
   Hosted UI / OAuth2 authorization-code flow (Amplify's
   `signInWithRedirect()`) — access tokens from a direct username/password
   sign-in (`InitiateAuth`) carry no OAuth scopes and are rejected upstream
   (mapped here to `{ userId: null, valid: false }`, never a crash). See
   "Security" below.
5. **Register the provider** once at startup, then use the hook:
   ```ts
   import { registerCognitoProvider } from 'minder-data-provider/providers/cognito';

   const unregister = await registerCognitoProvider(); // reads providers.cognito
   // ...in a component:
   const { ready, session, signOut } = useAuth();
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero keys, zero user pool)

Develop the entire auth UI with no Cognito user pool by flipping one flag:
```ts
providers: { cognito: { mock: true } }
```
The same `useAuth()` hook lights up against an in-memory mock: `getSession`
returns a deterministic signed-in session (`{ userId: 'cognito-mock-user', raw:
{ sub: 'cognito-mock-user', 'cognito:username': ..., email: ..., exp: <24h
out>, idToken: '<fake-3-segment-jwt>' } }`) with zero SDK, zero pool, and zero
network; `signOut` clears it. Flip `mock` back to `false` to go live — no code
changes.

### Teardown / uninstall

`registerCognitoProvider()` returns an `unregister()` that removes the auth
capability provider. To fully remove the provider, delete the
`providers.cognito` config block, delete the scaffolded route file, and
uninstall `aws-amplify`.

## Security

**No secret value exists anywhere in this provider's config surface.** The
Cognito App Client used by this adapter must be created as a "public client"
(no client secret generated) — like Auth0's SPA/PKCE clients, it has no secret
to leak. `userPoolId` and `userPoolClientId` are public identifiers and are
registered client-safe, along with every other config value this provider
reads.

**Fail-closed session validation (client).** `getSession()` calls
`client.fetchAuthSession()`; if the response carries no ID token (signed out,
or a guest/unauthenticated identity), it returns `null`. Otherwise it reads
the decoded `tokens.idToken.payload` and runs it through the same `toSession()`
check enforced across every certified auth provider: a session is accepted
ONLY if `sub` is a non-empty string AND `exp` (numeric, UNIX seconds) is
strictly in the future. Anything else — missing claims, missing/empty `sub`,
missing/non-numeric/already-past `exp` — is rejected and treated as
signed-out.

**Server-side session verification never trusts the client.** Protected
server routes should call `createCognitoSessionHandler`'s handler, never a
client-asserted user id. It reads the caller's `Authorization: Bearer <token>`
header (400 if missing/malformed) and forwards it, unmodified, to the user
pool's own OAuth2 `GET https://{userPoolDomain}/oauth2/userInfo` endpoint —
Cognito itself performs the verification upstream. A 200 response means the
token is valid (`{ userId: sub, valid: true }`); any non-200 response
(401/403/etc.) maps to `{ userId: null, valid: false }` — the upstream
response body is never thrown through raw. A network failure maps to a masked
502 (`COGNITO_UPSTREAM_ERROR`), the same pattern as Auth0's
`AUTH0_UPSTREAM_ERROR`. A non-GET request is rejected with 405.

**Known trade-off / prerequisite (documented, not fixed here).**
`/oauth2/userInfo` requires (1) a Hosted UI domain configured for the user
pool (Cognito console -> App integration -> Domain) — with no domain
configured, the endpoint does not exist — and (2) an access token obtained
via the Hosted UI / OAuth2 authorization-code flow (Amplify's
`signInWithRedirect()`), because Cognito only issues OAuth-scoped access
tokens through that flow; access tokens from a direct username/password
`InitiateAuth` sign-in carry no scopes and are rejected by `/oauth2/userInfo`
(mapped to `{ userId: null, valid: false }`, never a crash). This is Cognito's
own endpoint behavior, verified 2026-07-21 — not a limitation this adapter
introduces. Separately, calling `/oauth2/userInfo` on every server-side verify
is the simplest zero-dependency, edge-safe design for v1; a high-traffic
resource server may prefer local JWKS-based JWT verification instead — the
same trade-off class Auth0's own `/userinfo`-based design already accepts in
this repo.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | -------------- |
| `userPoolId` | Cognito console -> User pools -> your pool -> User pool overview -> User pool ID | Yes (public pool identifier) | inline in config |
| `userPoolClientId` | Cognito console -> User pools -> your pool -> App integration -> App clients -> your **public** app client -> Client ID | Yes (public clients have no secret) | inline in config |
| `userPoolDomain` (server handler only) | Cognito console -> User pools -> your pool -> App integration -> Domain | Yes (public, resolvable domain) | inline in the server handler's config |

Get your pool and app client settings at <https://console.aws.amazon.com/cognito>.

**Rotation.** Public Cognito app clients have no client secret to rotate. If
you suspect `userPoolClientId`/`userPoolId` exposure is a problem, deleting
and recreating the app client (or restricting its allowed OAuth flows/callback
URLs) in the Cognito console is the relevant control — not a secret rotation,
since none exists here.

**Teardown.** Remove the `providers.cognito` config block and the scaffolded
route file. There is no key to revoke on this adapter's side; delete the app
client (or the user pool) in the Cognito console to fully revoke its use.
