# Running on edge runtimes (Cloudflare Workers, Vercel Edge, Deno, Bun)

> **Status (R-04 spike, 2026-07-19): Inferred-works for the core data path.** The pure
> `minder()` data path with `transport: 'fetch'`, JWT auth, and webhook verification is
> edge-compatible **by design** — the library's own code guards its Node-only fallbacks
> behind runtime checks. It is not yet **Confirmed** (no runnable Worker example runs in CI
> yet — see the follow-up task). Treat this as "should work, verify for your case."

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
| `minder()` / `useMinder()` JSON CRUD | ✅ with `transport: 'fetch'` | Uses native `fetch`; no axios, no Node HTTP |
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

## Follow-up (to reach "Confirmed")

A runnable Cloudflare Worker (or Vercel Edge) example that calls `minder(..., { transport: 'fetch' })`
and verifies a webhook, exercised in CI, would upgrade this from **Inferred-works** to
**Confirmed**. That needs the edge toolchain (wrangler) in CI — tracked in the backlog alongside
the other runtime-example gaps (H-05).
