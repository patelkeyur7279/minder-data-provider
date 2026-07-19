<div align="center">

# Minder Data Provider

[![npm version](https://img.shields.io/npm/v/minder-data-provider.svg?style=flat-square)](https://www.npmjs.com/package/minder-data-provider)
[![npm downloads](https://img.shields.io/npm/dm/minder-data-provider.svg?style=flat-square)](https://www.npmjs.com/package/minder-data-provider)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/minder-data-provider?style=flat-square)](https://bundlephobia.com/package/minder-data-provider)
[![CI](https://img.shields.io/github/actions/workflow/status/patelkeyur7279/minder-data-provider/ci.yml?style=flat-square&label=tests)](https://github.com/patelkeyur7279/minder-data-provider/actions/workflows/ci.yml)
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

## Install

```bash
npm install minder-data-provider @tanstack/react-query
```

`@tanstack/react-query` powers the caching layer and is a required peer dependency —
install it yourself so your app controls the version. Redux support
(`@reduxjs/toolkit`, `react-redux`) is optional; add it only if you use the
Redux-backed hooks.

**Requirements:** Node ≥ 20, React 18 or 19, `@tanstack/react-query` ≥ 5.90.6. See the full
[compatibility matrix](docs/COMPATIBILITY.md), or run **`npx minder doctor`** in your project — it
checks your installed versions and tells you exactly what (if anything) to update.

## The Golden Path

Minder meets you where you are. Start at Level 0 and adopt the next level only when you
actually need it — nothing below requires anything above it.

### Level 0 — zero config

```tsx
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
| Clerk | auth |
| Firebase | auth, database, storage |
| Razorpay | payments |
| Sentry | analytics |
| Stripe | payments |
| Supabase | auth, database, storage |

All six are **Certified** (10-point checklist, mock-mode example, CI-tested) and ship
for React, Next.js, and Vite on web, Node, and edge runtimes. Full detail:
[**Provider Catalog**](./docs/providers/CATALOG.md). Building on your own backend
instead? See [**Building a custom provider**](./docs/providers/CUSTOM.md).

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

## Platform Support

| Environment | Status |
| --- | --- |
| React 19 (web) | Confirmed |
| Next.js (Pages Router) | Experimental |
| Next.js (App Router / RSC) | Unknown |
| Vite + React | Inferred-works |
| React 18 | Unknown |
| React Native / Expo | Experimental |
| Electron | Experimental |
| Node (server) | Experimental |
| Edge runtimes (Workers, Vercel Edge) | Unknown |
| Remix, Astro | Planned |

**Confirmed** = runnable example app + CI tests. **Experimental** = built and working,
without that evidence bar yet. **Unknown** = no evidence either way. **Inferred-works**
= should work on general principle, unverified. **Planned** = roadmap only, no code.
Per-capability detail (auth, WebSocket, offline, uploads, …):
[**Support Matrix**](./docs/product/SUPPORT_MATRIX.md).

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

See the [Migration Guide](./docs/MIGRATION_GUIDE.md) for the full 2.2.0-beta.1 change
list with before/after code for every behavior change.

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
