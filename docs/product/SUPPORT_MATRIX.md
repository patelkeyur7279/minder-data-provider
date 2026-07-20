# Support Matrix

> **2026-07-19 fix-branch update (`fix/mdpd-workspace-findings`, local only):** the MDPD demo
> workspace (`../minder-data-provider-demo`) produced runnable example apps + locally-run test
> suites for several rows below and drove a fix wave (see CHANGELOG Unreleased: sideEffects
> packaging, retries, cache, plugins, config typing). Owner-authorized promotions on this branch:
> **Next.js → Confirmed (local)** (runnable two-router example, 54 tests, runtime-verified) ·
> **Electron → Confirmed (local)** (real headed GUI run incl. a useMinder page in the production
> renderer) · **Vite → Confirmed (local)** (103 unit + 19 Playwright E2E against the production
> build). "(local)" = the original Confirmed bar (runnable example + tests) is met but CI legs do
> not exist yet because this branch is unpushed. **Update 2026-07-21:** Vite + React is now fully
> **Confirmed** — CI job `vite-example` repeats the tarball-install/build/test/smoke evidence on
> every push/PR (closes C-02); see the row below. New OPEN finding: no react-server-safe entry —
> under Turbopack all imports must sit behind "use client" (MDPD-13). RN/Expo promotion pending
> an iOS Simulator run in progress in the MDPD workspace.

> **Rule:** "Confirmed" requires a runnable example app + tests exercising it in CI. Nothing is
> promoted without that evidence. (Evidence rule: audits of 2026-07-18; test suite = 86 suites /
> 1592 tests, jsdom + React 19.)

## React frameworks / runtimes

| Environment | Status | Evidence / gap |
|---|---|---|
| React 19 (client, web) | **Confirmed** | Full jest suite runs on react/react-dom 19 in jsdom; `./web` entry built |
| React 18 | **Confirmed** (test-suite evidence) | Full jest suite (2367 tests incl. hook/provider rendering via @testing-library/react) passes under react@18.3.1 — verified locally 2026-07-21 and wired as CI job `react-18-compat` (closes task C-01). No runnable 18-specific example app; the suite exercises the same public surface. |
| Next.js (Pages Router) | **Experimental** | `./nextjs` entry + SSR helpers + generated proxy exist; **no runnable example app** (examples are markdown-only), proxy template only unit-tested |
| Next.js (App Router / RSC) | **Confirmed** (provider-wrapper pattern) | Evidence (2026-07-21): runnable example `examples/nextjs-app-router` — `"use client"` providers wrapper + `useMinder` client component rendered by a Server Component page; `next build` (incl. static prerender) + runtime smoke (page + API route) verified locally and wired as CI job `app-router-example`. Prior R-03 audit (2026-07-19): `minder()` is server-safe (no hooks); 12 client modules carry `"use client"` guarded by tests/use-client-directive.test.ts. **Known gap unchanged:** tsup `splitting` does not preserve the directive as a valid top-of-chunk prologue in dist, so importing a client export *directly* into a Server Component can error — use the wrapper pattern (as in the example). See [NEXTJS_APP_ROUTER.md](../NEXTJS_APP_ROUTER.md). Build-level fix tracked as R-03-BUILD |
| Vite + React | **Confirmed** | `examples/web/e-commerce` (Vite + React 19): local verification (2026-07-19) — npm install + `tsc --noEmit` + `vite build` + vitest all pass against the local package — plus CI job `vite-example` (2026-07-21): packs the library tarball, installs it into the example exactly like a real consumer, runs `tsc && vite build`, runs the vitest unit suite, and runtime-smokes the built `vite preview` server (root mount + page title). Closes task C-02 |
| Remix / React Router | **Planned** | No adapter, no evidence |
| React Native / Expo | **Experimental** | `./native`/`./expo` entries built + dist-interop guarded (CJS/ESM `HttpMethod` export verified — Wave H fixed an `undefined`-enum bug here); storage adapters (Native, Expo) now unit-tested ~60% (was ~5%). `examples/react-native/offline-todo` + `examples/expo/quickstart` refreshed 2026-07-19 to current entries/API/deps (RN 0.76 / React 18.3; fixed `/native`+`/expo` imports, `useMinder(route)` signature, `loading`). **Not yet Confirmed:** source-corrected against the verified API but NOT device/simulator-run (toolchain unavailable) — charter RK-5 keeps this Experimental |
| Electron | **Experimental** | `./electron` entry built + dist-guarded; ElectronStorageAdapter unit-tested ~62% (was ~4%). `examples/electron/desktop-app` refreshed 2026-07-19 (main process → React-free `/node` entry, electron ^33, `node --check` clean). **Not yet Confirmed:** no GUI runtime run |
| Node (server) | **Experimental** | `./server`/`./node` entries built + dist-guarded (`HttpMethod` export fixed in Wave H); fail-closed auth documented as presence/exp-only. `examples/nodejs/api` refreshed 2026-07-19 and verified locally: installs React-FREE (only the `/node` entry, 0 react imports), `tsc --noEmit` + build pass, and a live `minder('/users/1')` smoke-run returned data. **Not yet Confirmed:** no server-runtime example in CI. Known gap EXA-GAP-1: the React-free configureMinder is the deprecated baseURL one |
| Astro + React islands | **Planned** | No evidence |
| Edge runtimes (Workers/Vercel Edge/Deno/Bun) | **Confirmed (Cloudflare Workers/workerd)** | Evidence (2026-07-21): runnable example `examples/edge-worker` on real workerd via `wrangler dev` local mode (no Cloudflare login, no `nodejs_compat` flag) in CI job `edge-worker-example`: `minder()` JSON data path (native-fetch transport) + webhook HMAC verify (accept+reject) verified. **Not edge-safe:** default axios transport (use `transport: 'fetch'`), file uploads, file-based credentials (use env vars), dev proxy. See [EDGE.md](../EDGE.md). Vercel Edge, Deno, and Bun remain **Inferred-works** (same R-04 static-bundling spike as before) — no runnable example on those runtimes yet |

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
| Plugin hooks `onUpload`/`onSync`/`onConnectivityChange` | **Implemented & reachable** | Unified OfflineManager (2026-07-20) auto-queue fires onSync for automatically-queued failed requests (tests/mdpd-unified-offline-manager.test.ts); onUpload fires from both useMinder/useMediaUpload path and MediaUploadManager, terminal phase 'success'. Unit+integration tested on branch; no cross-browser/device soak |
| Plugin hooks `onCacheHit`/`onCacheMiss` | **Implemented** | Emitted from `minder()`'s opt-in `{ cache: true }` response cache (miss on first/expired, hit on fresh). Unit tested on branch |
| WebSocket | **Experimental** | 3 overlapping layers (core manager / client / adapters) intentionally NOT consolidated (high-risk). Canonical public path documented (`/websocket` `WebSocketClient` + `useWebSocket` + `useMinder().websocket`); both public layers now unit tested (connect/subscribe/reconnect-backoff/cleanup). Unit tested on branch; no cross-browser/device soak |
| Upload | **Experimental** | Works; MDPD-4 re-render storm fixed — `useMediaUpload` progress commits throttled (50-event upload: ~50→~5 renders). Unit tested on branch; no cross-browser/device soak |
| Offline | **Implemented (unified)** | CONSOLIDATED 2026-07-20: `core/OfflineManager` deleted; ONE platform `OfflineManager` shared by `configureMinder`/`getOfflineManager` AND ApiClient's auto-queue (replay via the client's axios instance; `onSync`/`onConnectivityChange` fire for real auto-queued failures — tests/mdpd-unified-offline-manager.test.ts). Queue is in-memory unless `config.storage` supplied. Unit+integration tested on branch; no cross-browser/device soak |

## Provider integrations

| Provider | Status |
|---|---|
| **Supabase** (auth, database, storage) — frameworks: react, nextjs, vite | **Certified** — mock-mode example in CI; live-service E2E requires real credentials (not in CI). 10/10 certification (`node scripts/certify-provider.js providers/supabase`); catalog entry: docs/providers/CATALOG.md. |
| **Stripe** (payments — hosted checkout, webhooks) — frameworks: react, nextjs, vite | **Certified** — mock-mode example + guarded keyless server route in CI; live checkout + webhooks require real credentials (not in CI). 10/10 certification (`node scripts/certify-provider.js providers/stripe`); catalog entry: docs/providers/CATALOG.md. |
| **Clerk** (auth — session, sign-out, server-side session verification) — frameworks: react, nextjs, vite | **Certified** — mock-mode example in CI; live session verification requires real credentials (not in CI). 10/10 certification (`node scripts/certify-provider.js providers/clerk`); catalog entry: docs/providers/CATALOG.md. |
| **Firebase** (auth, database, storage — service-account admin ops) — frameworks: react, nextjs, vite | **Certified** — mock-mode example + guarded keyless service-account health route in CI; live admin ops require a real service-account file (not in CI). Note: Firebase's `apiKey` is a public identifier, not a secret. 10/10 certification (`node scripts/certify-provider.js providers/firebase`); catalog entry: docs/providers/CATALOG.md. |
| **Razorpay** (payments — orders, webhooks) — frameworks: react, nextjs, vite | **Certified** — mock example in CI; live orders+webhooks need real keys, not in CI. 10/10 certification (`node scripts/certify-provider.js providers/razorpay`); catalog entry: docs/providers/CATALOG.md. |
| **Sentry** (observability — error tracking) — frameworks: react, nextjs, vite | **Certified** — mock example in CI; plugin-based observability, DSN public; live error reporting needs a real DSN. 10/10 certification (`node scripts/certify-provider.js providers/sentry`); catalog entry: docs/providers/CATALOG.md. |
| **Auth.js** (auth — session, sign-out, server-side session verification) — frameworks: nextjs | **Certified** — zero-SDK: client reads Auth.js's own REST session contract via `fetch`; server wraps an app-supplied `sessionResolver` DI seam (no `next-auth`/`@auth/core` import in this repo). Mock-mode example in CI; live session verification requires a real Auth.js app (not in CI). `next-auth` v5 is still in beta upstream (peer `^5.0.0-beta.0`). 10/10 certification (`node scripts/certify-provider.js providers/authjs`); catalog entry: docs/providers/CATALOG.md. |
| **All other third-party providers** (Auth0, Appwrite, S3, Cloudinary, email/SMS/push, AI, CMS, search, flags) | **Proposed** — zero provider code exists today [Confirmed by audit]. Build order per ROADMAP.md: Supabase done (auth+db+storage in one SDK, now Certified) → Stripe done (server-boundary showcase, now Certified) → Clerk done (dedicated-auth showcase, now Certified) → Firebase done (credential-file showcase, now Certified) → Razorpay done (payments, second server-boundary showcase, now Certified) → Sentry done (plugin-bus showcase, now Certified) → Auth.js done (zero-SDK/DI showcase, now Certified). All 7 providers are now Certified; expand further only after passing the certification checklist (RISKS_AND_THREAT_MODEL.md §Provider certification). |

## Package managers / tooling

| Item | Status |
|---|---|
| npm | **Confirmed** (CI uses `npm ci`) |
| yarn / pnpm / bun | **Unknown** — dual lockfiles currently committed (hygiene defect); no CI legs |
| TypeScript consumers | **Confirmed** (d.ts + d.mts emitted; `moduleResolution: bundler/node16`) |
| Legacy `moduleResolution: node` | **Known-degraded** — no `typesVersions` fallback (packaging audit) |
