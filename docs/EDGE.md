# Running on edge runtimes (Cloudflare Workers, Vercel Edge, Deno, Bun)

> **Status (2026-07-21): Confirmed for Cloudflare Workers/workerd.** The pure `minder()`
> data path with `transport: 'fetch'`, JWT auth, and webhook verification now has runnable
> evidence: [`examples/edge-worker`](../examples/edge-worker) runs on real workerd via
> `wrangler dev` local mode — no `nodejs_compat` flag, no Node polyfills — and is exercised
> in CI job `edge-worker-example`. Vercel Edge, Deno, and Bun remain **Inferred-works**
> (the original R-04 spike, 2026-07-19): the library's own code guards its Node-only
> fallbacks behind runtime checks, verified by bundling every entry with
> `esbuild --platform=neutral`, but no runnable example exists yet on those runtimes.
> Treat those three as "should work, verify for your case."
>
> **Fixed 2026-08-26 (tracked as P2):** everything above and below on this page documents the
> **standalone, provider-less** `minder()` path, which always honored `transport: 'fetch'`. Until
> this date, the documented Level-1 pattern — `configureMinder()` + `<MinderDataProvider>`, i.e.
> going through a provider's `ApiClient` — silently IGNORED `transport: 'fetch'` and stayed
> hard-wired to axios, so that pattern could not make a single request on bare workerd at all. If
> you were using a `<MinderDataProvider>` on an edge runtime before this fix, `transport: 'fetch'`
> did nothing for you. `transport` is now forwarded from `configureMinder`/`<MinderDataProvider
> config>` through to `ApiClient`, which dispatches via native `fetch()` instead of axios when it's
> set (explicitly, or auto-detected on an edge runtime) — verified with a real round trip through a
> provider and a dead-port failure path. Note: the specific literal symptom originally reported for
> this defect (workerd rejecting a `RequestInit.cache` field axios's fetch adapter sets) could not
> be reproduced with the axios version currently installed, whose fetch adapter doesn't set
> `cache` — the underlying "provider path ignores `transport: 'fetch'`" defect was real and is what
> got fixed; the `cache`-field guard is additionally covered by a simulated (not real-workerd) test.

Edge runtimes have Web APIs (`fetch`, `atob`/`btoa`, `crypto.subtle`, `TextEncoder`) but
**no Node built-ins** (`Buffer`, `require`, `fs`, `process.stdout`, the Node `http` stack).

## TL;DR

```ts
import { minder } from 'minder-data-provider';

// On edge, minder now AUTO-selects the native-fetch transport — no flag needed
// for normal JSON requests. (It detects an edge runtime: global fetch, not Node,
// not a classic browser.) Node and browser keep the axios default unchanged.
const { data } = await minder('users');

// You can still force it either way:
//   { transport: 'fetch' }  — always native fetch
//   { transport: 'auto' }   — fetch on edge, axios on Node/browser (the default)
//   { transport: 'axios' }  — always axios
```

## What works on edge

| Feature | Edge-safe? | Notes |
|---|---|---|
| `minder()` / `useMinder()` JSON CRUD, standalone or under `<MinderDataProvider>` | ✅ with `transport: 'fetch'` | Uses native `fetch`; no axios, no Node HTTP. Under a provider this requires the P2 fix (2026-08-26, above) — set it on `configureMinder({ transport: 'fetch' })` / `<MinderDataProvider config={{ transport: 'fetch' }}>`, not just on individual `minder()` calls |
| JWT auth (presence/expiry, refresh) | ✅ | `parseJWT` decodes via `atob` first; `Buffer` only as a Node fallback |
| Webhook HMAC verification (`minder-data-provider/server`) | ✅ | Uses `crypto.subtle` (global WebCrypto) + `TextEncoder` only; already covered by the edge-safety regression guard |
| Server route handlers (`createMinderHandler`) | ✅ | `src/server/handlers.ts` bundles clean for `platform=neutral` |
| Env-var credentials (`env('API_KEY')`) | ✅ | Reads `process.env` (a guarded read edge runtimes expose) |
| Stripe / Razorpay checkout + webhooks | ✅ | Base64 via `btoa` first; `crypto.subtle` HMAC |

## What does NOT work on edge (with the alternative)

| Not edge-safe | Why | Alternative |
|---|---|---|
| Default (axios) transport | axios selects a Node HTTP adapter | Pass `transport: 'fetch'` |
| File uploads / `onProgress` requests | These fall back to axios even with `transport: 'fetch'` (`isComplexRequest`) | Do uploads from a Node server, not an edge function |
| File-based credentials (`credential({ file })`) | needs `fs` (`require('node:fs')`) | Use env-var credentials (`env(...)`) on edge |
| Dev proxy (`ProxyManager`, `express`) | Node-only server tooling | Not needed on edge; configure routes directly |
| `FeatureLoader` synchronous load path | uses `require()` (guarded by try/catch) | Use the default async (`import()`) feature loading |

## Why the core path is edge-safe (spike findings)

Bundling every public entry with `esbuild --platform=neutral` surfaces static `Buffer`,
`require()`, and `process.*` patterns — but almost all are **runtime-guarded fallbacks**, not
edge breakage:

- **`process.stdout` / `process.versions` / `process.version`** — all behind
  `typeof process !== 'undefined'` (in `Logger`, `PlatformDetector`). No-ops on edge.
- **`Buffer`** in `jwt.ts` and the Razorpay provider — reached only when `atob`/`btoa` are
  absent. Edge has both, so the Web path is taken.
- **`require()`** in `FeatureLoader` (sync path), `ProxyManager` (express), and the native/expo
  storage adapters — all inside `try/catch` or platform guards, and lazily (never at
  module-evaluation time), so importing the package on edge does not throw.
- **`credentials.ts`** (`require('node:fs')` + `Buffer`) is **server/Node-only by design** and
  is dynamically imported, so it stays out of an edge bundle unless you resolve a file credential.

## Follow-up (Cloudflare Workers done — other runtimes still open)

Cloudflare Workers reached **Confirmed**: [`examples/edge-worker`](../examples/edge-worker) calls
`minder(..., { transport: 'fetch' })` and verifies a webhook via `createWebhookHandler`, exercised
on real workerd in CI job `edge-worker-example`.

Vercel Edge, Deno, and Bun remain **Inferred-works** — a runnable example on any of those runtimes,
exercised in CI, would upgrade that runtime specifically. Tracked in the backlog alongside the
other runtime-example gaps (H-05).
