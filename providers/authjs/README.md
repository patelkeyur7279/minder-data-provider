# @minder/provider-authjs

The Auth.js (formerly NextAuth.js, v5) adapter for [Minder](../../README.md). One
stable hook — `useAuth()` — over Auth.js, so you switch auth providers by config,
not by rewriting integration code. Unlike the other certified providers, this
adapter is **zero-SDK on both sides**: the client talks to Auth.js's own REST
session contract (`fetch`, no library), and the server wraps YOUR app's own
`auth()` function through a dependency-injection seam — this package never imports
`next-auth` / `@auth/core` at all.

- **Categories:** auth
- **Runtimes:** web, node, edge
- **Frameworks:** nextjs (Auth.js's REST contract is shared by other `@auth/*`
  framework adapters — SvelteKit, Express, Qwik, … — but only Next.js is exercised
  by this repo's tests and example, so only `nextjs` is claimed)
- **Peer dependency:** `next-auth` `^5.0.0-beta.0` (optional; needed by YOUR app to
  build `auth.ts` — this adapter itself never imports it, on either the client or
  the server path). **Auth.js v5 is still in beta** as of this writing (`next-auth`'s
  `latest` npm tag is v4; install the `@beta` tag for v5 — see Setup step 1).

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Build your own Auth.js app** following the [Auth.js docs](https://authjs.dev) —
   install `next-auth` (v5), create `auth.ts` exporting `auth`, `signIn`,
   `signOut`, and the route handlers, and mount them at your chosen `basePath`
   (default `/api/auth`):
   ```sh
   npm i next-auth@beta
   ```
2. **Nothing to install for this adapter.** The client path calls Auth.js's own
   `{basePath}/session`, `{basePath}/csrf`, `{basePath}/signout` REST endpoints
   directly over `fetch` — no SDK, no keys, no config beyond `basePath`.
3. **Configure Minder.** `basePath` is the only value this provider reads — it is a
   route path, never a secret:
   ```ts
   // minder.config.ts
   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       authjs: {
         basePath: '/api/auth', // Auth.js's default; omit to use it
       },
     },
   };
   ```
4. **Mount the server route** — a session-verify route that bridges YOUR app's own
   `auth()` into this handler via the `sessionResolver` DI seam (this library
   cannot import your `auth.ts`; it is app-specific config):
   ```ts
   // app/api/minder/authjs/verify-session/route.ts (Next.js App Router)
   import { auth } from '@/auth'; // your own auth.ts
   import { createAuthjsSessionHandler } from 'minder-data-provider/providers/authjs';

   export const GET = createAuthjsSessionHandler({ sessionResolver: () => auth() });
   ```
5. **Register the provider** once at startup, then use the hook:
   ```ts
   import { registerAuthjsProvider } from 'minder-data-provider/providers/authjs';

   const unregister = await registerAuthjsProvider(); // reads providers.authjs
   // ...in a component:
   const { ready, session, signOut } = useAuth();
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero network, zero Auth.js route)

Develop the entire auth UI with no Auth.js route mounted by flipping one flag:
```ts
providers: { authjs: { mock: true } }
```
The same `useAuth()` hook lights up against an in-memory mock: `getSession`
returns a deterministic signed-in session (`{ userId: 'authjs-mock-user', raw: {
user: { id: 'authjs-mock-user', email: 'mock-user@example.com' }, expires: <24h
out> } }`) with zero network and zero `next-auth` install; `signOut` clears it.
Flip `mock` back to `false` to go live — no code changes.

### Teardown / uninstall

`registerAuthjsProvider()` returns an `unregister()` that removes the auth
capability provider. To fully remove the provider, delete the `providers.authjs`
config block and the scaffolded route file.

## Security

**No secret ever passes through Minder config.** Unlike Clerk, Supabase, or
Stripe, Auth.js has no separate "secret key" that a data-layer adapter resolves —
its signing secret (`AUTH_SECRET`) is consumed entirely inside your own `auth.ts`
and environment, outside this provider's config surface entirely. `basePath` (a
same-origin route path) is the only config value this provider reads, and it is
registered client-safe.

**Fail-closed session validation (client AND server).** Both `getSession()` and
`createAuthjsSessionHandler` run every raw session payload through the same
`toSession()` check before trusting it: a session is accepted ONLY if `user.id` is
a non-empty string AND `expires` parses to a date **strictly in the future**.
Anything else — an empty `{}` (signed out), a missing `user`, a missing/empty
`id`, a missing or unparseable `expires`, or an already-expired `expires` — is
rejected and treated as signed-out. This mirrors the "presence + expiry only, fail
closed on anything malformed" rule enforced across every certified auth provider.

**Server-side session verification never trusts the client.** Protected server
routes should call `createAuthjsSessionHandler`'s handler (or the same
`sessionResolver` + `toSession` shape directly), never a client-asserted user id.
The handler returns only `{ userId, valid }` — the raw session (which may carry
app-specific claims) is never echoed back.

**Masked resolver errors.** If your `sessionResolver` throws (e.g. a
misconfigured `auth.ts`), the handler returns a 502 `AUTHJS_RESOLVER_ERROR` and
logs only the thrown error's own `message` — never any session contents.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `basePath` | Your own Auth.js route mount path | Yes (a route path, not a secret) | inline in config, default `/api/auth` |

This provider has **no credential to obtain from a dashboard** — there is no
Auth.js cloud service. All secrets (`AUTH_SECRET`, OAuth provider client
secrets, database URLs, …) belong to your own `auth.ts` and its environment
variables, entirely outside this adapter's config surface.

**Rotation.** Rotating `AUTH_SECRET` (or any upstream OAuth provider secret) is
entirely your app's concern — see the [Auth.js docs](https://authjs.dev). This
adapter holds no credential to rotate.

**Teardown.** Remove the `providers.authjs` config block and the scaffolded
route file. There is no key to revoke on this adapter's side.
