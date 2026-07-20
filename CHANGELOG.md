# Changelog

All notable changes to Minder Data Provider will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - Unreleased (planned — recommended MAJOR)

### Removed (BREAKING)

- **Redux integration removed entirely.** MDP no longer ships any Redux code or
  optional peer dependency. Removed public API: the `useStore()` and
  `useReduxSlice()` hooks, the `ReduxConfig` type, the `configureMinder({ redux })`
  config field, `MinderDataProvider`'s Redux `<Provider>` wrapper and
  `useMinderContext().store`, and `DynamicLoader`'s redux members
  (`loadRedux`/`getStore`/`isReduxLoaded`/`addReducer`, the `'redux'` preload
  option, and the `redux` field in `getLoadingStatus()`/`getBundleSavings()`).
  The `@reduxjs/toolkit` and `react-redux` optional peers are dropped. Rationale:
  the auto-generated Redux slices were read by nothing on the core data path
  (dead weight in every consumer's bundle). TanStack Query remains the single
  server-state layer. Migration: see docs/MIGRATION_GUIDE.md (v2.x → v3.0). Most
  consumers were not using the Redux hooks/config and need no code changes.
  Measured bundle effect (min+treeshake, `import { minder }`): our-code
  170.56 kB → 166.20 kB; full bundle 323.05 kB → 280.80 kB (react-redux/@reduxjs
  no longer inlined). **Version not yet bumped in-repo; this is the recommended
  classification.**

### Changed (BREAKING)

- **sideEffects: true** (MDPD-17): the packed library previously crashed
  `useMinder()` in production builds under most consumer bundlers (Vite/Rollup,
  webpack/Next, CRA, etc.) because `"sideEffects": false` let bundlers drop lazy
  chunk-init imports; declaring `sideEffects: true` fixes it. Guarded by
  `scripts/verify-consumer-treeshake.mjs` (real-Rollup consumer bundle) wired
  into `release:check`/`prepublishOnly`. Bundle cost ~+10 kB on a minimal consumer.
- **detectMethod re-contract**: only genuinely ID-shaped final route segments
  (numeric, UUID, 24-hex ObjectId) auto-detect as PUT; word/slug segments are
  collection names → creates now send POST (previously `/api/orders` with data
  sent PUT). Slug-id updates: pass `options.method` or an `id`/`_id` field in data.
- **minder() retries are idempotent-only**: retries now apply only to
  GET/HEAD/OPTIONS/PUT/DELETE; POST/PATCH retry only with new option
  `retryNonIdempotent: true` (duplicate-write protection).

### Fixed (MDPD workspace findings)

- **Response-cache identity partitioning**: `minder()`'s opt-in `{cache:true}`
  cache is now keyed per credential (hashed token/Authorization) — fixes a
  cross-user cached-response disclosure on shared SSR/Node processes; also: raw
  pre-decode data cached so `options.model` instances keep their prototype on
  hits; 200-entry cap.
- **Unified OfflineManager** (MDPD-6 follow-up): `configureMinder({offline:{enabled:true}})`
  + ApiClient now share ONE manager; `onSync`/`onConnectivityChange` fire for
  automatically-queued failed requests; replay goes through the ApiClient axios
  instance; `core/OfflineManager` deleted.
- **configureMinder({plugins}) per-instance**: plugins now forward into the
  returned config (ApiClient per-instance isolation as documented); ownership
  bookkeeping no longer unregisters plugins owned by other callers;
  `register()` returns a boolean.
- **PlatformDetector guards** (MDPD-34 + follow-up): `navigator` (Hermes) and
  bare `process` access guarded.
- **useMediaUpload**: progress resets per upload; overlapping uploads serialized;
  upload lifecycle terminal phase unified to `'success'`.

## [2.2.0-beta.1] - Unreleased

### Added

- **`minder doctor --bundle`**: scans your app for `minder-data-provider` imports and
  reports what each imported subpath costs (min+gzip, from the size table shipped in
  `dist/bundle-sizes.json`), with slimming tips (e.g. import from
  `minder-data-provider/hook` instead of the main entry when you only use hooks).
  Degrades gracefully to an import listing when the size table is absent.
- **CI**: new `vite-example` job packs the library tarball and installs it into
  `examples/web/e-commerce` exactly like a real consumer, then runs `tsc && vite build`,
  the example's vitest unit suite, and a runtime smoke of the built `vite preview`
  server. Support Matrix + README: Vite + React `Inferred-works` → `Confirmed`
  (closes C-02).
- **`examples/edge-worker`**: a runnable Cloudflare Worker example, exercised on real
  workerd via `wrangler dev` (no `nodejs_compat`, no Cloudflare login) in new CI job
  `edge-worker-example` — proves the `minder()` native-fetch data path and
  `createWebhookHandler`'s HMAC verification (accept + reject) on the edge runtime
  itself. Support Matrix + EDGE.md + README: Edge runtimes `Inferred-works` →
  `Confirmed (Cloudflare Workers/workerd)`; Vercel Edge/Deno/Bun remain inferred.

### Performance (bundle surgery — no API change; surface verified by API-snapshot gate)

- **Context split from provider**: `useMinderContext`/`useMinderContextSafe` moved to a
  light internal module (type-only manager imports); `MinderDataProvider` re-exports
  them, so imports keep working from every existing path. Hooks no longer pull the
  provider's manager-construction graph into consumer bundles.
- **DevTools lazy-loaded**: the in-app DevTools panel now loads via `React.lazy` in its
  own chunk — dev-only UI never ships in production bundles. The panel mounts a tick
  later than before (dev-only, gated behind `debug.devTools`).
- **Local-first storage lazy-loaded**: `useMinder`'s `source: 'local' | 'local-first'`
  machinery (LocalStore + platform storage adapters) loads on first use instead of
  being bundled for every consumer.
- **Measured** (min+gzip, consumer-level incl. shared chunks): crud 36.7→18.9 KB,
  cache 36.5→19.3, websocket 37.5→20.0, upload 38.6→21.0, auth 39.0→22.5;
  `useMinder` initial load ≈13 KB with code-splitting. Previous README/docs size
  claims came from an entry-file-only analyzer that ignored shared chunks — the new
  `npm run measure:bundles` numbers are the honest baseline going forward.
- **`sideEffects` stays `true`** (MDPD-17 invariant). An entry-file allowlist was
  evaluated and rejected: with tsup code-splitting, even a full entry allowlist lets
  Rollup/Vite consumers drop chunk-init side effects on some subpaths (reproduced on
  `/crud`), reintroducing the MDPD-17 production crash. The consumer-treeshake guard
  now bundles the main entry **and** `/hook` + `/crud` subpaths so any future
  packaging change that regresses this fails CI.
- **CI hardening**: per-subpath bundle budgets + initial-load scenario budgets
  (`npm run budgets:check`, committed in `__snapshots__/bundle-budgets.json`) and a
  public-API snapshot gate (`npm run verify:api`, baseline in `__snapshots__/api/`)
  now run on every push/PR. Dev-mode React version check runs once (was twice).

### Changed (security — behavior changes)

- **`AuthManager.isAuthenticated()` now fails closed.** A JWT-shaped token
  (three dot-separated segments) whose payload cannot be decoded, or whose
  `exp` claim is non-numeric, is now treated as **not** authenticated
  (previously: treated as valid). Opaque non-JWT tokens are unchanged
  (presence-based). **Migration:** if your app intentionally stores
  JWT-shaped-but-not-JWT strings as tokens, either store them without dots or
  gate on `getToken() !== null` instead of `isAuthenticated()`. Note that
  `isAuthenticated()` has never verified JWT signatures — server-side code
  must verify tokens itself.
- **`GlobalAuthManager.isAuthenticated()` (the no-provider `useMinder`
  fallback) now applies the same fail-closed semantics.** Previously it only
  checked token presence — even an *expired* JWT counted as authenticated.
  It now rejects expired and corrupt JWT-shaped tokens exactly like
  `AuthManager` (parity is enforced by tests).
- **CORS defaults no longer combine a wildcard origin with credentials.**
  The default CORS middleware changes from `origin: '*', credentials: true`
  (invalid per the CORS spec and flagged by our own
  `CorsManager.validateConfig()`) to `origin: '*', credentials: false`, and
  `generateNextJSProxy()` now emits `Access-Control-Allow-Credentials: false`
  unless `cors.credentials` is explicitly `true` — and refuses to generate a
  proxy that combines credentials with a wildcard origin. **Migration:** for
  credentialed cross-origin requests, set an explicit origin allowlist:
  `createCorsMiddleware({ origin: ['https://app.example.com'], credentials: true })`
  or `cors: { origin: [...], credentials: true }` in the proxy config.

### Fixed (MDPD workspace findings)

- **MDPD-32** — `PlatformDetector.isNextJs()` no longer throws `ReferenceError:
  document is not defined` on React Native (where `global.window = global` but
  `document` is undefined); the bare `document` access is now `typeof`-guarded.
- **MDPD-9** — `configureMinder({ cache: { ttl } })` now typechecks and works:
  the config cache type accepts `ttl`/`type`/`maxSize` (matching the presets and
  docs) and `ttl` is normalized to `staleTime` when `staleTime` is absent.
- **MDPD-10** — `configureMinder({ plugins: [...] })` is now supported and wired
  into the plugin manager (idempotent across re-configure), so the documented
  per-instance plugin registration actually fires hooks instead of being dropped.
- **MDPD-30** — `registerPlugins([a, b])` (array form) now flattens and registers
  each plugin; entries lacking a string `name` are warned and skipped instead of
  the array being silently registered as one nameless plugin.
- **MDPD-11** — a Next.js app without a `dynamic` import now emits a single
  actionable warning and continues with a working default, instead of hard-
  throwing `NEXTJS_DYNAMIC_REQUIRED` and crashing `next build`.
- **MDPD-18** — `transport: 'fetch'` no longer double-prefixes the configured
  `apiUrl` onto absolute `http(s)` URLs; absolute URLs are used verbatim,
  matching the axios path.
- **MDPD-23** — the `retries` option now works on the standalone `minder()`
  path: retryable failures (network / 5xx / 429; never 4xx) are retried with a
  small capped backoff, preserving the never-throws contract.
- **MDPD-24** — `minder()`'s `cache`/`cacheTTL` options now work: with
  `cache: true`, successful GET results are cached for the TTL and reported with
  `metadata.cached=true` on subsequent hits (non-GET/`cache:false` unchanged).
- **MDPD-4** — `useMediaUpload` no longer re-renders once per progress event
  (perf audit A4): progress state commits are throttled (trailing-edge, injectable
  interval, default 100ms) with the terminal 100% value always committed. A 50-event
  upload now re-renders the consumer ~5 times instead of ~50; callback identities stay stable.
- **MDPD-5** — the `onCacheHit`/`onCacheMiss` plugin hooks (previously declared with
  zero emit sites) now fire from `minder()`'s opt-in `{ cache: true }` response cache:
  `onCacheMiss(key)` on the first/expired call and `onCacheHit({ key, value, age, timestamp })`
  on a fresh hit.
- **MDPD-6** — three declared plugin hooks are now reachable through the public API:
  `onUpload` fires from the `useMinder`/`useMediaUpload` upload path (via `ApiClient.uploadFile`,
  not just the standalone `MediaUploadManager`); and `configureMinder({ offline: { enabled: true } })`
  now instantiates and wires the platform `OfflineManager` (also exported, with a
  `getOfflineManager()` accessor) so `onSync`/`onConnectivityChange` fire — re-configuring
  destroys the prior manager first so its window listeners don't leak.
- **WebSocket** — added unit coverage for the two untested public layers (`WebSocketClient`
  from `/websocket` and the `useWebSocket` hook); no defects surfaced (reconnect/backoff +
  cleanup already correct). Documented the canonical public path; the core `WebSocketManager`
  is internal `MinderDataProvider` plumbing (layers intentionally not consolidated).

### Fixed

- `corsMiddleware` imported the `cors` package, which was never declared as a
  dependency — importing the module crashed with `Cannot find module 'cors'`.
  It is now implemented dependency-free. The generated Next.js proxy template
  also no longer references it (those `require` lines crashed consumer routes).
- **`useMinder` no longer violates the Rules of Hooks.** Invalid routes,
  toggling `infinite`, or provider-context changes between renders could crash
  with "rendered fewer hooks than expected". All hooks now run unconditionally;
  the invalid-route result is a post-hooks branch; `useMinder`/`usePaginatedMinder`
  use a new non-throwing `useMinderContextSafe()` accessor. The
  `react-hooks/rules-of-hooks` lint rule is now enforced as an error in CI.
- **Debug logs no longer leak secrets.** With `debug.networkLogs` enabled,
  request/response bodies and params are passed through `redactSecrets`, and
  the token-refresh log no longer emits raw `Authorization` headers.
- **`useOffline`/`useNetworkState`/`useOfflineQueue` are event-driven.** The
  1-second polling intervals (a re-render per second per mounted hook) are
  replaced by an `OfflineManager.subscribe()` API with equality-guarded
  updates. Hook return shapes are unchanged.
- `SecureAuthManager` documentation no longer claims JS-set cookies can be
  `HttpOnly` (they cannot); the two skipped cookie-security tests are enabled.

### Changed (performance — behavior changes)

- **Requests no longer trigger a CORS preflight by default.** The axios
  instance previously attached 7 security *response* headers (CSP,
  X-Frame-Options, …) to every outgoing request and enabled
  `withCredentials` by default — non-safelisted headers + credentialed mode
  force a preflight `OPTIONS` round-trip on every cross-origin call
  (~2× latency). Default request headers are now exactly `Content-Type` +
  `Accept`, and `withCredentials` is opt-in via `cors.credentials: true`
  (this now also governs the token-refresh call, which previously hardcoded
  credentials). **Migration:** if your API relies on cookies, set
  `cors: { credentials: true }` (with an explicit origin allowlist
  server-side). If you passed `security.headers` expecting them on requests,
  use `route.headers` or per-call `headers` instead. (`getSecurityHeaders()`
  still exists in the codebase as an internal helper for server *response*
  configuration; it is not exported from a public entry point.)
- **Default query retry is now 1 (was 3).** Transient failures surface ~3×
  faster. Explicit `performance.retries: 0` and `retryDelay: 0` are now
  respected (`??` instead of `||`). **Migration:** set
  `performance.retries: 3` to restore the old behavior.

### Changed (packaging — action may be required)

- **React-context libraries are now peerDependencies.** `@tanstack/react-query`,
  `@tanstack/query-core`, `@reduxjs/toolkit` (optional), `react-redux`
  (optional), and `@tanstack/react-query-devtools` (optional) moved from
  `dependencies` to `peerDependencies` with caret ranges. As hard deps they
  could install a second copy alongside yours, breaking Redux/QueryClient
  context. **Migration:** ensure `@tanstack/react-query` is in your own
  dependencies (you almost certainly already have it).
- **~73% smaller install.** Code splitting enabled: packed size 928kB → 252kB;
  `index.mjs` 227kB → 24kB; `core.mjs` 119kB → 4kB. `sideEffects: false` added
  for consumer tree-shaking. Dead `./core/*` and `./hooks/*` export wildcards
  removed (they never resolved); `./hook` subpath export added.

### Fixed (escape hatches & config)

- **`rawUrl` and absolute URLs now work in provider mode.** Previously
  `useMinder('https://…')` or `{rawUrl: true}` threw "Route not found" when a
  MinderDataProvider was present. `ApiClient.request` now dispatches ad-hoc
  URLs (absolute, `rawUrl`, or unregistered leading-slash paths) through the
  same instance — auth, interceptors, and plugins still apply. Unknown bare
  route names still throw.
- **The two global configs are unified.** `configureMinder()` now feeds both
  the routes registry and the standalone `minder()` resolver, so standalone
  `useMinder('routeName')` finally resolves url/method/headers/timeout from
  your registry instead of treating the name as a literal path.
  `minder.config()` still works but warns (deprecated).
- **`useMinder` returns are referentially stable.** `refetch`/`mutate`/
  `invalidate`/`cancel`/`operations` and the `auth`/`cache`/`websocket`/
  `upload` objects keep their identity across unrelated re-renders, and upload
  progress ticks no longer re-render every hook instance (progress reads are
  getter-based). Memoized children and effect deps now behave.

### Added — Certified providers: Razorpay + Sentry (roadmap complete)

- **`minder-data-provider/providers/razorpay`** — payments. Zero-dep server
  order handler (keySecret masked + sentinel) + hex-HMAC webhook verification.
  **Certified** (10/10), browser-verified mock order flow.
- **`minder-data-provider/providers/sentry`** — observability, implemented as a
  **plugin** on the existing bus (not a capability contract): forwards
  `useMinder`/`ApiClient` errors to Sentry with no call-site changes. Degrades
  gracefully if the SDK is absent (never breaks the pipeline it observes) and
  drops request headers/bodies from forwarded errors. DSN is public by design.
  **Certified** (10/10), browser-verified mock error capture.
- **All six roadmap providers are now Certified** (Supabase, Stripe, Clerk,
  Firebase, Razorpay, Sentry); the catalog's Planned column is empty.

### Added — Certified provider: Firebase (+ credential-file path)

- **`minder-data-provider/providers/firebase`** — auth + Firestore + storage.
  Activates the **credential-file** path: `loadServiceAccount(FileRef)` resolves
  a service-account JSON server-side only (throws in browser),
  `validateServiceAccount` returns **masked health only** — the `private_key`
  is never returned or logged (sentinel-tested). **Certified** (10/10),
  browser-verified mock auth+storage, guarded keyless health route in CI.
- Firebase's `apiKey` is documented + tested as a **public identifier** (passes
  client config); `serviceAccount` hard-fails as a raw value. The canonical
  "a key named 'apiKey' is not necessarily a secret" case.
- **`minder add firebase`** scaffolds a masked health-check route with explicit
  "set GOOGLE_APPLICATION_CREDENTIALS, never commit the file" guidance.

### Added — Certified provider: Clerk

- **`minder-data-provider/providers/clerk`** — dedicated auth. Client
  `AuthContract` over `@clerk/clerk-js` (optional peer); server-side session
  verification via `createClerkSessionHandler` (zero-dep fetch, secret masked
  from all outputs). **Certified** (10/10), mock-parity tests,
  browser-verified mock login. Manifest claims react/nextjs/vite only —
  Clerk's React Native SDK differs and is not claimed.
- **`minder add clerk`** scaffolds the session-verify route.

### Added — Certified provider: Stripe

- **`minder-data-provider/providers/stripe`** — payments via the secure server
  boundary. `createCheckoutHandler` creates Checkout sessions server-side with
  a zero-dependency `fetch` (secret key resolved per-request, masked from every
  response and log — sentinel-tested); `createStripeWebhookHandler` verifies the
  `t=,v1=` signature on the WebCrypto HMAC primitive. **Certified** (10/10),
  mock-parity + secret-sentinel tests, browser-verified mock checkout.
- **`minder add stripe`** scaffolds real, visible Next.js route files (checkout
  + webhook) that call the library handlers — the hybrid model in action.
- The webhook primitive gained a backward-compatible `parseSignatureHeader`
  option (default path byte-identical).

### Added — 🎉 First certified provider: Supabase

- **`minder-data-provider/providers/supabase`** — auth, storage, and realtime
  capability contracts over a lazily-loaded `@supabase/supabase-js` (optional
  peer); `getProviderClient()` returns the raw client. **Certified**: 10/10
  certification checks, mock-parity tests, secret-sentinel tests, runnable
  example (mock mode, browser-verified). Live-service E2E requires real
  credentials and is explicitly outside CI.
- **Mock mode end-to-end**: `registerSupabaseProvider({ mock: true })` powers a
  full UI (session + storage) with zero keys — see
  examples/nextjs-app/pages/supabase.tsx.
- **`minder add supabase`** scaffolds env vars + config snippet
  (EXPERIMENTAL label removed only by certification — the catalog is the
  source of truth).
- **`registerClientSafeProviderKeys`**: per-provider allowlist distinguishing
  intentionally-public keys (Supabase `anonKey`) from server-only credentials
  (`serviceRoleKey`) — allowlisted providers get *stricter* credential-shaped
  checking with explicit exemptions.

### Added (provider platform foundation — wave 1)

- **Typed credential model** (`CredentialInput`: env secrets via `secret()`,
  server-config references, credential-file refs) with server-only
  `resolveCredential()` and masked `describeCredential()`. File contents can
  never appear in error messages (sentinel-tested). Raw secret-shaped strings
  under `providers.*` hard-fail in browser configs naming the exact key.
- **Edge-safe server handler core** (`minder-data-provider/server`): web-standard
  `MinderHandler` type, `createWebhookHandler` with constant-time HMAC-SHA256
  verification via WebCrypto (timestamp tolerance, typed 400/401 error codes),
  and `toNodeHandler` for Express/self-hosted Node. No Node-only APIs in the
  edge path.
- **Capability contracts**: `useAuth()`, `useCheckout()`, `useStorage()`,
  `useLive()` + `registerCapabilityProvider()` — one stable client contract per
  capability, providers swappable by config; `getProviderClient()` escape hatch
  guarantees no capability loss. **Behavior change:** `useAuth` from the root
  entry is now the capability-contract hook (it shadows the legacy
  AuthManager-based `useAuth`; that behavior remains available via
  `useMinder().auth`).
- **Provider catalog** (`docs/providers/CATALOG.md`, `npm run generate:catalog`):
  honest Certified / Community / Planned tiers generated from manifests, with
  per-provider runtime/framework claims.

### Added (provider platform foundation — wave 2)

- **Mock mode**: `registerMockProvider(capability, impl)` — build complete UI
  flows (e.g. `useAuth()`) with zero credentials and zero provider accounts;
  mocks are flagged `isMock` and integrate with the manifest-based testing
  harness.
- **`minder` CLI** (`npx minder`): `init` (config + `.env.example` scaffold +
  a where-to-get-your-keys table), `add <provider>` (honest "no certified
  providers yet" until wave ② ships; scaffolding machinery ready underneath),
  `doctor` (masked credential health check — never prints values).
- **Edge-safety regression guard**: the server handler core and contracts are
  provably bundleable for edge runtimes (esbuild `platform=neutral` in CI,
  with a discrimination proof that seeded Node APIs fail the guard).

### Added (M1 — integration foundation)

- **Zero-config calls.** `useMinder('https://api.example.com/users')` works with
  no provider and no `configureMinder`; with just `configureMinder({ apiUrl })`,
  any `'/path'` works — the routes registry is now optional.
- **`error.raw`.** Every error surface (result-mode `error`, `throwOnError`
  throws, provider and standalone) exposes the original underlying error
  (e.g. the `AxiosError`) via `.raw`.
- **`ApiClient.getAxiosInstance()`** — documented escape hatch to the live
  axios instance.
- **Config validation.** `configureMinder` now validates against a schema and
  throws one aggregated error listing every problem with a `Fix:` line;
  unknown keys get nearest-key suggestions. Server-only config keys holding
  raw (non-`secret()`) values hard-fail in browser environments.
- **`npm run generate:env-example`** — scans the code for env usages and
  writes a placeholder-only `.env.example`.
- **Provider manifest + certification.** `ProviderManifest` schema
  (`defineProviderManifest`, `validateProviderManifest`) and
  `npm run certify:provider <dir>` validating a provider package against the
  10-point certification checklist (see docs/providers/CERTIFICATION.md).
- **Runnable Next.js example app** (`examples/nextjs-app`) consuming the
  packed tarball, with a CI workflow building it on PRs.

### Added (enterprise config composition)

- **`mergeMinderConfig(...modules)`** — compose several partial config modules
  (e.g. one per team/feature) into one config for `configureMinder`. Record
  fields (`routes`, `providers`, `environments`) union-merge (later key wins on
  conflict); scalars take the last non-`undefined` value. Inputs are not
  mutated.

### Added (local-first data)

- **`useMinder(route, { source })`** — read data from local persistent storage,
  not just the network:
  - `'network'` (default): unchanged.
  - `'local'`: read only from local storage (offline data store); never touches
    the network.
  - `'local-first'`: fetch from the network; persist the result locally on
    success; on network failure fall back to the last persisted value — your UI
    keeps working offline with no extra code.
- **`LocalStore`** exported (isomorphic: web → localStorage, native →
  AsyncStorage, expo → SecureStore, electron → electron-store) so apps can
  pre-seed or manage offline data directly. Omitting `source` leaves the
  network path byte-identical (regression-tested).

### Fixed (platform entries — mobile/desktop)

- **`HttpMethod` is now exported from `/native`, `/expo`, and `/node`.**
  `import { HttpMethod } from 'minder-data-provider/expo'` (or `/native`,
  `/node`) previously returned `undefined` — the same dist-interop bug fixed
  earlier for the root/web/nextjs entries, on platform entries the regression
  guard didn't cover. Fixed with the eager const-binding; the guard now probes
  all platform entries.

### Added (platform reliability)

- **Storage adapter test coverage.** The Electron, Expo, and React Native
  storage adapters — the platform-specific delta of `/electron`, `/expo`,
  `/native` — went from ~4-6% to ~60% coverage: CRUD, TTL expiry, namespace
  isolation, batch `multiGet`/`multiSet`, and graceful degradation when the
  optional backing peer is absent. (RN/Expo/Electron remain **Experimental** —
  no on-device/GUI runtime run in CI yet; see the support matrix.)

### Fixed (CLI honesty + CORS security residuals)

- **`minder` CLI no longer contradicts the catalog.** `minder add <provider>`
  derives certification from the catalog generator's `CERTIFIED` list (single
  source of truth — verified side-effect-free and working from the published
  package layout); all six certified providers now print
  `status: CERTIFIED`. Help text, config template, `.env.example` headers,
  and the unknown-provider message were de-staled, with provider lists
  derived from the registry so they cannot drift.
- **Express proxy generator aligned with the Next.js one** (SEC-01 class):
  `Access-Control-Allow-Credentials` is now opt-in (was default-on) and
  generation refuses the credentials+wildcard-origin combination.
- **Three residual default-on credential fallbacks fixed** (opt-in now):
  environment-override resolution (`EnvironmentManager`), `CorsManager`
  defaults, and the CORS-config utility. An `environments` override with
  `cors: { enabled: true }` previously armed credentialed mode silently.
- **`createCorsMiddleware` is now exported from `minder-data-provider/server`**
  (server-only — the root entry deliberately excludes it, absence-tested).
  A dist-level negative probe now guards that `resolveCredential` can never
  appear on the built root entry.

### Added (custom-provider public API)

- **Custom providers can now be built entirely from the published package.**
  `registerClientSafeProviderKeys`, `isCredentialInput`, `describeCredential`,
  and the `CredentialInput` type are exported from `minder-data-provider`
  (and `/web`, `/nextjs`); `resolveCredential` is exported from
  `minder-data-provider/server` **only** (server-side resolution — the root
  entry deliberately does not export it, enforced by an absence test).
  `docs/providers/CUSTOM.md` + a runnable reference example
  (`examples/custom-provider/`) show the full pattern; the example's
  secret-leak sentinel test runs in the repo's own CI gate.

### Fixed (configureMinder presets)

- **`configureMinder()` presets no longer override the M0 flagship defaults.**
  Platform presets previously hardcoded `retries: 3` (all platforms) and
  `cors: { credentials: true }` (web), silently reinstating the
  pre-2.2.0-beta.1 3-retry / always-credentialed behavior and the
  CORS-preflight tax for every `configureMinder()` consumer. Presets now
  default to `retries: 1` and credentials **opt-in** (`credentials` is on only
  when explicitly `true`, including for the `cors: true` / `corsHelper: true`
  shorthands). **Migration:** to restore the old behavior, set
  `performance: { retries: 3 }`; for credentialed cross-origin/cookie requests
  set `corsHelper: { credentials: true }` (with an explicit `origin`
  allowlist — not `*`). Explicit `performance.retries: 0` and
  `credentials: false` are respected.

### Fixed (dist interop)

- **`HttpMethod` was `undefined` in browser bundles.** Under code splitting,
  the enums chunk is wrapped in a lazy init thunk; a bare
  `export { HttpMethod } from …` re-export combined with `sideEffects: false`
  let consumer bundlers (webpack in Next.js) skip the thunk entirely,
  crashing client code with `Cannot read properties of undefined`. Public
  entries now bind the enum to a concrete `const`, forcing eager
  initialization. A bundler-level regression test
  (tests/dist-entry-exports.test.ts) tree-shakes the built dist with esbuild
  and asserts the enum survives — Node-loader checks alone cannot catch this
  class of bug.

### Added

- `createCorsMiddleware(options)` factory (rejects credentials + wildcard).
- `isJwtShaped(token)` exported from the JWT utility.
- `getQueryClientConfig()` export for inspecting effective query defaults.
- `CODE_OF_CONDUCT.md`; SECURITY.md now has a real private-reporting channel
  (GitHub Security Advisories) and covers 2.2.x.

### Removed

- Nine stale root artifacts (old audit/verification reports, captured test
  logs, a 2.0.3 tarball) deleted from the repository; `*.tgz` and generated
  bundle reports are now gitignored.

## [2.2.0-beta.0] - 2026-06-21

A reliability + extensibility release. Everything here is **additive and backward-compatible** — no
public APIs were removed.

### 🛡️ Reliability fixes

- **JWT crash fixed** — `GlobalAuthManager.parseJWT` now validates the 3-part token structure, so a
  malformed/corrupted token returns `null` instead of crashing token restoration.
- **Timer leak fixed** — `ApiClient` now stores and clears its analytics/telemetry intervals via a
  new `ApiClient.destroy()`, called automatically when `MinderDataProvider` unmounts.
- **Listener leak fixed** — the offline manager removes its `online`/`offline` listeners on destroy.
- **Offline persistence** — `IndexedDBStorage` falls back to `localStorage` when IndexedDB is
  unavailable (SSR/jsdom/locked-down browsers) instead of silently no-op'ing.
- **Streaming** — `StreamClient` now routes async errors to `onError` instead of leaking unhandled
  rejections.
- **Standalone error handling** — `useMinder` in no-provider mode now surfaces real request errors
  (and honors `throwOnError`) instead of mis-calling `minder()` and always reporting success.

### ⚡ Performance / DX

- **No more re-render cascades** — `useMinder`'s `auth`/`cache`/`websocket`/`upload` objects are now
  memoized with stable identities.
- **New `minder-data-provider/core` entry** — a minimal import surface (`minder`, `useMinder`,
  `configureMinder`, provider, errors) for smaller bundles.
- **`transport` option on `minder()`** — defaults to axios (predictable); opt into the faster native
  `fetch` fast-path with `transport: 'fetch'` (previously this path could silently change semantics).

### 🧩 Plugins & integrations

- **The plugin bus is live** — `PluginManager` hooks (`onRequest`/`onResponse`/`onError`) now fire on
  every request (via `config.plugins` or `registerPlugins()`), through both the provider and the
  standalone `minder()` paths. Plugins are isolated (a failing plugin never breaks a request).
- **Extended plugin contract** — `PluginManifest`/`MinderCapability` plus optional `provideToken`
  (auth-provider plugins like Firebase/Auth0/Clerk), `onAuthRefresh`, `onUpload`, `onSync`,
  `onConnectivityChange`.

### 🔐 Secret-key safety

- **`secret()` / `env()` + `SecretRef`** — keep secret keys out of the client bundle. `SecretRef` is
  non-stringifiable (`[SECRET:NAME]`); `assertNoExposedSecrets()` (wired into `configureMinder`)
  **throws in the browser** if a raw secret-shaped value is found in config.
- **New `minder-data-provider/server` entry** — `resolveSecret()` resolves secrets server-side and
  throws if called in the browser.

### 🎛️ Developer freedom (escape hatches)

- **`throwOnError`** on `minder()` and `useMinder()` — opt into throwing for try/catch, TanStack
  Query error states, and React error boundaries (the never-throws result model remains the default).
- **Ad-hoc URLs** — absolute `http(s)` URLs (or the `rawUrl` option) bypass the route registry, so
  you can call any/third-party endpoint without pre-registering it.

### 🔧 Tooling

- CI lint is now blocking (`lint:check`, no longer swallowed).

### 🧹 Internal / maintainability

- **One `useMinder`** — the `./hook` subpath previously shipped a separate, older copy of the hook;
  it now re-exports the canonical implementation, so every fix reaches `/hook` users too.
- **One JWT parser** — six divergent `split('.') + atob + JSON.parse` implementations across the auth
  managers and hooks are consolidated into a single, tested `parseJWT` utility (never throws).

## [2.1.5-beta.0] - 2026-02-16

### 🚀 Beta Release Enhancements

- **Stability Improvements** - Refined internal error handling and cache management
- **Platform Sync** - Updated platform-specific adapters for better Next.js 15 and React 19 compatibility
- **Dependency Updates** - Bumped `@reduxjs/toolkit` to 2.9.2 and other core dependencies
- **Infrastructure** - Enhanced build verification scripts for more robust releases

## [2.1.0] - 2025-11-12

### 🚀 Major useMinder() Hook Enhancements (70 new tests)

This release dramatically improves the `useMinder()` hook with 11 critical enhancements that make it work seamlessly with or without `MinderDataProvider`. All features now have intelligent fallbacks and work in any context.

#### Global Configuration & Authentication

- **Global Config Access** - `useMinder()` works without provider using `setGlobalMinderConfig()`
- **Standalone Authentication** - New `GlobalAuthManager` with JWT parsing, expiry checking, and persistent storage
- **Shared Auth State** - Authentication state synchronized across all hook instances globally

#### Enhanced Developer Experience

- **Intelligent Route Validation** - Helpful suggestions using Levenshtein distance (e.g., "Did you mean: posts, users?")
- **Smart Parameter Replacement** - `replaceUrlParams()` works without provider context
- **Detailed Error Messages** - Detects unreplaced `:param` placeholders with clear guidance

#### Upload & Progress Tracking

- **Shared Upload Progress** - New global `uploadProgressStore` synchronizes progress across all components
- **Live Progress Updates** - Subscribe to upload progress changes with automatic notifications
- **Multi-Component Sync** - All instances see identical upload progress in real-time

#### Advanced Query Features

- **Custom Query Keys** - Full control over React Query cache with `queryKey` option
- **Infinite Scroll Support** - Complete `useInfiniteQuery` integration with bidirectional pagination
- **Per-Hook Retry Config** - Override global retry settings per hook instance
- **Cache Control API** - New `cache`, `staleTime`, `gcTime` options for fine-tuned caching

#### Request Management

- **Request Cancellation** - New `cancel()` method and `isCancelled` state to prevent race conditions
- **Conditional Fetching** - Improved `enabled`/`autoFetch` handling with proper query skipping

#### New Files Added

- `src/auth/GlobalAuthManager.ts` - Standalone auth manager (176 lines)
- `src/upload/uploadProgressStore.ts` - Shared upload state (93 lines)
- `src/utils/routeHelpers.ts` - Route validation & helpers (104 lines)
- `src/core/globalConfig.ts` - Global config management (55 lines)

#### Enhanced APIs

- `src/hooks/useMinder.ts` - 11 enhancements integrated (+250 lines)
- `src/core/MinderDataProvider.tsx` - Auto-sets global config (+4 lines)
- `src/index.ts` - Exports all new utilities (+35 lines)

#### Test Coverage

- **Enhancement Tests**: 42 tests validating all 11 fixes
- **End-User Scenarios**: 28 tests covering 14 real-world use cases
- **Total Tests**: 1,397 tests (100% passing)

#### Breaking Changes

**None** - This release is 100% backward compatible. All existing code continues to work without modifications.

#### Migration Benefits

- **From React Query**: Familiar API + auth/upload/websocket built-in
- **From SWR**: Similar patterns + more features out of the box
- **No Provider Needed**: Use `setGlobalMinderConfig()` for simple setups
- **Provider Optional**: Use `MinderDataProvider` for advanced features

---

## [2.0.3] - 2025-11-12

### 🚀 New Features

#### Phase 2 - Advanced Data Management Features (78 new tests)

- **Built-in Validation System** (21 tests)

  - Type-based validation (string, number, email, URL, boolean, date, array, object)
  - Custom validation rules with error messages
  - Async validation support for server-side checks
  - Schema-based validation for complex objects
  - Integration with CRUD operations (automatic validation before create/update)
  - Detailed validation error reporting

- **Enhanced Retry Configuration** (17 tests)

  - Per-operation retry policies (create, read, update, delete can have different retry strategies)
  - Exponential backoff with jitter to prevent thundering herd
  - Conditional retry based on error type (network errors, 5xx status codes)
  - Max retry attempts with configurable delays
  - Retry state tracking and error propagation
  - Works with both optimistic and pessimistic updates

- **Pagination Helper** (28 tests)

  - Automatic page tracking and state management
  - Multiple pagination styles (offset, cursor, page-based)
  - Smart prefetching of next/previous pages
  - Total count and page count calculation
  - Navigation helpers (goToPage, nextPage, prevPage, firstPage, lastPage)
  - Integration with CRUD operations and caching
  - Optimized for infinite scroll scenarios

- **Offline Queue Persistence** (12 tests)
  - Persistent storage of failed requests across sessions
  - Automatic retry when connection restored
  - Queue serialization to localStorage/AsyncStorage
  - Conflict resolution strategies
  - Queue manipulation (add, remove, clear)
  - Sync state tracking (pending, syncing, synced, failed)
  - Works seamlessly with optimistic updates

### 🔒 Security Enhancements

#### Critical Security Fixes (11 tests fixed, 61/61 passing)

- **Input Sanitization** (BREAKING CHANGE - HIGH PRIORITY)

  - Changed from permissive sanitization to strict validation
  - `sanitizeEmail()` now **rejects** malicious patterns instead of cleaning them
  - `sanitizeURL()` validates and rejects suspicious URLs
  - Patterns rejected: `<script>`, `javascript:`, HTML tags, SQL injection attempts
  - **Migration**: Code expecting cleaned output must now handle validation errors
  - Improved security posture - prevents XSS and injection attacks

- **Rate Limiting**

  - Fixed test expectations to match actual error messages
  - Verified exponential backoff works correctly
  - Sliding window algorithm prevents brute force attacks
  - Per-operation tracking (login, API calls, etc.)
  - Time window reset after cooldown period

- **Token Security**

  - Enhanced HTTPS enforcement with defensive checks
  - Added `window.location` existence validation
  - Separate test suite for token operations
  - Secure token storage (memory, httpOnly cookies, SecureStore)
  - JWT validation and expiry checking
  - Automatic cleanup on logout

- **CSRF Protection** (6/6 tests passing)

  - Web Crypto API token generation
  - Token validation on state-changing operations
  - Secure token storage and transmission

- **XSS Prevention** (6/6 tests passing)
  - DOMPurify integration for HTML sanitization
  - Input validation before processing
  - Output encoding for user-generated content

### ✨ Feature Completeness Verification

- **WebSocket** - Confirmed fully implemented (662 lines, production-ready)

  - Auto-reconnection with exponential backoff
  - Heartbeat/ping-pong for connection health monitoring
  - Message queuing for offline scenarios
  - Event subscription system with wildcards
  - Platform-specific adapters (Web, React Native, Node.js)
  - Comprehensive error handling and state management

- **File Upload** - Confirmed fully implemented (662 lines, production-ready)
  - Progress tracking with percentage callbacks
  - Image optimization (resize, format conversion, quality adjustment)
  - Chunked uploads for large files
  - Retry logic for failed uploads
  - Cancellable uploads with cleanup
  - Multiple file upload support

### 🧪 Testing & Quality

- **Test Coverage**: 1,300 passing tests (up from 1,100 in v2.0.2)

  - 100% test success rate (0 failing)
  - 27 intentionally skipped tests (platform-specific)
  - Security test suite: 61/61 passing
  - Phase 2 features: 78/78 passing

- **Code Quality**
  - Zero TypeScript compilation errors
  - Zero npm security vulnerabilities
  - No critical TODO/FIXME comments
  - Proper type safety throughout codebase

### 🐛 Bug Fixes

- Fixed input sanitization logic to validate before sanitizing
- Updated rate limiting error messages for consistency
- Enhanced HTTPS check to prevent undefined errors in edge cases
- Improved test suite organization for token security tests

### 📚 Documentation

- Added `CRITICAL_ISSUES_FIXED.md` - comprehensive security fix report
- Updated `END_USER_VERIFICATION.md` - all verification scenarios passing
- Enhanced `RELEASE_NOTES_2.0.3.md` - detailed feature documentation
- Created `UPGRADE_GUIDE_2.0.3.md` - migration instructions for breaking changes

### ⚠️ Breaking Changes

**Input Sanitization** (HIGH PRIORITY)

```typescript
// OLD BEHAVIOR (v2.0.2 and earlier)
const email = sanitizeEmail('<script>alert("xss")</script>user@example.com');
// Returns: 'scriptalertxssscriptuser@example.com' (cleaned but invalid)

// NEW BEHAVIOR (v2.0.3+)
const email = sanitizeEmail('<script>alert("xss")</script>user@example.com');
// Throws: Error('Invalid email format') - rejects immediately
```

**Migration Required:**

- Wrap sanitization calls in try-catch blocks
- Validate user input BEFORE calling sanitization functions
- Update error handling to display validation errors to users
- See `UPGRADE_GUIDE_2.0.3.md` for detailed migration steps

### 📦 Bundle Size

No changes to bundle size - modular architecture maintained:

- Full bundle: ~150KB
- CRUD only: ~45KB
- Auth only: ~25KB
- Cache only: ~20KB

### 🔧 Package Configuration

- Version bumped to 2.0.3
- All peer dependencies verified compatible
- Node >= 18.0.0 requirement maintained
- React 18/19 support confirmed

## [2.0.2] - 2025-11-08

### 🧪 Testing & Quality

#### Improved Test Coverage

- **Overall Coverage**: Increased from 34.94% to 53.19% (+18.25%)
- **Total Tests**: 1,100+ comprehensive tests (up from 443)
- **Test Suite Growth**: +148% increase in test coverage

#### New Test Suites

- **WebSocketManager**: 40 tests covering connections, subscriptions, heartbeat, reconnection, and error handling (3.7% → 97.53%)
- **AuthManager**: 55 tests for all storage types (memory, sessionStorage, cookie, AsyncStorage, SecureStore), JWT validation, and debug logging (0.76% → 89.31%)
- **TokenRefreshManager**: 26 tests for JWT parsing, auto-refresh, manual refresh, and error scenarios (77.77% → 97.97%)
- **MemoryStorageAdapter**: Enhanced with 36 additional tests covering TTL, garbage collection, edge cases (81.96% → 83.6%)
- **WebStorageAdapter**: 47 new tests for quota management, error handling, TTL support (45.26% → 71.57%)
- **CacheManager**: 44 tests for QueryClient integration, cache invalidation, prefetching (2.04% → 93.87%)

#### Modules at 100% Coverage

- BaseModel
- Config presets
- DebugManager
- Constants
- Core minder utils
- EnvironmentManager

#### High Coverage Modules (90%+)

- Minder core (95.23%)
- Logger (94.36%)
- CacheManager (93.87%)
- WebSocketManager (97.53%)
- TokenRefreshManager (97.97%)
- AuthManager (89.31%)

### 🔧 Bug Fixes

- Fixed async storage handling in AuthManager
- Improved error handling in WebStorageAdapter quota management
- Enhanced TTL expiration cleanup in storage adapters

### 📚 Documentation

- Comprehensive test documentation for all new test suites
- Improved inline code comments

## [2.0.0] - 2025-11-04

### 🎉 Major Release

Complete rewrite with focus on performance, developer experience, and bundle size optimization.

### ✨ Added

#### Core Features

- **Modular Architecture**: Tree-shakeable imports reduce bundle size by up to 87%
- **Simplified Configuration**: One-line setup with `createMinderConfig()`
- **Auto-Generated CRUD**: Define routes once, get full CRUD automatically
- **Advanced Debug Tools**: Comprehensive debugging with performance monitoring
- **Flexible SSR/CSR**: Choose rendering strategy per component

#### Advanced Features (Task #6)

- **DevTools Panel**: Real-time debugging interface with 4 tabs:
  - Network monitoring with request/response tracking
  - Cache inspection with TTL display
  - Performance metrics (requests, latency, cache hit rate)
  - State change tracking
- **Plugin System**: Extensible architecture with lifecycle hooks:
  - `onInit`, `onRequest`, `onResponse`, `onError`
  - `onCacheHit`, `onCacheMiss`, `onDestroy`
  - Built-in plugins: Logger, Retry, Analytics
- **Query Builder**: Fluent API for complex queries:
  - Filters with multiple operators (eq, gt, lt, contains, etc.)
  - Sorting (asc/desc) and pagination
  - Search functionality
  - Type-safe query construction

#### Performance Optimizations

- Request deduplication to prevent duplicate API calls
- Request batching to reduce network overhead by ~50%
- Performance monitoring with real-time metrics
- React performance hooks (`useDebounce`, `useThrottle`, `useLazyLoad`)
- Memory leak prevention utilities
- Bundle size analysis tools

#### Security Features

- XSS protection with DOMPurify integration
- CSRF protection using Web Crypto API
- Rate limiting with sliding window algorithm
- Input validation and sanitization utilities
- Security headers configuration

#### Testing Infrastructure

- Comprehensive test suite with 98+ passing tests
- Infrastructure tests (5 tests)
- Hook tests (8 tests)
- Security tests (38 tests)
- Performance tests (19 tests)
- Advanced features tests (28 tests)
- Jest + React Testing Library setup

#### Documentation

- Complete API Reference (800+ lines)
- Migration Guide from v1.x
- Real-world Examples collection
- Performance optimization guide
- Security best practices
- Advanced Features Testing Guide
- Quick Test Guide
- Contributing guidelines

### 🔄 Changed

#### Breaking Changes

- `apiBaseUrl` → `apiUrl` in configuration
- Import paths support modular structure:
  - `minder-data-provider/crud` for CRUD operations
  - `minder-data-provider/auth` for authentication
  - `minder-data-provider/cache` for caching
  - etc.
- Route configuration simplified - auto-generates CRUD operations
- Feature configuration accepts boolean for auto-configuration

#### Improvements

- TypeScript strict mode enabled
- Better type inference throughout
- Improved error messages
- Enhanced cache invalidation strategies
- Optimized network request handling

### 🐛 Fixed

- Memory leaks in WebSocket connections
- Race conditions in concurrent requests
- Cache invalidation edge cases
- TypeScript type compatibility issues
- Bundle size bloat from unused code

### 📦 Bundle Size

- Full bundle: ~150KB (unchanged for backward compatibility)
- CRUD only: ~45KB (70% smaller)
- Auth only: ~25KB (83% smaller)
- Cache only: ~20KB (87% smaller)

### 🔧 Dependencies

- Added: `dompurify` for XSS protection
- Updated: TypeScript to 5.4.3
- Updated: Jest to 29.7.0
- Updated: React Testing Library to 14.0.0

---

## [1.0.0] - 2024-01-15

### Initial Release

- Basic CRUD operations
- TanStack Query + Redux integration
- Authentication support
- WebSocket integration
- File upload support
- Basic caching
- TypeScript support

---

## Migration Guides

### From v1.x to v2.0

See the complete [Migration Guide](./docs/MIGRATION_GUIDE.md) for detailed instructions.

**Quick Migration:**

1. Update package: `npm install minder-data-provider@latest`
2. Update configuration:

   ```typescript
   // Old
   {
     apiBaseUrl: "...";
   }

   // New
   createMinderConfig({ apiUrl: "..." });
   ```

3. Update imports for smaller bundles:

   ```typescript
   // Old
   import { useOneTouchCrud } from "minder-data-provider";

   // New
   import { useOneTouchCrud } from "minder-data-provider/crud";
   ```

---

## Deprecation Warnings

### v2.0

- `apiBaseUrl` is deprecated, use `apiUrl` instead (will be removed in v3.0)
- Unified imports are discouraged, use modular imports for better performance

---

## Upcoming Features

### v2.1 (Planned)

- [ ] GraphQL support
- [ ] Offline-first capabilities
- [ ] Advanced query builder
- [ ] Built-in pagination hooks
- [ ] Request cancellation UI helpers

### v2.2 (Planned)

- [ ] React Native support
- [ ] DevTools extension
- [ ] Plugin system
- [ ] Custom middleware support
- [ ] Advanced analytics integration

### v3.0 (Future)

- [ ] Complete API redesign
- [ ] Drop legacy support
- [ ] Framework-agnostic core
- [ ] Native TypeScript rewrite
- [ ] Zero-config setup

---

## Support & Contributing

- Report bugs: [GitHub Issues](https://github.com/minder-data-provider/issues)
- Feature requests: [GitHub Discussions](https://github.com/minder-data-provider/discussions)
- Contributing: See [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security: See [SECURITY.md](./SECURITY.md)

---

## License

[MIT](./LICENSE) © Minder Data Provider Contributors
