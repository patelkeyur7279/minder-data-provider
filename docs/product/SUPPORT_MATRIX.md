# Support Matrix

> **Rule:** "Confirmed" requires a runnable example app + tests exercising it in CI. Nothing is
> promoted without that evidence. (Evidence rule: audits of 2026-07-18; test suite = 86 suites /
> 1592 tests, jsdom + React 19.)

## React frameworks / runtimes

| Environment | Status | Evidence / gap |
|---|---|---|
| React 19 (client, web) | **Confirmed** | Full jest suite runs on react/react-dom 19 in jsdom; `./web` entry built |
| React 18 | **Unknown** | peer range allows it; no CI leg runs 18 — needs compat test (task C-01) |
| Next.js (Pages Router) | **Experimental** | `./nextjs` entry + SSR helpers + generated proxy exist; **no runnable example app** (examples are markdown-only), proxy template only unit-tested |
| Next.js (App Router / RSC) | **Partial** (works via wrapper) | R-03 audit (2026-07-19): `minder()` is server-safe (no hooks); hooks + `MinderDataProvider` carry `"use client"` in source (12 client modules now guarded by tests/use-client-directive.test.ts — 7 were missing it). **Known gap:** tsup `splitting` does not preserve the directive as a valid top-of-chunk prologue in dist, so importing a client export directly into a Server Component can error — the standard `"use client"` provider-wrapper pattern avoids it and works today. See [NEXTJS_APP_ROUTER.md](../NEXTJS_APP_ROUTER.md). Build-level fix + App Router example in CI tracked as R-03-BUILD |
| Vite + React | **Inferred-works** | `examples/web/e-commerce` (Vite + React 19) refreshed 2026-07-19 and locally verified end-to-end: npm install + `tsc --noEmit` + `vite build` + vitest all pass against the local package. Still no Vite CI leg (task C-02) — hence not Confirmed |
| Remix / React Router | **Planned** | No adapter, no evidence |
| React Native / Expo | **Experimental** | `./native`/`./expo` entries built + dist-interop guarded (CJS/ESM `HttpMethod` export verified — Wave H fixed an `undefined`-enum bug here); storage adapters (Native, Expo) now unit-tested ~60% (was ~5%). `examples/react-native/offline-todo` + `examples/expo/quickstart` refreshed 2026-07-19 to current entries/API/deps (RN 0.76 / React 18.3; fixed `/native`+`/expo` imports, `useMinder(route)` signature, `loading`). **Not yet Confirmed:** source-corrected against the verified API but NOT device/simulator-run (toolchain unavailable) — charter RK-5 keeps this Experimental |
| Electron | **Experimental** | `./electron` entry built + dist-guarded; ElectronStorageAdapter unit-tested ~62% (was ~4%). `examples/electron/desktop-app` refreshed 2026-07-19 (main process → React-free `/node` entry, electron ^33, `node --check` clean). **Not yet Confirmed:** no GUI runtime run |
| Node (server) | **Experimental** | `./server`/`./node` entries built + dist-guarded (`HttpMethod` export fixed in Wave H); fail-closed auth documented as presence/exp-only. `examples/nodejs/api` refreshed 2026-07-19 and verified locally: installs React-FREE (only the `/node` entry, 0 react imports), `tsc --noEmit` + build pass, and a live `minder('/users/1')` smoke-run returned data. **Not yet Confirmed:** no server-runtime example in CI. Known gap EXA-GAP-1: the React-free configureMinder is the deprecated baseURL one |
| Astro + React islands | **Planned** | No evidence |
| Edge runtimes (Workers/Vercel Edge/Deno/Bun) | **Inferred-works** (core path) | R-04 spike (2026-07-19): the `minder()` data path with `transport: 'fetch'`, JWT auth (atob-first), and webhook verification (`crypto.subtle`) is edge-safe **by design** — flagged `Buffer`/`require()`/`process.*` are runtime-guarded fallbacks, never at module-eval, verified by bundling every entry with `esbuild --platform=neutral`. `server/handlers.ts`+`webhooks.ts` pass the edge-safety regression guard. **Not edge-safe:** default axios transport (use `transport: 'fetch'`), file uploads, file-based credentials (use env vars), dev proxy. See [EDGE.md](../EDGE.md). **Not yet Confirmed:** no runnable Worker example in CI (needs wrangler toolchain, like H-05) |

> **Node runtime baseline: Node 20+** (`engines.node >= 20`, CI matrix = 20, 22). Node 18 was
> dropped — it is EOL (2025-04) and, concretely, lacks a **global WebCrypto** (`crypto.subtle`),
> which the edge-safe webhook HMAC verification (`src/server/webhooks.ts`) requires. WebCrypto is
> global on Node 20+ and on every edge/browser/Deno/Bun runtime, so 20 is the honest floor. Node
> 18 users can still consume most of the package but must polyfill `globalThis.crypto` to verify
> webhooks.

## Capabilities (today's built-ins)

| Capability | Status | Evidence |
|---|---|---|
| REST via axios (`ApiClient`) | **Confirmed** | Core test coverage; hardened CORS/auth 2.2.0-beta.1 |
| Standalone `minder()` fetch transport | **Confirmed** | Tests; opt-in `transport: 'fetch'` |
| TanStack Query caching | **Confirmed** | query-core based CacheManager, tested |
| Auth (JWT presence/expiry, refresh) | **Confirmed** | Fail-closed since 2.2.0-beta.1; parity-tested |
| Plugin bus (request/response/error/token hooks) | **Confirmed** | Emitters live in ApiClient + minder(); tested |
| Plugin hooks `onUpload`/`onSync`/`onConnectivityChange` | **Not implemented** | Declared in interface, no emitters (audit) |
| WebSocket | **Experimental** | 3 overlapping layers (core manager / client / adapters); tests exist for manager only |
| Upload | **Experimental** | Works; re-render storm defect (perf audit A4) |
| Offline | **Experimental** | Two competing implementations; 1s polling hooks |

## Provider integrations

| Provider | Status |
|---|---|
| **Supabase** (auth, database, storage) — frameworks: react, nextjs, vite | **Certified** — mock-mode example in CI; live-service E2E requires real credentials (not in CI). 10/10 certification (`node scripts/certify-provider.js providers/supabase`); catalog entry: docs/providers/CATALOG.md. |
| **Stripe** (payments — hosted checkout, webhooks) — frameworks: react, nextjs, vite | **Certified** — mock-mode example + guarded keyless server route in CI; live checkout + webhooks require real credentials (not in CI). 10/10 certification (`node scripts/certify-provider.js providers/stripe`); catalog entry: docs/providers/CATALOG.md. |
| **Clerk** (auth — session, sign-out, server-side session verification) — frameworks: react, nextjs, vite | **Certified** — mock-mode example in CI; live session verification requires real credentials (not in CI). 10/10 certification (`node scripts/certify-provider.js providers/clerk`); catalog entry: docs/providers/CATALOG.md. |
| **Firebase** (auth, database, storage — service-account admin ops) — frameworks: react, nextjs, vite | **Certified** — mock-mode example + guarded keyless service-account health route in CI; live admin ops require a real service-account file (not in CI). Note: Firebase's `apiKey` is a public identifier, not a secret. 10/10 certification (`node scripts/certify-provider.js providers/firebase`); catalog entry: docs/providers/CATALOG.md. |
| **Razorpay** (payments — orders, webhooks) — frameworks: react, nextjs, vite | **Certified** — mock example in CI; live orders+webhooks need real keys, not in CI. 10/10 certification (`node scripts/certify-provider.js providers/razorpay`); catalog entry: docs/providers/CATALOG.md. |
| **Sentry** (observability — error tracking) — frameworks: react, nextjs, vite | **Certified** — mock example in CI; plugin-based observability, DSN public; live error reporting needs a real DSN. 10/10 certification (`node scripts/certify-provider.js providers/sentry`); catalog entry: docs/providers/CATALOG.md. |
| **All other third-party providers** (Auth0, Appwrite, S3, Cloudinary, email/SMS/push, AI, CMS, search, flags) | **Proposed** — zero provider code exists today [Confirmed by audit]. Build order per ROADMAP.md: Supabase done (auth+db+storage in one SDK, now Certified) → Stripe done (server-boundary showcase, now Certified) → Clerk done (dedicated-auth showcase, now Certified) → Firebase done (credential-file showcase, now Certified) → Razorpay done (payments, second server-boundary showcase, now Certified) → Sentry done (plugin-bus showcase, now Certified). All 6 initial-roadmap providers are now Certified; expand further only after passing the certification checklist (RISKS_AND_THREAT_MODEL.md §Provider certification). |

## Package managers / tooling

| Item | Status |
|---|---|
| npm | **Confirmed** (CI uses `npm ci`) |
| yarn / pnpm / bun | **Unknown** — dual lockfiles currently committed (hygiene defect); no CI legs |
| TypeScript consumers | **Confirmed** (d.ts + d.mts emitted; `moduleResolution: bundler/node16`) |
| Legacy `moduleResolution: node` | **Known-degraded** — no `typesVersions` fallback (packaging audit) |
