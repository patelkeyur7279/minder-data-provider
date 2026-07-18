# Custom provider authoring guide

Minder's promise is that you can integrate **any SDK — known or unknown to us — with a
few configurations**. This document is what makes that promise concrete: a mid-level dev
integrating, say, your company's internal SDK, or any third-party service Minder doesn't
ship an adapter for, has everything they need here. A companion, runnable reference lives at
[`examples/custom-provider/acme-provider.ts`](../../examples/custom-provider/acme-provider.ts)
— it's the walkthrough below, made real, and imports ONLY from the two published entry
points ('minder-data-provider' / 'minder-data-provider/server'). Its tests live at
[`tests/custom-provider-example.test.ts`](../../tests/custom-provider-example.test.ts)
(co-located with this package's own test suite, so they run as part of `npx jest`).

## 1. Three tiers, one API

Every provider in the Minder ecosystem — however it's distributed — is built from the exact
same public functions: `registerCapabilityProvider`, `registerMockProvider`,
`getProviderConfig`, `secret()`, and (for SDKs with secret-requiring server calls)
`MinderHandler`. What differs between tiers is **distribution and verification**, not the
mechanism:

| Tier | Built by | Verified by | Lives in | Listed in [`CATALOG.md`](./CATALOG.md)? |
| --- | --- | --- | --- | --- |
| **Certified** | The Minder team | Team review + the 10-point checklist ([`CERTIFICATION.md`](./CERTIFICATION.md)) | `providers/*` in this repo, published as `minder-data-provider/providers/*` | Yes — Certified table |
| **Community** | Anyone | Self-certified: `npm run certify:provider` passes all 10 checks | The author's own published npm package | Yes — Community table |
| **Custom** | Anyone | Nothing — it's yours, it never leaves your app | Directly in your app's codebase | No — and that's fine |

**Custom = in-app, same machinery.** There is no cut-down or "hacky" registration path for
a provider you don't intend to publish. `providers/clerk` (the smallest certified provider,
and this guide's reference shape — see [`providers/clerk/src/index.ts`](../../providers/clerk/src/index.ts))
calls the identical functions your custom provider will call below. The only things
certification adds are a `manifest.json`, a few required README sections, and a listing in
the catalog — see [section 4](#4-optional-going-further-community-certification) if you
later want that for a provider you wrote in-house.

## 2. Decide the shape: capability contract vs. plugin vs. both

Minder has two different extension points, and picking the right one is the first design
decision for any integration:

- **Capability contract** (`src/contracts/types.ts`) — a fixed interface for one of four
  app-facing concerns: `auth`, `payments`, `storage`, `live`. Register one via
  `registerCapabilityProvider` and the matching hook (`useAuth`, `useCheckout`, `useStorage`,
  `useLive`) lights up **unmodified** — the whole point is that app code never changes when
  you swap Clerk for Auth0, or Stripe for your billing SDK.
- **Plugin** (`src/plugins/PluginSystem.ts`'s `MinderPlugin`) — lifecycle hooks
  (`onRequest`/`onResponse`/`onError`/`onRequestIntercept`/`provideToken`/...) that observe or
  mutate the request pipeline itself. There's no fixed app-facing hook here — you're
  extending Minder's own request handling, not standing behind one of the four `useX()` hooks.

| Your SDK does... | Use | Why |
| --- | --- | --- |
| Login, session lookup, sign-out | Capability contract: `auth` | Matches `AuthContract` (`getSession`, `signOut`) — `useAuth()` works with zero app changes |
| Checkout / hosted payment links | Capability contract: `payments` | Matches `PaymentsContract` (`createCheckout`) — `useCheckout()` works unmodified |
| File / blob upload & storage | Capability contract: `storage` | Matches `StorageContract` (`upload`, `remove`) — `useStorage()` works unmodified |
| Realtime channels / pub-sub | Capability contract: `live` | Matches `LiveContract` (`subscribe`) — `useLive()` works unmodified |
| Request tracing, crash reporting, metrics, logging | **Plugin** | No `useX()` hook expects this shape — `onRequest`/`onResponse`/`onError` observers are the right fit (this is exactly what `MinderCapability` in `PluginSystem.ts` calls `'crash-reporting'` / `'analytics'`) |
| Supplies a bearer token to attach to every Minder request, but isn't your app's session source | Plugin: `provideToken` | You're augmenting the request pipeline, not replacing `useAuth()` |
| Both — e.g. an SDK with session management **and** crash reporting | **Both.** Register a capability provider for the contract-shaped feature, a plugin for the rest | Nothing says one SDK = one integration point; `ProviderCapability` (`src/plugins/manifest.ts`) is deliberately a superset of the plugin taxonomy for exactly this reason |

If your SDK doesn't cleanly fit any capability contract row, default to a plugin — it's the
lower-commitment integration point (observe/augment, not replace a hook's contract).

## 3. Walkthrough: a minimal custom provider

We'll integrate **"Acme Analytics"** — a fictional SDK (no real vendor; standard
placeholder-company naming) that streams realtime analytics events, which maps cleanly onto
the `live` capability contract, and also needs one secret-requiring server call (forwarding
an event to Acme's ingest API). That combination exercises every piece a real integration
needs. The full, runnable, tested version is
[`examples/custom-provider/acme-provider.ts`](../../examples/custom-provider/acme-provider.ts)
— what follows is that same code, condensed, using the published package's import paths.

**Step 1 — config + client shape.** One public field, one secret field, one dev-mode flag, a
test DI seam real integrations omit — and the subset of the SDK client this adapter uses:

```ts
import type { SecretRef } from 'minder-data-provider';

export interface AcmeProviderConfig {
  projectId?: string;     // public — safe inline in client config
  apiSecret?: SecretRef;  // secret('ACME_API_SECRET') — server only, NEVER a raw string
  mock?: boolean;         // zero-SDK, zero-keys dev mode
  createAcmeClient?: (projectId: string) => AcmeLikeClient; // test DI seam; real integrations omit this
}

/** Subset of the (fictional) @acme/analytics-sdk client this adapter uses. */
export interface AcmeLikeClient {
  on(channel: string, cb: (event: unknown) => void): void;
  off(channel: string, cb: (event: unknown) => void): void;
}
```

**Step 2 — the building blocks**: the `getProviderClient()` escape hatch every tier uses for
SDK-specific calls the contract doesn't cover, plus the adapter that turns the raw SDK into a
`LiveContract`:

```ts
import { registerClientSafeProviderKeys } from 'minder-data-provider';
import type { LiveContract } from 'minder-data-provider';

// Same call every certified provider makes (see providers/*/src/index.ts):
// exempts these public keys from the raw-secret-shaped-key check below.
registerClientSafeProviderKeys('acme', ['projectId', 'mock']);

let activeClient: AcmeLikeClient | null = null;

/** Raw SDK escape hatch — null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient;
}

const toLiveContract = (client: AcmeLikeClient): LiveContract => ({
  subscribe(channel, cb) {
    client.on(channel, cb);
    return () => client.off(channel, cb);
  },
});

/** Real adapters lazily `import('@acme/analytics-sdk')` here, the same way providers/clerk
 *  imports @clerk/clerk-js; this stays an in-memory stub for the walkthrough. */
function defaultAcmeClient(): AcmeLikeClient {
  const listeners = new Map<string, (e: unknown) => void>();
  return { on: (ch, cb) => void listeners.set(ch, cb), off: (ch) => void listeners.delete(ch) };
}
```

`registerClientSafeProviderKeys` — along with the typed-credential helpers `CredentialInput`,
`isCredentialInput`, and `describeCredential` (plus, server-only, `resolveCredential` from
`minder-data-provider/server`) — is public API, importable from outside this monorepo the
same as everything else on this page; calling it is still optional (`secret()` alone is
always sufficient for correctness).

**Step 3 — `registerAcmeProvider`**, wiring the pieces above together. Mock mode is a branch
INSIDE this one function — **not** a separate export — checked before the SDK is touched at
all, so UI can be built with zero SDK and zero keys:

```ts
import { registerCapabilityProvider, getProviderConfig, registerMockProvider } from 'minder-data-provider';

/** Deterministic, synchronous mock — zero SDK, zero keys, zero network. */
function createMockLive(): LiveContract {
  return {
    subscribe(channel, cb) {
      cb({ channel, mock: true });
      return () => {};
    },
  };
}

export function registerAcmeProvider(config?: AcmeProviderConfig): () => void {
  const effective = config ?? (getProviderConfig('acme')?.raw as AcmeProviderConfig) ?? {};

  if (effective.mock === true) {
    activeClient = null;
    return registerMockProvider<LiveContract>('live', createMockLive(), 'acme-analytics');
  }
  if (!effective.projectId) {
    throw new Error('registerAcmeProvider: "projectId" is required (or set providers.acme.mock = true).');
  }

  const client = effective.createAcmeClient?.(effective.projectId) ?? defaultAcmeClient();
  activeClient = client;

  const unregister = registerCapabilityProvider({
    providerName: 'acme-analytics',
    capability: 'live',
    implementation: toLiveContract(client),
    getProviderClient: () => client,
  });
  return () => { unregister(); if (activeClient === client) activeClient = null; };
}
```

Wire it up via `providers.acme.mock: true` in config (read automatically through
`getProviderConfig`), or call `registerAcmeProvider({ mock: true })` directly.

**Step 4 — the server handler**, for the one call that needs the secret:

```ts
import { resolveSecret, jsonResponse } from 'minder-data-provider/server';
import type { MinderHandler } from 'minder-data-provider/server';

export function createAcmeIngestHandler(opts: { apiSecret: SecretRef }): MinderHandler {
  return async (req) => {
    if (req.method !== 'POST') {
      return jsonResponse({ error: { code: 'ACME_METHOD_NOT_ALLOWED' } }, { status: 405 });
    }
    let key: string;
    try {
      key = resolveSecret(opts.apiSecret); // throws server-side only; never client-reachable
    } catch (err) {
      // Masked failure: log only err.message — never the secret, never the raw upstream exception.
      console.error('[acme] ingest secret unresolved:', err instanceof Error ? err.message : String(err));
      return jsonResponse({ error: { code: 'ACME_SECRET_UNRESOLVED' } }, { status: 500 });
    }
    await fetch('https://ingest.acme.example/v1/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: await req.text(),
    });
    return jsonResponse({ ok: true }, { status: 202 });
  };
}
```

That's the whole integration across the four steps above — small enough to read in one
sitting, and every symbol in it (down to `defaultAcmeClient`, `toLiveContract`,
`createMockLive`) is exactly what
[`examples/custom-provider/acme-provider.ts`](../../examples/custom-provider/acme-provider.ts)
defines, condensed into a step-by-step walkthrough. Mount `createAcmeIngestHandler` on a
server route, call `registerAcmeProvider` once at startup (`{ mock: true }` for the zero-SDK
path), and `useLive('events', cb)` works exactly like it would for a certified provider.

## 4. Optional: going further — community certification

A custom provider that turns out useful beyond your own app can graduate to **Community**
without asking us for anything:

1. Add a `manifest.json` at your package root, shaped like `ProviderManifest`
   (`src/plugins/manifest.ts`) — use `defineProviderManifest` (exported from
   `minder-data-provider`) for autocomplete while writing it:

   ```ts
   import { defineProviderManifest } from 'minder-data-provider';

   export default defineProviderManifest({
     name: '@your-scope/provider-acme',
     version: '1.0.0',
     displayName: 'Acme Analytics',
     categories: ['analytics'],
     capabilities: ['live-subscribe'],
     config: { clientSafe: ['projectId', 'mock'], serverOnly: ['apiSecret'] },
     scopes: [{ scope: 'events:ingest', why: 'Forward client events to Acme via the server handler.' }],
     runtimes: ['web', 'node', 'edge'],
     frameworks: ['react', 'nextjs'],
     peerDependencies: { '@acme/analytics-sdk': '^1.0.0' },
     docs: { setup: './README.md', example: './example.ts', security: './README.md' },
     license: 'MIT',
   });
   ```

2. Add a `README.md` with `## Setup`, `## Security`, and `## Credentials` sections (mirror
   [`providers/clerk/README.md`](../../providers/clerk/README.md)), a `mock.ts`/`mock.js`
   file, an example file, and a `LICENSE`.
3. Run the certifier against your package directory — it's zero-dependency and ships inside
   the published package specifically so you can run it standalone:

   ```sh
   npm run certify:provider -- path/to/your-provider
   # or, once published: npx minder-data-provider/scripts/certify-provider.js path/to/your-provider
   ```

   All 10 checks must pass. See [`CERTIFICATION.md`](./CERTIFICATION.md) for the full
   checklist and what each check verifies.
4. Publish your package and open a PR adding its `manifest.json` path so
   `npm run generate:catalog` picks it up in the Community table.

Until then — most custom providers should simply stay custom. Publishing is for sharing with
other teams/projects, not a requirement for a correct integration.

## 5. Security rules (restated)

These apply identically at every tier — custom providers get no exemption.

**Never a raw secret client-side.** Two independent, composing checks guarantee this in a
browser-like environment (`typeof window !== 'undefined'`) — a raw secret has to slip past
*both* to reach the bundle. `configureMinder` runs the more specific one first: any
`providers.<name>.<key>` value whose *key name* looks credential-shaped and isn't a
`secret()`/`CredentialInput` is a validation error (this is what
`tests/custom-provider-example.test.ts` exercises directly via `validateMinderConfig`
— see that test for the exact shape). `assertNoExposedSecrets`
(`src/security/secrets.ts`, exported from `minder-data-provider`, and called by `configureMinder`
as its last line of defense) is the broader backstop — it scans the *whole* config recursively
for secret-shaped raw values regardless of key name, and it's public API you can call directly
on any config-shaped object. Its exact thrown message (reproduced verbatim, so you recognize
it when you see it):

```
Refusing to run: secret value(s) detected in CLIENT configuration. These would be shipped in your
JavaScript bundle and exposed to every visitor:
  • providers.acme.apiSecret — raw string under secret-like key "apiSecret"

Fix: never place secret keys in client config. Use secret('ENV_VAR_NAME') (the value stays on the
server) and call the integration through a server route, or move it server-side via
'minder-data-provider/server'. Use env('NEXT_PUBLIC_...') only for values that are safe to be public.
```

The fix is always the same: wrap it — `secret('ACME_API_SECRET')`, never `'sk_live_...'` typed
directly into config. `apiSecret?: SecretRef` (not `string`) in your config interface makes
this a compile error to get wrong, not just a runtime one.

**Never log credentials.** No thrown error, console line, or response body may ever include a
resolved secret's *value* — only its name (`secret('X').toString()` renders `'[SECRET:X]'`,
never the value). Precisely: `secret(name)` captures its value from the environment *eagerly*,
at the moment it's called (server-side) — not lazily, on first use — but `SecretRef` stays
non-stringifiable for as long as you hold it, so that early capture is never a leak risk by
itself; the containment is what protects you, not the timing. `createAcmeIngestHandler` above
follows the same pattern `createClerkSessionHandler` does: the raw string is extracted from
the `SecretRef` (via `resolveSecret()`) only inside the request handler, right where it's
used, and is never assigned to a variable that outlives the request, and every error path
returns a generic code (`ACME_SECRET_UNRESOLVED`) — never the underlying value or even the raw
upstream exception.

**Prove it with a sentinel test.** Don't just avoid logging the secret — write a test that
would fail if you ever did. The pattern (template:
[`providers/clerk/provider.test.ts`](../../providers/clerk/provider.test.ts), search for
`SECURITY sentinel`): construct a `secret()` with a known, distinctive fake value; spy on
every `console.*` channel; drive the failure path of your handler; then assert the sentinel
string appears in **none** of — the response body, the captured console output, or
`JSON.stringify` of anything holding the `SecretRef`. `tests/custom-provider-example.test.ts`
runs the same shape of check against `createAcmeIngestHandler` — and, because it lives under
`tests/` rather than `examples/`, it runs automatically as part of this repo's own `npx jest`,
with no separate manual invocation required. A secret leak is a regression a type system can't
catch for you; only a test that actually looks at the output can.

## See also

- [`CATALOG.md`](./CATALOG.md) — the generated list of Certified and Community providers.
- [`CERTIFICATION.md`](./CERTIFICATION.md) — the 10-point certification checklist in full.
- [`providers/clerk/`](../../providers/clerk/) — the smallest certified provider; this guide's reference shape.
- [`examples/custom-provider/`](../../examples/custom-provider/) — this guide's walkthrough, runnable and tested;
  its tests live at [`tests/custom-provider-example.test.ts`](../../tests/custom-provider-example.test.ts).
