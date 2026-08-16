<div align="center">

# Minder Data Provider

[![npm version](https://img.shields.io/npm/v/minder-data-provider.svg?style=flat-square)](https://www.npmjs.com/package/minder-data-provider)
[![npm downloads](https://img.shields.io/npm/dm/minder-data-provider.svg?style=flat-square)](https://www.npmjs.com/package/minder-data-provider)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/minder-data-provider?style=flat-square)](https://bundlephobia.com/package/minder-data-provider)
[![CI](https://img.shields.io/github/actions/workflow/status/patelkeyur7279/minder-data-provider/ci.yml?style=flat-square&label=tests)](https://github.com/patelkeyur7279/minder-data-provider/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/patelkeyur7279/minder-data-provider/branch/main/graph/badge.svg)](https://codecov.io/gh/patelkeyur7279/minder-data-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg?style=flat-square)](http://www.typescriptlang.org/)

<br>

### The universal React data layer

**UI → `MinderDataProvider` → any backend, local data, or service. One API call to enterprise.**

One hook for fetching, auth, and caching. One CLI command for certified third-party
integrations. One config for plugins, secrets, and edge-safe server handlers — when you
need them, and not before.

[**Read the full documentation (Wiki)**](https://github.com/patelkeyur7279/minder-data-provider/wiki)

</div>

---

## Why not just TanStack Query?

`useMinder` is built directly on `@tanstack/react-query` — Minder doesn't replace
your cache, it wraps it. What TanStack Query alone still leaves you to build by
hand is everything *around* the cache: provider SDK glue, mock data for local
dev, typed routes, secret-safe server code, and per-platform storage. Honest
comparison, no invented benchmarks:

| | Plain TanStack Query | Minder |
| --- | --- | --- |
| Auth/payments/storage/realtime providers | Wire each SDK yourself | 9 certified integrations (Clerk, Auth0, Auth.js, Cognito, Firebase, Supabase, Stripe, Razorpay, Sentry) behind one `useAuth()`/`useCheckout()`/`useStorage()`/`useLive()` contract per capability — swap `Clerk` for `Auth0`, or for a mock, without touching the call site |
| Local development without a provider account | Stub the SDK yourself | Every certified provider ships a zero-key mock mode, so you can build the whole UI before you have real credentials |
| Adding a provider | Read its docs, hand-write config | `npx minder add stripe` scaffolds a `.env.example` entry, config, and (where the provider needs one) real server route files |
| Typed API routes | Hand-write types or bolt on separate codegen | `npx minder generate --from openapi.json` generates a typed route map + interfaces straight from an OpenAPI 3.x spec |
| Server-only secrets | Your own convention for keeping keys off the client | `secret("ENV_NAME")` resolves server-side only; any secret-shaped value that's reachable from the client throws at config time, naming the offending key |
| Cross-platform storage | Pick and wire a storage library per platform | Built-in storage adapters ship per platform — `WebStorageAdapter` (web, Next.js, Electron) and `NativeStorageAdapter` (React Native, Expo — backed by SecureStore on Expo) — exported from each platform's own subpath |

None of this is required up front — Level 0 below is `useMinder(url)` and
nothing else. Adopt the rest only when you actually need it.

For AI coding agents: [`llms.txt`](./llms.txt) has a machine-readable summary of
the API surface — read that instead of guessing from `node_modules`.

---

## Install

```bash
npm install minder-data-provider @tanstack/react-query
```

`@tanstack/react-query` powers the caching layer and is a required peer dependency —
install it yourself so your app controls the version.

**Requirements:** Node ≥ 20, React 18 or 19, `@tanstack/react-query` ≥ 5.90.6. See the full
[compatibility matrix](docs/COMPATIBILITY.md), or run **`npx minder doctor`** in your project — it
checks your installed versions and tells you exactly what (if anything) to update.

## The Golden Path

Minder meets you where you are. Start at Level 0 and adopt the next level only when you
actually need it — nothing below requires anything above it.

### Level 0 — zero config

```tsx
import { useMinder } from "minder-data-provider";

const { data } = useMinder("https://api.example.com/users");
```

No provider, no config file, nothing to register. An absolute URL is dispatched
straight through — the routes registry is entirely optional at this level. (You do need
a TanStack Query `QueryClientProvider` mounted once, somewhere above it — the same
one-time setup any `@tanstack/react-query` app already has.)

### Level 1 — named routes

```typescript
import { configureMinder, HttpMethod } from "minder-data-provider";

configureMinder({
  apiUrl: "https://api.example.com",
  routes: {
    users: { url: "/users", method: HttpMethod.GET },
    createUser: { url: "/users", method: HttpMethod.POST },
  },
});
```

```tsx
import { useMinder } from "minder-data-provider";

const { data, loading, error } = useMinder<User[]>("users");
```

Call `configureMinder` once at your app's entry point; every `useMinder("routeName")`
after that resolves url/method/headers from the registry — no provider component
required. Prefer scoping config to part of your tree instead of a global?
`configureMinder` *returns* the full normalized config — pass that return value to the
provider: `<MinderDataProvider config={configureMinder({ ... })}>`.

### Level 2 — integrations

```bash
npx minder add stripe
```

Scaffolds a `.env.example` entry, a config snippet, and (for providers with a server
boundary) real Next.js route files. Paste your keys, flip `mock: false`, and call the
matching capability hook — no other call sites change:

```tsx
import { useCheckout } from "minder-data-provider/nextjs";

const checkout = useCheckout();
await checkout.createCheckout({
  items: [{ price: "price_123", quantity: 1 }],
  successUrl: "/success",
  cancelUrl: "/cancel",
});
```

**Mock mode** — every certified provider ships a mock implementation, so you can build
the whole UI (`useAuth()`, `useCheckout()`, `useStorage()`, `useLive()`) with zero keys
and zero provider account, then flip `mock: false` when you're ready to go live.

| Provider | Categories |
| --- | --- |
| Auth.js | auth |
| Auth0 | auth |
| Clerk | auth |
| Cognito | auth |
| Firebase | auth, database, storage |
| Razorpay | payments |
| Sentry | analytics |
| Stripe | payments |
| Supabase | auth, database, storage |

All eight are **Certified** (10-point checklist, mock-mode example, CI-tested).
Seven ship for React, Next.js, and Vite on web, Node, and edge runtimes; Auth.js
ships for Next.js only (its REST session contract is shared by other `@auth/*`
framework adapters, but only Next.js is tested here — see the catalog). Full
detail: [**Provider Catalog**](./docs/providers/CATALOG.md).

#### Bring your own provider

The certified list is convenience, never lock-in. **Any** SDK we don't ship an adapter for
integrates through the same first-class, public API — no fork, no internal imports. The typed
`defineProvider` factory wires the whole lifecycle (mock-vs-real branch, the raw-SDK escape
hatch, and correct cleanup) so your app's `useAuth()`/`useCheckout()`/`useStorage()`/`useLive()`
light up unchanged behind your integration:

```typescript
import { defineProvider } from "minder-data-provider";

const myProvider = defineProvider({
  providerName: "acme-analytics",
  capability: "live",
  createClient: (config) => makeAcmeClient(config.projectId),
  toContract: (client) => ({ subscribe: (ch, cb) => (client.on(ch, cb), () => client.off(ch, cb)) }),
  createMock: () => ({ subscribe: (ch, cb) => (cb({ channel: ch, mock: true }), () => {}) }),
});

myProvider.register({ projectId: "proj_1" }); // or { mock: true } for zero-key dev
```

Prefer the from-scratch primitives, or need a secret-backed server route? The full,
runnable, tested walkthrough is [**Building a custom provider**](./docs/providers/CUSTOM.md)
([reference code](./examples/custom-provider/acme-provider.ts)).

### Level 3 — plugins, servers, and secrets

**Plugins** hook every request without touching call sites. `onRequest`/`onResponse`/
`onError` are fire-and-forget observers; `onRequestIntercept` is the mutating
middleware — return a rewritten request, or short-circuit it entirely:

```typescript
import { registerPlugins } from "minder-data-provider";

registerPlugins({
  name: "error-bridge",
  onRequest: (req) => {/* observe outgoing requests — return value is ignored */},
  onError: (err) => reportError(err),
  onRequestIntercept: (config) => ({
    ...config,
    headers: { ...config.headers, "X-Trace-Id": crypto.randomUUID() },
  }),
});
```

**Server handlers** are edge-safe (no Node-only APIs in the request path) and mount
anywhere:

```typescript
import { createWebhookHandler, toNodeHandler, secret } from "minder-data-provider/server";

const handler = createWebhookHandler({
  secret: secret("WEBHOOK_SECRET"),
  signatureHeader: "x-signature",
  algorithm: "hmac-sha256",
  onEvent: async ({ body }) => {/* signature already verified — act on body */},
});

export const POST = handler; // Next.js Route Handler / edge runtime
// self-hosted Node or Express: http.createServer(toNodeHandler(handler))
```

**Secrets** never reach the client bundle: `secret("ENV_NAME")` resolves server-side
only, and any raw (non-`secret()`) value under a `providers.<name>.serverOnly` key — or
any secret-shaped string elsewhere in browser-reachable config — throws at
`configureMinder()` time, naming the exact offending key.

**Escape hatches**, always available, never a dead end:

- `error.raw` — the original underlying error (e.g. the `AxiosError`) on every error
  surface, result-mode or `throwOnError`.
- `getAxiosInstance()` — the live axios instance behind `ApiClient`.
- `getProviderClient()` — the raw SDK client behind any capability provider.
- `throwOnError: true` — opt into throwing (try/catch, error boundaries) instead of the
  default never-throws result object.

**Local-first data** — persist a query's last successful result to on-device storage and
serve it back when the network fails: `useMinder(route, { source: 'local-first' })`. Full
guide: [**Local-first Guide**](./docs/LOCAL_FIRST.md).

**Typed routes (optional)** — get route-name autocomplete and inferred response types without
touching the string API. Declare routes with `route<T>()`, then `createTypedMinder()` returns a
typed `minder`/`useMinder`:

```ts
import { createTypedMinder, route } from 'minder-data-provider';

const api = createTypedMinder({
  users: route<User[]>('/users'),
  user: route<User>('/users/:id', { method: HttpMethod.GET }),
});

const { data } = api.useMinder('users'); // data: User[] | null — no manual generic
```

The plain `useMinder('/anything')` string call is unchanged and remains a fully-typed escape
hatch — typed routes are purely additive.

**Generate typed routes from OpenAPI** — already have an OpenAPI 3.x (3.0 or 3.1) JSON
spec? Skip writing the `route<T>()` map by hand:

```bash
npx minder generate --from openapi.json --out minder.routes.ts
```

```ts
import { createTypedMinder } from 'minder-data-provider';
import { routes } from './minder.routes';

const api = createTypedMinder(routes);
const { data } = api.useMinder('listPets'); // data: Pet[] | null
```

The generated file exports a `routes` const (ready for `createTypedMinder`), one TS
interface per `components.schemas` entry plus any inline request/response body, and a
`RouteTypes` map (`{ [routeName]: { body?: ...; response?: ... } }`) for consumers who
want the shapes without going through `createTypedMinder`. Route names come from each
operation's `operationId` when present, else a derived `<method><PascalCasePath>` name
(e.g. `GET /pets/{petId}` → `getPetsByPetId`); OpenAPI's `{param}` path segments become
minder's own `:param` URL-template convention. Regenerating from the same spec is
byte-for-byte deterministic, so the output is safe to commit and diff. Only YAML specs
and the full JSON Schema vocabulary (`allOf`/`anyOf`, non-`$ref` `additionalProperties`,
etc.) are out of scope — unrepresentable pieces fall back to `unknown` with a comment
explaining why, rather than a wrong guess. `--base-path-strategy strip` (default) emits
routes as raw OpenAPI paths; `keep` prepends the path portion of the spec's first
`servers[].url` (e.g. `/v1`) to every route. See `npx minder --help` for the full flag list.

**Migrating off Redux (v3.0)?** `npx minder codemod redux-removal --dry-run` previews (and, without
`--dry-run`, applies) the mechanical parts of the migration — see
[Migration Guide: Automated migration](./docs/MIGRATION_GUIDE.md#automated-migration).

## Platform Support

| Environment | Status |
| --- | --- |
| React 19 (web) | Confirmed |
| Next.js (Pages Router) | Confirmed |
| Next.js (App Router / RSC) | Confirmed (provider-wrapper pattern) |
| Vite + React | Confirmed |
| React 18 | Confirmed (test-suite evidence) |
| Remix / React Router 7 | Confirmed |
| Astro + React islands | Confirmed |
| React Native / Expo | Confirmed (bundle + suite evidence) |
| Electron | Confirmed (headless runtime evidence) |
| Node (server) | Confirmed |
| Edge runtimes (Workers, Vercel Edge) | Confirmed (Workers) |

**Confirmed** = runnable example app + CI tests. **Experimental** = built and working,
without that evidence bar yet. **Unknown** = no evidence either way. **Inferred-works**
= should work on general principle, unverified. **Planned** = roadmap only, no code.
Per-capability detail (auth, WebSocket, offline, uploads, …):
[**Support Matrix**](./docs/product/SUPPORT_MATRIX.md).

## Bundle Cost — measured, budgeted, enforced

Two different numbers, on purpose — know which one applies to you. axios and dompurify
are runtime `dependencies` (not peers), so a real bundler ships them with your app; the
CI-enforced library budgets below deliberately exclude both to price the LIBRARY's own
code in isolation, so the "what you actually ship" numbers underneath are the ones that
match what a browser downloads.

**CI-enforced library budgets** (`npm run budgets:check`,
[`__snapshots__/bundle-budgets.json`](./__snapshots__/bundle-budgets.json)) — the
library's own code, min+gzip, with `peerDependencies` (React, TanStack Query, …) *and*
axios/dompurify external. A PR that regresses these fails CI:

- Feature subpaths (`/crud`, `/cache`, `/websocket`, `/upload`, `/auth`): **17–23 KB** each
- Certified providers: **5–7.5 KB** each · `/ssr` 1.4 KB · `/logger` &lt;1 KB

**What you actually ship** (measured against the built `dist/`, min+gzip, entry plus
every statically-imported chunk, peers external, axios/dompurify **bundled**):

- `import { useMinder } from 'minder-data-provider/hook'` alone — no `MinderDataProvider`
  (e.g. routes registered via the global `configureMinder()`, which `useMinder` supports
  standalone): **~16.5 KB**. axios is lazy-loaded on the first real request, so it costs
  nothing here.
- `import { minder } from 'minder-data-provider/core'` (the standalone function, same
  lazy-axios path): **~12.8 KB**.
- `import { MinderDataProvider, useMinder }` (the realistic full-provider import):
  **~55 KB**. `MinderDataProvider` constructs an `ApiClient`, which still creates its
  axios instance eagerly — that eager path is tracked separately and not yet lazy, so
  this import pays axios's full weight (~17 KB). dompurify itself now lazy-loads
  correctly in all three cases above (well under 1 KB either way — see CHANGELOG).

Run **`npx minder doctor --bundle`** in your own app to see exactly which subpaths you
import and what each costs. Pipeline overhead is benchmarked in CI too: `minder()` adds
**~0 ms** p50 over a raw axios call (`npm run bench`).

## What Minder is NOT

Minder solves everything between your UI and your data — and deliberately nothing else:

- **No GraphQL client.** The pipeline is REST/HTTP-shaped; use Apollo or urql for GraphQL.
- **No UI components.** Pair with shadcn/ui, Material UI, or your design system.
- **No form state.** Pair with react-hook-form (Minder handles the submit's data flight).
- **No global client-state store.** TanStack Query cache + your framework's state cover
  it; the legacy Redux integration is removed in v3.0.
- **No i18n, routing, or styling.** Your framework already does this better.

If a tool above already does the job, Minder integrates with it instead of replacing it.

## Response Validation (Standard Schema)

Two independent, opt-in validation hooks — don't confuse them:

- **`validate` (existing, input)** — a per-call function that pre-flights the OUTGOING
  data on a mutation, before it's sent. Runs client-side, on your request payload.
- **`schema` (new, response)** — an opt-in Standard Schema validator (any [Standard
  Schema](https://standardschema.dev) implementation — Zod ≥3.24, Valibot, ArkType,
  Effect Schema, or your own) checked against the INCOMING response body, AFTER the
  network round-trip succeeds. Fail-closed: a mismatch (or a validator that itself
  throws) never passes as valid data.

```ts
import { minder } from "minder-data-provider";
import { z } from "zod";

const userSchema = z.object({ id: z.number(), name: z.string() });

// data: { id: number; name: string } | null — inferred from the schema
const { data, error } = await minder("users/1", undefined, { schema: userSchema });

if (error?.code === "RESPONSE_VALIDATION_FAILED") {
  console.error(error.issues); // [{ message, path }, ...]
}
```

Set it once on a route definition (`schema` on the route config) and every call to
that route is checked; pass `options.schema` per-call to override the route default
(or to validate an ad-hoc/raw-URL call that has no registered route). On success,
`data` is replaced by the validator's output — so a Zod `.transform()` (or
equivalent) is honored. `minder()` still never throws by default: a validation
failure returns `{ success: false, error }` like any other error, unless
`throwOnError: true`.

Zero cost when unused: the vendored `StandardSchemaV1` type is type-only (erased at
compile time — no dependency installed), and the validator/error-handling code is
lazy-loaded only when a `schema` is actually configured.

## Security Model

- **Client-side auth checks are presence + expiry only.** `isAuthenticated()` inspects
  token presence and, for JWTs, the `exp` claim — it does **not** verify signatures,
  because a client bundle cannot hold signing secrets. Server code must verify tokens
  itself (e.g. with `jose`).
- **Corrupt JWTs fail closed, everywhere.** A JWT-shaped token whose payload can't be
  decoded is rejected — including in the no-provider `useMinder` fallback
  (`GlobalAuthManager`), which previously only checked presence (even an expired token
  used to pass). Opaque non-JWT bearer tokens keep presence-based semantics.
- **No forced CORS preflight.** The default axios instance sends only
  `Content-Type`/`Accept` — response-security headers (CSP, X-Frame-Options, …) never
  ride along on requests, where their mere presence would force a preflight `OPTIONS`
  round-trip on every cross-origin call.
- **Credentialed CORS requires an explicit origin allowlist.** The library's own
  CORS-emitting code (`ProxyManager.generateNextJSProxy()`) refuses to combine
  `Access-Control-Allow-Credentials` with a wildcard origin.
- **Secrets never enter the client bundle.** See Level 3 above.

See the [Migration Guide](./docs/MIGRATION_GUIDE.md) for every behavior change — including the
**breaking v2.x → v3.0 change (Redux integration removed)** and the 2.2.0-beta.1 changes, with
before/after code.

## Documentation

- [**Wiki Home**](https://github.com/patelkeyur7279/minder-data-provider/wiki) · [**Getting Started**](https://github.com/patelkeyur7279/minder-data-provider/wiki/Getting-Started) · [**Configuration Guide**](https://github.com/patelkeyur7279/minder-data-provider/wiki/Configuration-Guide)
- [**API Reference**](https://github.com/patelkeyur7279/minder-data-provider/wiki/API-Reference) · [**Platform Guide**](https://github.com/patelkeyur7279/minder-data-provider/wiki/Platform-Guide) · [**Features & Capabilities**](./docs/FEATURES.md)
- [**Provider Catalog**](./docs/providers/CATALOG.md) · [**Support Matrix**](./docs/product/SUPPORT_MATRIX.md)
- [**Changelog**](./CHANGELOG.md) · [**Migration Guide**](./docs/MIGRATION_GUIDE.md)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for
details.

<div align="center">

**Built with care for the React community.**

[Report Bug](https://github.com/patelkeyur7279/minder-data-provider/issues) · [Request Feature](https://github.com/patelkeyur7279/minder-data-provider/issues)

MIT Licensed — see [LICENSE](./LICENSE)

</div>
