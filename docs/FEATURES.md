# Features & Capabilities (v2.2)

The single authoritative reference of everything **minder-data-provider** can do as of
`2.2.0`. The library is a data provider for React / Next.js / React Native / Electron
built over **TanStack Query** + **axios**, with first-class auth, caching,
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
| Offline | unified offline manager, auto-queue on real network failure + **manual** queue (`addToQueue`) + replay, opt-in persistence, sync events | `/config`, plugins |
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

> **`axiosConfig` is an allowlist, not "any axios config option."** When used inside a
> `<MinderDataProvider>` (i.e. `useMinder()`'s provider-mode path, dispatching through `ApiClient`),
> only `timeout`, `signal`, `responseType`, `onUploadProgress`, `onDownloadProgress`,
> `withCredentials`, `validateStatus`, `paramsSerializer`, and `decompress` are forwarded to the
> outgoing request. Keys that control the destination or transport — `url`, `baseURL`, `proxy`,
> `adapter`, `transformRequest`, `transformResponse`, `httpAgent`, `httpsAgent`, `socketPath`,
> `beforeRedirect` — throw a `MinderSecurityError` instead, so a route's own headers (or your
> bearer token) can never be redirected to an unintended host via a per-call option. See
> [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md#per-call-axios-options-are-now-an-allowlist).
>
> **The top-level `baseURL` above (standalone `minder()` only) is not a general-purpose
> host-switching escape hatch either.** It throws the same `MinderSecurityError` if the call
> would carry a registered route's own declared headers or an ambient bearer token
> (`configureMinder()`/`minder.config()`) to the overridden host. See
> [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md#minders-per-call-baseurl-now-refuses-to-redirect-credentials).

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
- `onCacheHit`/`onCacheMiss` plugin hooks are emitted from the standalone `minder()` opt-in
  response cache (MDPD-5): a `{ cache: true }` GET fires `onCacheMiss(key)` on the first/expired call
  and `onCacheHit({ key, value, age, timestamp })` on a fresh hit (which skips the transport).
  Requests without `cache: true` do not use this cache and emit neither hook; use
  `onRequest`/`onResponse` for request-level observation.

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

**Canonical public path.** Three WebSocket layers exist; the supported public surface is:

- **`WebSocketClient`** from `minder-data-provider/websocket` — a standalone client with
  connect/disconnect, event subscribe/dispatch, an offline send-queue, heartbeat, and
  auto-reconnect with exponential backoff (`reconnect` on by default; `heartbeat` in ms). Use it
  when you want a socket independent of a provider/route.
- **`useWebSocket()`** and **`useMinder().websocket`** — thin hooks that delegate to the provider's
  selected realtime transport (require `MinderDataProvider`). They route through the transport-neutral
  realtime manager, so the **same `connect()`/`disconnect()`/`subscribe()` surface drives either
  transport** — WebSocket by default, or the reconnecting SSE transport when `realtime: { transport:
  'sse' }` is configured (`send()` is a receive-only no-op under SSE). They add no lifecycle side
  effects of their own, so there is nothing to leak across mount/unmount; `subscribe(event, cb)`
  returns the manager's unsubscribe function for your own cleanup.

The core `WebSocketManager` (`src/core/WebSocketManager.ts`) is **internal plumbing** for
`MinderDataProvider` (platform-adapter selection, auth-token URL) — not a public API. All three
layers remain live; they are intentionally not consolidated (high-risk), only the public path above
is supported/tested.

### Server-Sent Events

```ts
const stream = minder.stream('/events', {
  onMessage: (msg) => console.log(msg),
  onError: (err) => console.error(err),
});
```

> Reliability: `StreamClient` routes async errors to `onError` (they no longer escape unhandled).

`minder.stream()` above is a **one-shot** primitive — no reconnect, no resume. For a long-lived,
managed subscription see the next section.

### Managed SSE transport (Spec 5.2)

An opt-in, **managed, auto-reconnecting** SSE transport, selectable alongside WebSocket behind the
same subscribe surface:

```ts
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: { /* ... */ },
  realtime: { transport: 'sse', url: env('NEXT_PUBLIC_SSE_URL') },
});
```

```tsx
const { realtimeManager } = useMinderContext();
useEffect(() => {
  realtimeManager?.connect();
  const unsub = realtimeManager?.subscribe('order.updated', (data) => console.log(data));
  return () => { unsub?.(); realtimeManager?.disconnect(); };
}, [realtimeManager]);
```

- **`realtime: boolean | RealtimeConfig`.** The legacy `realtime: true` boolean is unchanged
  (WebSocket, as before). The new object form additionally selects the transport:
  `{ transport: 'ws' | 'sse', url?, auth?, reconnect?, stallTimeoutMs?, lastEventIdHeader?,
  withCredentials? }`. **`transport` defaults to `'ws'`** — SSE is opt-in only. This top-level
  config field is a different concern from the per-hook `useMinder(route, { realtime: true })`
  option above (subscription intent for that hook call, unaffected).
- **`RealtimeTransport` surface** — `connect()`, `disconnect()`, `subscribe(event, cb)`,
  `isConnected()`, optional `send()` — is identical for both transports. `MinderDataProvider`
  exposes the selected one as `realtimeManager` in context (alongside the existing
  `websocketManager`, which stays populated only for the WS branch).
- **Header-based auth, never a URL token.** Built on `fetch` + `ReadableStream` (not native
  `EventSource`, which cannot set headers) specifically so the token goes in
  `Authorization: Bearer <token>`, re-read from your auth manager on every (re)connect.
- **Reconnect:** jittered exponential backoff (`reconnect.baseDelayMs`/`maxDelayMs`, default
  1s/30s, full jitter), honoring a server `Retry-After` header when present. Gives up after
  `reconnect.maxAttempts` (default 10; `0` = unlimited) and emits a terminal
  `subscribe('__closed', ({ reason, attempts }) => ...)` event.
- **Resume via `Last-Event-ID`:** the first connect sends none; a reconnect after a received
  `id:` line resends it so the server can replay missed events.
- **Stall detection:** no bytes (including comment keepalives) within `stallTimeoutMs` (default
  45s) aborts and reconnects.
- **Permanent vs. transient:** `401`/`403`/`404`/`204` stop for good (no further fetch, terminal
  `__closed`); `429`/`5xx`/network drops/stalls reconnect.
- **Resync convention:** a `'resync'` event triggers `offlineManager.sync()` +
  `queryClient.invalidateQueries()`; an `'invalidate'` event invalidates `{ keys }`. Both are
  server-side conventions your backend opts into, not hard contracts.
- **`send()` is a no-op** (with a `console.warn`) — SSE is receive-only. Use REST/mutations for
  client→server, or `transport: 'ws'` for bidirectional.
- **Bundle cost:** `minder-data-provider/realtime` is an independently-importable subpath;
  `SseTransport` is lazy-loaded (dynamic `import()`) inside `MinderDataProvider`, so apps that
  don't set `transport: 'sse'` pay zero bytes for it.
- **Platform support (honest, see SUPPORT_MATRIX.md):** **Experimental** on web, Node ≥20, and
  edge runtimes (all have `fetch` + `ReadableStream`). **Unknown** on React Native/Expo — RN's
  `fetch` does not implement a readable response body; the transport detects this and fails fast
  with a clear error rather than hanging silently. A `react-native-fetch-api`-style polyfill is
  the app's choice to add, not a dependency of this package.

---

## Offline

**Auto-queue on real network failure WORKS:** a mutation that fails with a genuine network error
(real dead port / `ECONNREFUSED` through a provider's `ApiClient`) auto-enqueues — `getOfflineManager().getQueueSize()`
goes 0→1 and the failed mutation replays on reconnect. Wire-verified against a real dead port by four test
cases in `tests/wire/offline-contract.mjs`: `c3-provider-mutate-dead-port-reports-failure-and-enqueues`,
`c3-queued-request-replays-on-sync-against-real-server`, `c3-no-offline-config-dead-port-stays-plain-network-error`
(control), and `c3-get-request-dead-port-is-not-auto-queued` (control — GETs are never queued by design).

- A single **unified** offline manager queues work and syncs when connectivity returns.
- Requests pushed via `getOfflineManager().addToQueue(...)` are replayed through the ApiClient's
  own axios instance on reconnect (so auth/CSRF/CORS/interceptors all still apply), and `onSync` /
  `onConnectivityChange` fire correctly for those items. **Mutations** (POST/PUT/PATCH/DELETE) that fail
  with a genuine network error are automatically enqueued; **GET/HEAD/OPTIONS** requests are re-issued
  instead, never queued, by design.
- **Persistence is opt-in.** Without a `storage` adapter (`offline: { storage }`) the queue is
  **in-memory only and is lost on reload/restart**. Provide a `StorageAdapter` to persist it.
- The offline manager **removes its window listeners on destroy** (no leaks); exactly one
  online/offline listener pair is registered per active manager.
- Plugins observe offline behavior through `onConnectivityChange(online)` and `onSync(event)`.
- `configureMinder({ offline: { enabled: true } })` instantiates and wires the OfflineManager
  (MDPD-6): it drives those hooks and is reachable via `getOfflineManager()` (exported from the
  package root and `minder-data-provider/config`). A standalone `new ApiClient(...)` with offline
  enabled reuses that wired instance when present, or creates+owns its own when there is none.
  Re-configuring destroys the prior manager first, so its window listeners are removed (no
  duplicate emissions).

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

### Conflict resolution (Spec 5.1)

A replay that comes back with a status in `conflictStatuses` (default `[409, 412]`) is now
resolved deterministically instead of blindly retrying and silently dropping the mutation after
`maxRetries`. Configure it on `offline`:

```ts
offline: {
  enabled: true,
  conflictResolution: 'server-wins',   // default — discard the queued mutation, accept the server
  // conflictResolution: 'last-write-wins' | 'client-wins',  // re-issue the client mutation as-is
  // conflictResolution: 'merge' | 'manual',                 // invoke resolveConflict below
  conflictStatuses: [409, 412],        // override to add e.g. a custom 428
  conflictResolveTimeoutMs: 15000,     // resolver is raced against this; timeout fails closed
  resolveConflict: async (ctx) => {
    // ctx: { request, clientBody, base?, server, status, signal }
    return { action: 'retry', body: { ...ctx.clientBody, ...ctx.server, version: undefined } };
    // or: { action: 'discard' }  (accept server, drop the mutation)
    // or: { action: 'keep' }     (leave queued for a later manual sync)
  },
},
```

- **Strategies:** `'server-wins'` (default, discard + accept server) · `'last-write-wins'` /
  `'client-wins'` (alias — re-issue the client mutation, client wins) · `'merge'` / `'manual'`
  (alias — invokes `resolveConflict`, or the deprecated `onConflict(request, serverData)` adapter
  if that's all that's configured). If both `resolveConflict` and `onConflict` are set,
  `resolveConflict` wins and `onConflict` is ignored (one-time warning).
- **Per-mutation override:** pass a strategy name (not a function — it must survive
  `JSON.stringify` for persistence) via `metadata.conflictResolution` on `addToQueue`; it beats the
  global `conflictResolution` for that request. A `base` snapshot for `resolveConflict`'s
  `ctx.base` can similarly be stashed at enqueue time as `metadata.conflictBase`.
- **Fail-closed:** if `resolveConflict` throws, returns a malformed result, or exceeds
  `conflictResolveTimeoutMs`, the request falls through to the normal retry→dead-letter path —
  never a silent discard or silent accept.
- **`strictOrder`** (default `false`): when `true`, replay goes fully sequential and a `'keep'`
  resolution or a replay failure halts the remainder of that sync pass — trades throughput for
  causal safety (mutation N+1 never applies against a base N was supposed to establish). Default
  keeps today's concurrent `syncBatchSize` batching.
- **`onDeadLetter?(request, lastError)`** (+ optional `deadLetterKey` storage key): opt-in
  observability for a request dropped at `maxRetries` — the existing silent-drop is unchanged by
  default.
- **Backward compat:** with no conflict config at all, the only observable change is that a
  409/412 replay now resolves via `server-wins` immediately instead of retrying 3× and then
  dropping — same end state (mutation gone), fewer wasted retries.
- SSE / server-push transport for proactively notifying clients of conflicts is a separate,
  not-yet-shipped deliverable (Spec 5.1 §5) — this section covers replay-time detection only.

---

## File Upload

The media upload manager handles file uploads with progress. Use the hook's `upload` sub-object
(stable identity) or `onProgress` on a request.

`useMediaUpload(route, { throttleMs })` throttles progress state commits (trailing-edge, default
100ms) so a burst of progress events no longer re-renders the consumer once per event (MDPD-4 /
perf audit A4); the terminal 100% value is always committed. `useMinder().upload` keeps progress in
a ref (its identity never changes across a progress stream).

```tsx
const { upload } = useMinder('avatar');

async function onPick(file: File) {
  await upload.start?.(file, { onProgress: (p) => setProgress(p) });
}
```

Plugins observe the media pipeline via `onUpload(event)` — fired both by the standalone
`MediaUploadManager` (`minder-data-provider/upload`) and by the `useMinder` / `useMediaUpload` hook
path (they route through `ApiClient.uploadFile`, MDPD-6). The hook path emits
`start` → `progress` (per tick) → `complete`, or `error` if the transport fails:

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
  onCacheHit?(e): void;                                     // fired by minder()'s opt-in `{ cache: true }` response cache (MDPD-5)
  onCacheMiss?(key: string): void;                          // fired by minder()'s opt-in `{ cache: true }` response cache (MDPD-5)
  onDestroy?(): void;

  provideToken?(): string | null | Promise<string | null>; // supplies a token when auth has none
  onAuthRefresh?(tokens): void;          // fired on token rotation
  onUpload?(event: UploadLifecycleEvent): void;             // fired by both useMinder/useMediaUpload path and MediaUploadManager; terminal phase 'success'
  onSync?(event: SyncLifecycleEvent): void;                 // fired by the unified OfflineManager, including automatically-queued failed requests
  onConnectivityChange?(online: boolean): void;             // fired by the unified OfflineManager on connectivity changes
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
