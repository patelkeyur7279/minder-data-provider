# @minder/provider-sentry

The Sentry adapter for [Minder](../../README.md) — **a plugin, not a
capability contract.** Sentry is error tracking, so this package registers a
`MinderPlugin` on the existing plugin bus (`onError` / `onRequest` /
`onResponse` — see [`src/plugins/PluginSystem.ts`](../../src/plugins/PluginSystem.ts))
instead of implementing a `PaymentsContract`/`AuthContract`/etc. `src/contracts`
is never touched. Once registered, every error `useMinder()`/`ApiClient` would
already have surfaced ALSO flows to Sentry — no call-site changes anywhere.

- **Categories:** analytics (observability)
- **Shape:** plugin-based — registers on `pluginManager`, not a capability provider
- **Runtimes:** web, node, edge (works anywhere the plugin bus runs)
- **Frameworks:** react, nextjs, vite
- **Peer dependency:** `@sentry/browser` `^8.0.0` (optional; only needed for the
  real-SDK path — `mock: true` and `createSentryFactory` need no SDK at all)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Sentry project** and get its DSN from your project settings:
   <https://sentry.io/settings/>
   - **DSN** (`dsn`) — public; see Security below. No secret key is needed for
     the client SDK.
2. **Install the SDK** — only needed for the real-SDK path (`mock: true` and
   `createSentryFactory` work without it):
   ```sh
   npm i @sentry/browser
   ```
3. **Configure Minder.** The DSN goes inline — it is safe to commit and to ship
   in a client bundle:
   ```ts
   // minder.config.ts
   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       sentry: {
         dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
       },
     },
   };
   ```
4. **Register the provider** once at startup — there is no hook to call
   afterwards, the plugin observes the bus automatically:
   ```ts
   import { registerSentryProvider } from 'minder-data-provider/providers/sentry';

   const unregister = registerSentryProvider(); // reads providers.sentry
   ```
   See [`example.ts`](./example.ts) for a full walkthrough.

### Mock mode (zero DSN, zero account)

Develop and test the error-reporting path with no Sentry project by flipping
one flag:
```ts
providers: { sentry: { mock: true } }
```
`onError` then forwards to an in-memory sink instead of the SDK — see
`getSentryMockEvents()` / `__resetSentryMockEvents()` in [`mock.ts`](./mock.ts).
Flip `mock` back to `false` to go live — no code changes.

### Custom transport (`createSentryFactory`)

For tests, or to point at a different error-reporting backend that speaks the
same `{ captureException, captureMessage? }` shape, pass `createSentryFactory`:
```ts
registerSentryProvider({
  createSentryFactory: () => myCustomClient,
});
```
This takes precedence over `dsn` and needs no SDK either.

### SDK-missing behavior

If `@sentry/browser` is not installed and neither `mock` nor
`createSentryFactory` is set, the plugin does **not** throw and does **not**
break the request pipeline it observes: it logs one `console.warn` with an
install hint and silently skips forwarding. An observability plugin failing to
install must never be able to take down the app it's observing.

### Teardown / uninstall

`registerSentryProvider()` returns an `unregister()` that removes the plugin
from `pluginManager`. To fully remove the provider, delete the
`providers.sentry` config block and uninstall `@sentry/browser`.

## Security

**`dsn` is PUBLIC BY DESIGN** — like Firebase's `apiKey` or Stripe's
`publishableKey`. A Sentry DSN only identifies which project to send error
events to; it grants no read access to existing data in that project and
Sentry's own SDKs are built to read it straight out of client-side config. It
is registered `clientSafe` in this provider's manifest, and there is **no
`serverOnly` credential for this provider** — server-side Sentry usage reads
the same DSN (this differs from, e.g., Stripe, where the client-safe
publishable key and the server-only secret key are two different values).

**No over-forwarding.** The plugin bus's error event (`PluginError`) can carry
the failing request's method/url/headers/body — internal MDP transport detail
that may include an `Authorization` header or request payload. This adapter
deliberately narrows what reaches Sentry to `message` / `code` / `stack`
only; the request detail is never read by `onError` and never forwarded.
Breadcrumbs (`onRequest`/`onResponse`) are similarly narrowed to
method/url/status/duration — never headers or bodies.

**No card data, no PII by construction.** This adapter does not collect or
transmit anything beyond what the plugin bus already observes about a
request's outcome (error message/code/stack, or request/response metadata for
breadcrumbs).

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `dsn` | Project Settings → Client Keys (DSN) → <https://sentry.io/settings/> | **Yes (public)** | inline in config |

There is no server-only credential for this provider — server-side Sentry SDKs
use the same DSN.

**Rotation.** If a DSN needs to be revoked (e.g. it leaked in a context you
didn't intend, or you're rotating projects), regenerate the client key from
the Sentry project's Client Keys settings page and update the `dsn` value in
your config. Because the DSN is public by design, rotation is about hygiene
(stopping an old/unused project from receiving events), not about limiting
who could read data — Sentry's server-side auth tokens (not used by this
adapter) are the actual access-control boundary.

**Project setup.** Create a project per app/environment in Sentry so events
are attributed correctly; use separate DSNs (and, if desired, separate
`providers.sentry` config per `environments.*` entry) for development,
staging, and production.
