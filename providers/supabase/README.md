# @minder/provider-supabase

The Supabase adapter for [Minder](../../README.md). Wires Supabase Auth, Storage,
and Realtime into Minder's stable capability hooks — `useAuth()`, `useStorage()`,
`useLive()` — so you switch providers by config, not by rewriting integration code.

- **Categories:** auth, database, storage
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed — untested)
- **Peer dependency:** `@supabase/supabase-js` `^2.0.0` (optional; loaded lazily)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Supabase project** at <https://supabase.com/dashboard>.
2. **Get your keys** from the project API settings:
   <https://supabase.com/dashboard/project/_/settings/api>
   - **Project URL** (`url`) — public.
   - **`anon` public key** (`anonKey`) — public by design (see Security).
   - **`service_role` secret key** (`serviceRoleKey`) — secret; server only.
3. **Install the SDK** (optional peer — only needed for the real, non-mock path):
   ```sh
   npm i @supabase/supabase-js
   ```
4. **Configure Minder.** Put the public values inline; reference the secret by
   env-var name with `secret()` (never paste the raw service-role key here):
   ```ts
   // minder.config.ts
   import { secret } from 'minder-data-provider';

   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       supabase: {
         url: 'https://your-project-ref.supabase.co',
         anonKey: 'your-public-anon-key',
         serviceRoleKey: secret('SUPABASE_SERVICE_ROLE_KEY'),
       },
     },
   };
   ```
5. **Register the provider** once at startup, then use the hooks:
   ```ts
   import { registerSupabaseProvider } from 'minder-data-provider/providers/supabase';

   const unregister = await registerSupabaseProvider(); // reads providers.supabase
   // ...later, on teardown:
   unregister();
   ```
   See [`example.ts`](./example.ts) for a full walkthrough including `useAuth()`.

### Mock mode (zero keys, zero account)

Develop the entire UI with no Supabase project by flipping one flag:
```ts
providers: { supabase: { mock: true } }
```
The same `useAuth()` / `useStorage()` / `useLive()` hooks light up against
in-memory mocks (`mock://…` URLs, a `mock-user-1` session, and an in-process
Realtime emitter). Flip `mock` back to `false` to go live — no code changes.

### Teardown / uninstall

`registerSupabaseProvider()` returns an `unregister()` that removes all three
capability providers (auth, storage, live). Call it on app shutdown / HMR
dispose. To fully remove the provider, delete the `providers.supabase` config
block and uninstall `@supabase/supabase-js`.

## Security

**`anonKey` is public by design.** Supabase intends the `anon` key to ship in the
browser; access is gated by **Row-Level Security (RLS)** policies on your tables
and buckets, not by hiding the key. Enable and review RLS on every table and
Storage bucket you expose — the anon key grants exactly what your RLS policies
grant, and nothing more.

**`serviceRoleKey` must never reach the client.** The service-role key bypasses
RLS. It is declared `serverOnly` in this provider's manifest and typed as a
`CredentialInput`, so a raw service-role string placed in client-reachable config
is rejected by Minder's config validation (it would name the exact key and refuse
to run). This adapter never reads `serviceRoleKey`: the browser only ever gets the
anon client. Use the service-role key exclusively in server code, resolved via
`secret('SUPABASE_SERVICE_ROLE_KEY')` from `minder-data-provider/server`.

No error thrown by this adapter echoes any configured value; secrets never appear
in logs, errors, or diagnostics (masked only).

### Error / retry behavior

The adapter surfaces Supabase SDK errors unchanged (upload/remove reject on the
SDK's `error`, `getSession` resolves `null` when there is no session). Retry,
timeout, and rate-limit policy are owned by the underlying `@supabase/supabase-js`
client — configure them there, or reach the raw client via `getProviderClient()`.

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `url` | Dashboard → Settings → API → Project URL | Yes (public) | inline in config |
| `anonKey` | Dashboard → Settings → API → Project API keys → `anon` `public` | Yes (public, RLS-gated) | inline in config |
| `serviceRoleKey` | Dashboard → Settings → API → Project API keys → `service_role` `secret` | **No — server only** | `secret('SUPABASE_SERVICE_ROLE_KEY')`, resolved server-side |

Get all three at
<https://supabase.com/dashboard/project/_/settings/api>.

**Rotation.** Rotate keys from the same API settings page. After rotating the
`anon` key, update `anonKey` in config and redeploy. After rotating the
`service_role` key, update the `SUPABASE_SERVICE_ROLE_KEY` server environment
variable — no client redeploy is required since the secret is resolved
server-side. Rotating either key invalidates the previous value immediately.

**Teardown.** Remove the `providers.supabase` config block and unset the
`SUPABASE_SERVICE_ROLE_KEY` env var to fully revoke this app's use of the keys.
