# Features & Capabilities (v2.2)

The single authoritative reference of everything **minder-data-provider** can do as of
`2.2.0-beta.0`. The library is a data provider for React / Next.js / React Native / Electron
built over **TanStack Query** + **Redux Toolkit** + **axios**, with first-class auth, caching,
real-time, offline, file upload, a plugin/integration system, and secret-key safety.

---

## Capabilities Matrix

| Area | What you get | Entry point |
| --- | --- | --- |
| Core request fn | `minder()` — structured result, never throws by default, SSE stream | `minder-data-provider/core` |
| React hook | `useMinder()` — data, mutations, CRUD, auth/cache/ws/upload sub-objects | `core` / `/hook` |
| Configuration | `configureMinder()` — routes, auth, cache, ws, plugins, environments | `core` / `/config` |
| Auth | token lifecycle + `provideToken()` plugins (Firebase/Auth0/Clerk) | `/auth` |
| Caching | TanStack-backed query cache, TTL, invalidation, hydration | `/cache` |
| Real-time | WebSocket subscriptions + SSE stream | `/websocket` |
| Offline | offline manager, IndexedDB→localStorage fallback, sync events | `/config`, plugins |
| File upload | media upload manager + progress + upload lifecycle plugin hook | `/upload` |
| CRUD | `operations.create/read/update/delete` on the hook | `/crud` |
| Plugins | request/response/error/auth/upload/sync hooks, isolation guarantee | full surface |
| Secret safety | `secret()` / `env()` / `SecretRef` + client-throws guard | `minder-data-provider/server` |

---

## Entry Points

The package ships several subpath exports so you can import only what you need.

| Subpath | Contents |
| --- | --- |
| `minder-data-provider` | Full surface — everything below. |
| `minder-data-provider/core` | **NEW.** Minimal: `minder`, `useMinder`, `configureMinder`, `MinderDataProvider`, `useMinderContext`, the error classes (`MinderError`, `MinderConfigError`, `MinderNetworkError`, `MinderValidationError`, `MinderAuthError`, `MinderTimeoutError`), helpers (`isMinderError`, `getErrorMessage`, `getErrorCode`), and core types. Use for smaller bundles. |
| `minder-data-provider/server` | **NEW. SERVER-ONLY.** `resolveSecret`, `secret`, `env`, `SecretRef`, `isSecretRef`, `redactSecrets`, `findExposedSecrets`. Throws if imported into a browser. |
| `minder-data-provider/web` | Web bindings. |
| `minder-data-provider/nextjs` | Next.js bindings. |
| `minder-data-provider/native` | React Native bindings. |
| `minder-data-provider/expo` | Expo bindings. |
| `minder-data-provider/electron` | Electron bindings. |
| `minder-data-provider/node` | Node bindings. |
| `minder-data-provider/crud` | CRUD helpers. |
| `minder-data-provider/auth` | Auth manager surface. |
| `minder-data-provider/cache` | Cache surface. |
| `minder-data-provider/websocket` | WebSocket surface. |
| `minder-data-provider/upload` | Upload surface. |
| `minder-data-provider/debug` | Debug utilities. |
| `minder-data-provider/config` | Config surface. |
| `minder-data-provider/ssr` | SSR helpers (`getDehydratedState`, etc.). |
| `minder-data-provider/logger` | Logger surface. |
| `minder-data-provider/hook` | Re-exports the canonical `useMinder`. |

```ts
// Small bundle: just the essentials
import { minder, useMinder, configureMinder, isMinderError } from 'minder-data-provider/core';

// Server-only secret resolution (throws in the browser)
import { resolveSecret, secret, env } from 'minder-data-provider/server';
```

---

## Core Function: `minder()`

```ts
minder(route, data?, options?): Promise<MinderResult<T>>
```

- The **2nd argument is the request BODY**; the **3rd argument is options**.
- For a GET with options, pass `undefined` as the body: `minder('users', undefined, { params })`.
- By **default it never throws** — it returns a structured `MinderResult`.

### Result model

```ts
type MinderResult<T> = {
  data: T | null;
  error: MinderError | null;
  status: number;
  success: boolean;
  headers?: Record<string, string>;
  metadata?: { method: string; url: string; duration: number; cached: boolean };
};
```

```ts
const { data, error, success, status } = await minder('users');
if (success) {
  console.log(data); // typed T
} else {
  console.error(error?.message, status);
}
```

### Options

```ts
type MinderOptions = {
  method?: string;
  model?: unknown;
  onProgress?: (e: ProgressEvent) => void;
  headers?: Record<string, string>;
  axiosConfig?: object;
  params?: Record<string, unknown>;
  timeout?: number;
  cache?: boolean;
  cacheTTL?: number;
  realtime?: boolean;
  optimistic?: boolean;
  retries?: number;
  baseURL?: string;
  token?: string;
  onSuccess?: (data: unknown) => void;
  onError?: (err: MinderError) => void;
  transport?: 'auto' | 'axios' | 'fetch'; // default 'axios'
  throwOnError?: boolean;                  // default false
};
```

### Transport

`transport` defaults to `'axios'`. Opt into `'fetch'` for a faster native-fetch fast-path on
**simple** requests — it does **not** handle `axiosConfig` or credentials, so it is **opt-in only**.

```ts
// Fast native fetch path for a simple GET
const res = await minder('health', undefined, { transport: 'fetch' });
```

### `throwOnError`

Set `throwOnError: true` to make `minder()` **throw** the `MinderError` instead of returning it in
the result — convenient with `try/catch`.

```ts
try {
  const { data } = await minder('users', { name: 'Ada' }, { method: 'POST', throwOnError: true });
} catch (err) {
  if (isMinderError(err)) console.error(err.code, err.message);
}
```

### Per-call config and streaming

```ts
minder.config(config);                 // attach config to the standalone client
minder.stream(url, options);           // Server-Sent Events stream
```

```ts
const stream = minder.stream('/events', {
  onMessage: (msg) => console.log(msg),
  onError: (err) => console.error(err),
});
```

---

## React Hook: `useMinder()`

```ts
useMinder(route, options?)
```

Works **with OR without** `<MinderDataProvider>`. In standalone (no-provider) mode it uses the
global config set via `configureMinder` / `setGlobalMinderConfig`.

### Return shape

```ts
const {
  data, items,
  loading, error, success,
  refetch, mutate,
  operations,        // { create, read, update, delete }
  invalidate, cancel,
  auth, cache, websocket, upload, // stable identity (memoized) — safe in deps
  isFetching, isStale, isMutating, isCancelled,
  query, mutation,
  // ...infinite-query fields when options.infinite is set
} = useMinder('users');
```

```tsx
function Users() {
  const { items, loading, error, refetch } = useMinder('users');
  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} onRetry={refetch} />;
  return <ul>{items.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

### Stable sub-objects

`auth`, `cache`, `websocket`, and `upload` now have **stable identity across re-renders**
(memoized), so they are safe to list in effect/callback dependency arrays without triggering
re-render cascades.

```tsx
const { auth } = useMinder('me');
useEffect(() => {
  auth.refresh();
}, [auth]); // stable — won't loop
```

### Escape hatches: `throwOnError` and `rawUrl`

- `throwOnError?: boolean` (default `false`) — surface errors via `try/catch`, TanStack error
  states, and React error boundaries.
- `rawUrl?: boolean` — treat `route` as an arbitrary URL and bypass the route registry. Absolute
  `http(s)` URLs bypass the registry **automatically**.

```tsx
// Hit a third-party / absolute URL, bypassing the route registry
const { data } = useMinder('https://api.github.com/repos/foo/bar', { rawUrl: true });

// Let TanStack/error boundaries handle failures
const { data } = useMinder('users', { throwOnError: true });
```

### Infinite queries / pagination

```tsx
const {
  items, fetchNextPage, hasNextPage, isFetchingNextPage,
} = useMinder('feed', {
  infinite: true,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});
```

### Validation

`validate` accepts a **zod / yup / custom** validator and runs against the response payload.

```ts
import { z } from 'zod';
const User = z.object({ id: z.string(), name: z.string() });

const { data } = useMinder('me', { validate: User });
```

### Other options

`autoFetch`, `refetchOnWindowFocus`, `refetchOnReconnect`, `refetchInterval`, `enabled`,
`queryKey`, `queryOptions`, `staleTime`, `gcTime`.

---

## Configuration: `configureMinder()`

```ts
configureMinder({
  apiUrl, // or apiBaseUrl
  routes,
  auth,
  cache,
  corsHelper,   // 'cors' is deprecated
  websocket,
  redux,
  performance,
  debug,
  security,
  analytics,
  telemetry,
  ssr,
  offline,
  plugins,
  environments,
});
```

```ts
import { configureMinder } from 'minder-data-provider/core';
import { env } from 'minder-data-provider/server';

configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: {
    users: '/api/users',
    me: '/api/me',
  },
  cache: { ttl: 60_000 },
});
```

> **Security:** `configureMinder` calls `assertNoExposedSecrets(config)`. In the **browser** it
> **throws** `MinderConfigError` (code `CONFIG_EXPOSED_SECRET`) if a raw secret-shaped value is
> found anywhere in the config. See [Secret-Key Safety](#secret-key-safety).

---

## Auth

The auth manager owns the token lifecycle (attach, refresh, clear). Tokens can be supplied per
request (`options.token`), through configuration, or — most powerfully — by **plugins**.

### `provideToken()` plugins (Firebase / Auth0 / Clerk)

When the auth manager has **no token**, it asks plugins via `provideToken()`. This is the clean way
to bridge an external auth SDK.

```ts
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: { /* ... */ },
  plugins: [
    {
      name: 'firebase-auth',
      provideToken: () => auth.currentUser?.getIdToken() ?? null,
    },
  ],
});
```

`onAuthRefresh(tokens)` fires on token rotation, so plugins can react to refreshes.

The hook also exposes an `auth` sub-object (stable identity) for in-component auth actions:

```tsx
const { auth } = useMinder('me');
await auth.refresh();
```

---

## Caching

Caching is backed by TanStack Query (the cache layer imports from `@tanstack/query-core`).

- Per-request: `cache: true`, `cacheTTL` on `minder()`.
- Config-level cache options via `configureMinder({ cache })`.
- Result metadata reports `cached: boolean`.
- The hook exposes `invalidate`, `cancel`, `isStale`, and a `cache` sub-object (stable identity).
- Plugins observe cache activity via `onCacheHit(e)` / `onCacheMiss(key)`.

```ts
// Cache a GET for 30s
const res = await minder('users', undefined, { cache: true, cacheTTL: 30_000 });
console.log(res.metadata?.cached);
```

```tsx
const { invalidate, isStale } = useMinder('users');
await invalidate(); // drop and refetch
```

---

## Real-time: WebSocket & SSE

### WebSocket

Configure via `configureMinder({ websocket })`, then use the hook's `websocket` sub-object (stable
identity), or set `realtime: true` per request.

```tsx
const { data, websocket } = useMinder('messages', { realtime: true });
websocket.subscribe?.('messages');
```

### Server-Sent Events

```ts
const stream = minder.stream('/events', {
  onMessage: (msg) => console.log(msg),
  onError: (err) => console.error(err),
});
```

> Reliability: `StreamClient` routes async errors to `onError` (they no longer escape unhandled).

---

## Offline

- An offline manager queues work and syncs when connectivity returns.
- **IndexedDB storage falls back to localStorage** when IndexedDB is unavailable.
- The offline manager **removes its window listeners on destroy** (no leaks).
- Plugins observe offline behavior through `onConnectivityChange(online)` and `onSync(event)`.

```ts
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: { /* ... */ },
  offline: { enabled: true },
  plugins: [
    {
      name: 'offline-logger',
      onConnectivityChange: (online) => console.log('online:', online),
      onSync: (e) => console.log('sync', e.phase, e.processed),
    },
  ],
});
```

`SyncLifecycleEvent`: `{ phase, pending?, processed?, error?, timestamp }`.

---

## File Upload

The media upload manager handles file uploads with progress. Use the hook's `upload` sub-object
(stable identity) or `onProgress` on a request.

```tsx
const { upload } = useMinder('avatar');

async function onPick(file: File) {
  await upload.start?.(file, { onProgress: (p) => setProgress(p) });
}
```

Plugins observe the media pipeline via `onUpload(event)`:

```ts
{
  name: 'upload-tracker',
  onUpload: (e) => console.log(e.phase, e.uploadId, e.progress),
}
```

`UploadLifecycleEvent`: `{ phase: 'start' | 'progress' | 'complete' | 'error', uploadId, url?, file?, progress?, error?, timestamp }`.

---

## CRUD Operations

The hook's `operations` object provides `create`, `read`, `update`, and `delete` against the route.

```tsx
const { operations, items } = useMinder('users');

await operations.create({ name: 'Ada' });
await operations.read(userId);
await operations.update(userId, { name: 'Ada L.' });
await operations.delete(userId);
```

Equivalent low-level calls with `minder()`:

```ts
await minder('users', { name: 'Ada' }, { method: 'POST' });
await minder('users/123', { name: 'Ada L.' }, { method: 'PUT' });
await minder('users/123', undefined, { method: 'DELETE' });
```

---

## Plugin System

Plugins are the integration system. Hooks fire on **every request** — both through the provider and
through standalone `minder()`.

### Isolation guarantee

Each plugin runs in **its own try/catch**: a failing plugin logs a warning and **never breaks a
request**.

### Registration

```ts
// Per-instance
configureMinder({ /* ... */, plugins: [pluginA, pluginB] });

// Global singleton
import { registerPlugins } from 'minder-data-provider';
registerPlugins(pluginA, pluginB);
```

### The `MinderPlugin` contract

Every hook is optional except `name`.

```ts
interface MinderPlugin {
  name: string;            // required
  version?: string;
  manifest?: PluginManifest;

  onInit?(ctx): void | Promise<void>;
  onRequest?(req: PluginRequest): void | Promise<void>;
  onResponse?(res: PluginResponse): void | Promise<void>;
  onError?(err: PluginError): void | Promise<void>;
  onCacheHit?(e): void;
  onCacheMiss?(key: string): void;
  onDestroy?(): void;

  provideToken?(): string | null | Promise<string | null>; // supplies a token when auth has none
  onAuthRefresh?(tokens): void;          // fired on token rotation
  onUpload?(event: UploadLifecycleEvent): void;             // media pipeline
  onSync?(event: SyncLifecycleEvent): void;                 // offline sync
  onConnectivityChange?(online: boolean): void;
}
```

### Manifest & capabilities

```ts
interface PluginManifest {
  name: string;
  version?: string;
  capabilities?: MinderCapability[];
  runtime?: 'client' | 'server' | 'isomorphic';
  peerDependencies?: string[];
}

type MinderCapability =
  | 'crash-reporting' | 'analytics' | 'payments'
  | 'auth-provider' | 'storage' | 'upload' | 'transport';
```

### Event payloads

```ts
PluginRequest  = { method, url, headers?, body?, timestamp };
PluginResponse = { status, data, headers?, duration, timestamp };
PluginError    = { message, code?, stack?, request?, timestamp };
```

### Exports

`pluginManager` (singleton), `createPlugin(p)`, `registerPlugins(...)`, and built-ins:
`createLoggerPlugin` / `LoggerPlugin`, `AnalyticsPlugin`, `RetryPlugin`, `CacheWarmupPlugin`,
`createPerformanceMonitorPlugin` / `PerformanceMonitorPlugin`.

### Example: Sentry + Stripe + Firebase

```ts
import { configureMinder } from 'minder-data-provider/core';
import { env } from 'minder-data-provider/server';

configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: { /* ... */ },
  plugins: [
    // Firebase: supply the bearer token when the auth manager has none
    { name: 'firebase-auth', provideToken: () => auth.currentUser?.getIdToken() ?? null },

    // Sentry: report errors (each plugin is isolated)
    { name: 'sentry', onError: (e) => Sentry.captureException(new Error(e.message), { extra: e }) },

    // Analytics / Stripe-style tracking: observe responses
    { name: 'analytics', onResponse: (r) => track('api', { url: r.url, ms: r.duration }) },
  ],
});
```

---

## Secret-Key Safety

Import the secret helpers from the **server-only** entry point:

```ts
import {
  resolveSecret, secret, env, SecretRef, isSecretRef,
  redactSecrets, findExposedSecrets,
} from 'minder-data-provider/server';
```

### `secret()` vs `env()`

- `secret(name, value?) => SecretRef` — on the **server** the value resolves from
  `process.env[name]` (or the explicit `value`); on the **client** it carries **no value**, only the
  name marker.
- `env(name, fallback = '') => string` — a plain string for **non-secret** values (publishable keys,
  base URLs). Safe to inline into client config.

### `SecretRef`

Non-stringifiable: `toString()` / `toJSON()` => `'[SECRET:NAME]'`, so the value never leaks into a
bundle, log, or JSON.

```ts
const ref = secret('STRIPE_SECRET_KEY');
String(ref);        // '[SECRET:STRIPE_SECRET_KEY]'
JSON.stringify(ref); // '"[SECRET:STRIPE_SECRET_KEY]"'
ref.hasValue();      // true on server, false on client
ref.reveal();        // server only — throws if no value
```

### Resolving on the server

```ts
import { resolveSecret } from 'minder-data-provider/server';
// SERVER-ONLY: returns the value, throws in the browser / if missing
const key = resolveSecret('STRIPE_SECRET_KEY');
```

### The client-throws guard

`configureMinder` calls `assertNoExposedSecrets(config)`. In the **browser** it **throws**
`MinderConfigError` (code `CONFIG_EXPOSED_SECRET`) when a raw secret-shaped value appears in config.

The detector flags: Stripe `sk_live` / `sk_test` & `rk_`, AWS `AKIA`, PEM private keys, GitHub
(`ghp_` / `github_pat_`), Slack (`xox*`), SendGrid (`SG.*`), and any string ≥8 chars under a key like
`secret` / `password` / `privateKey` / `clientSecret` / `apiSecret`. `SecretRef` values are **never**
flagged.

### Logging & auditing helpers

```ts
redactSecrets(obj);        // mask SecretRefs + secret-shaped strings for logging
isSecretRef(x);            // boolean
findExposedSecrets(config); // => { path, reason }[]
```

### The rule

> **Publishable keys** (Stripe `pk_`, Sentry DSN) and **base URLs** ⇒ `env()`.
> **Real secrets** ⇒ `secret()` + a server route / `resolveSecret`.
> Never put a raw secret in client config — it throws.

```ts
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),                 // base URL — safe to inline
  stripePublishableKey: env('NEXT_PUBLIC_STRIPE_PK'), // pk_ — safe
  // stripeSecretKey: 'sk_live_...'  // THROWS in the browser
});
```

---

## Reliability & Performance (this release)

### Reliability

- **JWT parsing never crashes** — consolidated into one shared, tested parser.
- **`ApiClient.destroy()`** clears analytics/telemetry timers (called on provider unmount).
- **Offline manager** removes its window listeners on destroy.
- **IndexedDB storage falls back to localStorage** when IndexedDB is unavailable.
- **`StreamClient`** routes async errors to `onError`.
- **CI lint is blocking.**

### Performance / DX

- **`useMinder` method objects are memoized** — no re-render cascades; `auth` / `cache` /
  `websocket` / `upload` have stable identity.
- **`/core` minimal entry** for smaller bundles.
- **Opt-in `transport: 'fetch'`** fast-path for simple requests.

---

## Framework-Agnostic Direction (internal, in-progress)

Internal groundwork is underway toward non-React bindings:

- The cache layer now imports from `@tanstack/query-core`.
- An internal framework-agnostic observer primitive, **`MinderObserver`**
  (`subscribe` / `getSnapshot`), has been added.

These are **internal and not yet a public API**. There is **no Vue or Svelte support yet**.
