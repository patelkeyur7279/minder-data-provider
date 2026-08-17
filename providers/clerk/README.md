# @minder/provider-clerk

The Clerk adapter for [Minder](../../README.md) — **dedicated auth, "login working
in 5 minutes."** On the client you use one stable hook — `useAuth()` — over Clerk,
so you switch auth providers by config, not by rewriting integration code. On the
server, a Clerk session token is verified with your secret key, which never travels
near the browser.

- **Categories:** auth
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed — Clerk's
  React Native SDK differs from web and is untested here)
- **Peer dependency:** `@clerk/clerk-js` `^5.0.0` (optional; only for the client
  auth adapter / raw-SDK escape hatch via `getProviderClient()` — server session
  verification uses `fetch`, no SDK)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Clerk application** and get your API keys from the dashboard:
   <https://dashboard.clerk.com> → your app → **API keys**.
   - **Publishable key** (`publishableKey`, `pk_...`) — public (see Security). It
     is intended to ship in the browser and is client-safe.
   - **Secret key** (`secretKey`, `sk_...`) — secret; server only.
2. **Install the SDK** — only needed for the client auth adapter and the raw-client
   escape hatch (`getProviderClient()`); server session verification works without
   it:
   ```sh
   npm i @clerk/clerk-js
   ```
3. **Configure Minder.** Put the publishable key inline; reference the secret by
   env-var name with `secret()` (never paste a raw `sk_...` here):
   ```ts
   // minder.config.ts
   import { secret } from 'minder-data-provider';

   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       clerk: {
         publishableKey: 'pk_test_your_publishable_key',
         secretKey: secret('CLERK_SECRET_KEY'),
       },
     },
   };
   ```
4. **Mount the server route** (or run `minder add clerk` to scaffold it) — a
   session-verify route:
   ```ts
   // app/api/minder/clerk/verify-session/route.ts (Next.js App Router)
   import { createClerkSessionHandler } from 'minder-data-provider/providers/clerk';
   import { secret } from 'minder-data-provider';
   export const POST = createClerkSessionHandler({ secretKey: secret('CLERK_SECRET_KEY') });
   ```
5. **Register the provider** once at startup, then use the hook:
   ```ts
   import { registerClerkProvider } from 'minder-data-provider/providers/clerk';

   const unregister = await registerClerkProvider(); // reads providers.clerk
   // ...in a component:
   const { ready, session, signOut } = useAuth();
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero keys, zero account)

Develop the entire auth UI with no Clerk account by flipping one flag:
```ts
providers: { clerk: { mock: true } }
```
The same `useAuth()` hook lights up against an in-memory mock: `getSession` returns
a deterministic signed-in session (`{ userId: 'clerk-mock-user', raw: {} }`) with
zero SDK, zero keys, and zero network; `signOut` clears it. Flip `mock` back to
`false` to go live — no code changes.

### Teardown / uninstall

`registerClerkProvider()` returns an `unregister()` that removes the auth
capability provider. To fully remove the provider, delete the `providers.clerk`
config block, delete the scaffolded route file, and uninstall `@clerk/clerk-js`.

## Security

**`publishableKey` is public by design.** Clerk intends the publishable key
(`pk_...`) to ship in the browser; it identifies your Clerk frontend instance and
cannot perform privileged Backend API operations. It is registered client-safe in
this provider.

**`secretKey` must never reach the client.** The secret key (`sk_...`) authorizes
Clerk's Backend API — it can read and modify users, sessions, and organizations. It
is declared `serverOnly` in this provider's manifest and typed as `CredentialInput`,
so a raw `sk_...` string placed in client-reachable config is rejected by Minder's
config validation (it names the exact key and refuses to run). It is resolved
**per-request, server-side only** (`resolveCredential`), inside
`createClerkSessionHandler` — the browser only ever sees the publishable key.

**Server-side session verification.** Session tokens are verified on the server:
`createClerkSessionHandler` POSTs the token to Clerk's session-verify API with
`Authorization: Bearer <secretKey>` and returns only `{ userId, valid }`. Never
trust a client-asserted identity for protected operations — verify the token
server-side.

**Masked upstream errors.** When Clerk's API rejects a verification request, the
handler returns a 502 that passes Clerk's own error message through but NEVER
includes your secret key — the key appears in no response body and no log. No error
thrown by this adapter echoes any configured secret value.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `publishableKey` | Dashboard → API keys → Publishable key | Yes (public) | inline in config |
| `secretKey` | Dashboard → API keys → Secret key | **No — server only** | `secret('CLERK_SECRET_KEY')`, resolved server-side |

Get your keys at <https://dashboard.clerk.com> → your application → **API keys**.

**Test vs. live instances.** Clerk gives each application separate **development**
and **production** instances, each with its own keys (development publishable keys
are prefixed `pk_test_...` and secret keys `sk_test_...`; production uses
`pk_live_...` / `sk_live_...`). Develop against the development instance (or
`mock: true`); swap in production instance keys — via the same env-var names — only
in production. Never commit either.

**Rotation.** Roll the secret key from the API keys page in the Clerk dashboard.
After rotating, update the `CLERK_SECRET_KEY` server environment variable — no
client redeploy is required, since the secret is resolved server-side. Clerk lets
you keep the previous secret key valid for a short overlap window while you roll.

**Teardown.** Remove the `providers.clerk` config block, delete the scaffolded
route file, and unset the `CLERK_SECRET_KEY` env var to fully revoke this app's use
of the secret key. Rotating (or deleting) the instance in the Clerk dashboard
invalidates the keys entirely.
