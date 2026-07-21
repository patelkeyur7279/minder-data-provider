# @minder/provider-auth0

The Auth0 adapter for [Minder](../../README.md). One stable hook — `useAuth()` —
over Auth0's own SPA client, so you switch auth providers by config, not by
rewriting integration code. On the server, an Auth0 access token is verified by
calling Auth0's own public `/userinfo` endpoint — no crypto library, no secret,
no DI seam required.

- **Categories:** auth
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed — untested here)
- **Peer dependency:** `@auth0/auth0-spa-js` `^2.0.0` (optional; only for the
  client auth adapter / raw-SDK escape hatch via `getProviderClient()` — server
  session verification uses `fetch`, no SDK)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create an Auth0 application** (Single Page Application) in the
   [Auth0 Dashboard](https://manage.auth0.com) → **Applications** → your app →
   **Settings**:
   - **Domain** (`domain`, e.g. `your-tenant.us.auth0.com`) — public, client-safe.
   - **Client ID** (`clientId`) — public, client-safe (Auth0 SPA/PKCE clients have
     no client secret at all).
   - Add your app's URL to **Allowed Callback URLs**, **Allowed Logout URLs**, and
     **Allowed Web Origins**.
2. **Install the SDK** — only needed for the client auth adapter and the
   raw-client escape hatch (`getProviderClient()`); server session verification
   works without it:
   ```sh
   npm i @auth0/auth0-spa-js
   ```
3. **Configure Minder.** There is no secret value in this provider's config at
   all — everything below is safe to inline:
   ```ts
   // minder.config.ts
   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       auth0: {
         domain: 'your-tenant.us.auth0.com',
         clientId: 'your_client_id',
         audience: 'https://your-api-identifier', // optional
         redirectUri: 'https://your-app.example.com/callback', // optional
       },
     },
   };
   ```
4. **Mount the server route** — a session-verify route that calls Auth0's own
   public `/userinfo` endpoint:
   ```ts
   // app/api/minder/auth0/verify-session/route.ts (Next.js App Router)
   import { createAuth0SessionHandler } from 'minder-data-provider/providers/auth0';
   export const GET = createAuth0SessionHandler({ domain: 'your-tenant.us.auth0.com' });
   ```
5. **Register the provider** once at startup, then use the hook:
   ```ts
   import { registerAuth0Provider } from 'minder-data-provider/providers/auth0';

   const unregister = await registerAuth0Provider(); // reads providers.auth0
   // ...in a component:
   const { ready, session, signOut } = useAuth();
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero keys, zero tenant)

Develop the entire auth UI with no Auth0 tenant by flipping one flag:
```ts
providers: { auth0: { mock: true } }
```
The same `useAuth()` hook lights up against an in-memory mock: `getSession`
returns a deterministic signed-in session (`{ userId: 'auth0-mock-user', raw: {
sub: 'auth0-mock-user', exp: <24h out> } }`) with zero SDK, zero keys, and zero
network; `signOut` clears it. Flip `mock` back to `false` to go live — no code
changes.

### Teardown / uninstall

`registerAuth0Provider()` returns an `unregister()` that removes the auth
capability provider. To fully remove the provider, delete the
`providers.auth0` config block, delete the scaffolded route file, and
uninstall `@auth0/auth0-spa-js`.

## Security

**No secret value exists anywhere in this provider's config surface.** Unlike
Clerk, Supabase, or Stripe, there is no separate "secret key" this adapter ever
resolves: Auth0 SPA/PKCE clients have no client secret at all. `domain` is a
public tenant identifier — like Clerk's `publishableKey` — and is registered
client-safe, along with every other config value this provider reads.

**Fail-closed session validation (client).** `getSession()` calls
`client.isAuthenticated()`; if not authenticated it returns `null`. Otherwise it
calls `client.getIdTokenClaims()` and runs the result through the same
`toSession()` check enforced across every certified auth provider: a session is
accepted ONLY if `sub` is a non-empty string AND `exp` (numeric, UNIX seconds)
is strictly in the future. Anything else — missing claims, missing/empty `sub`,
missing/non-numeric/already-past `exp` — is rejected and treated as signed-out.

**Server-side session verification never trusts the client.** Protected server
routes should call `createAuth0SessionHandler`'s handler, never a
client-asserted user id. It reads the caller's `Authorization: Bearer <token>`
header (400 if missing/malformed) and forwards it, unmodified, to Auth0's own
public `GET https://{domain}/userinfo` endpoint (an OIDC standard endpoint) —
Auth0 itself performs the verification upstream. A 200 response means the token
is valid (`{ userId: sub, valid: true }`); any non-200 response (401/403/etc.)
maps to `{ userId: null, valid: false }` — the upstream response body is never
thrown through raw. A network failure maps to a masked 502
(`AUTH0_UPSTREAM_ERROR`), the same pattern as Clerk's `CLERK_UPSTREAM_ERROR`. A
non-GET request is rejected with 405.

**Known trade-off (documented, not fixed here).** Calling `/userinfo` on every
server-side verify is Auth0's own recommended pattern for low/medium-traffic
resource servers; Auth0's docs recommend local JWKS-based JWT verification
instead for high-traffic resource servers (rate limits apply to `/userinfo`).
This provider deliberately accepts the `/userinfo` round-trip for v1 in favor of
the simplest zero-dependency, edge-safe, P2-compliant design — the same
trade-off class Clerk's own upstream-verify-call design already accepts in this
repo. Revisit only if Auth0 deprecates `/userinfo` for this purpose or ships a
first-party edge-safe verifier.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | -------------- |
| `domain` | Dashboard → Applications → your app → Settings → Domain | Yes (public tenant identifier) | inline in config |
| `clientId` | Dashboard → Applications → your app → Settings → Client ID | Yes (SPA/PKCE clients have no secret) | inline in config |
| `audience` | Dashboard → APIs → your API → Identifier (optional) | Yes | inline in config |
| `redirectUri` | Your app's callback URL, registered in Dashboard → Allowed Callback URLs (optional) | Yes | inline in config |

Get your application settings at <https://manage.auth0.com> → **Applications** →
your application.

**Rotation.** Auth0 SPA applications have no client secret to rotate. If you
suspect `clientId`/`domain` exposure is a problem, rotating the application
itself (or restricting Allowed Callback/Logout/Web Origins) in the Auth0
dashboard is the relevant control — not a secret rotation, since none exists
here.

**Teardown.** Remove the `providers.auth0` config block and the scaffolded
route file. There is no key to revoke on this adapter's side; delete the Auth0
application in the dashboard to fully revoke its use.
