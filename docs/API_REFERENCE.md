# API Reference

Complete API documentation for Minder Data Provider v2.1.

## Table of Contents

- [Core Modules](#core-modules)
  - [configureMinder](#configureminder)
  - [MinderDataProvider](#minderdataprovider)
- [Hooks](#hooks)
  - [useMinder](#useminder)
  - [useAuth](#useauth)
  - [useCache](#usecache)
  - [useWebSocket](#usewebsocket)
  - [useMediaUpload](#usemediaupload)
- [Subpath Exports](#subpath-exports)
  - [minder-data-provider/hook](#minder-data-providerhook)
  - [minder-data-provider/logger](#minder-data-providerlogger)
- [Utilities](#utilities)

---

## Core Modules

### configureMinder

The primary function to create a configuration object.

```typescript
import { configureMinder } from "minder-data-provider/config";

const config = configureMinder(options: UnifiedMinderConfig);
```

**Options:**
See [Configuration Guide](./CONFIG_GUIDE.md) for full options.

### MinderDataProvider

The main provider component that wraps your application.

```typescript
import { MinderDataProvider } from "minder-data-provider";

<MinderDataProvider config={config}>{children}</MinderDataProvider>;
```

---

## Hooks

### useMinder

The all-in-one hook for fetching and mutating data. Replaces legacy `useOneTouchCrud`.

```typescript
import { useMinder } from "minder-data-provider";

const { data, loading, error, operations } = useMinder<T>(route, options);
```

**Parameters:**

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `route` | `string` | Yes | API route name (matches config) or path |
| `options.autoFetch` | `boolean` | No | Fetch on mount (default: true) |
| `options.params` | `object` | No | URL/Query params |

**Returns:**

```typescript
{
  data: T[] | null;             // Data from API
  loading: boolean;             // Loading state
  error: Error | null;          // Error state
  operations: {
    create: (data: Partial<T>) => Promise<T>;
    update: (id: string, data: Partial<T>) => Promise<T>;
    delete: (id: string) => Promise<void>;
    fetch: () => Promise<T[]>;
    refresh: () => void;
  };
}
```

### useAuth

Hook for authentication management.

```typescript
import { useAuth } from "minder-data-provider/auth";

const { isAuthenticated, login, logout, user } = useAuth();
```

### useCache

Direct access to the cache manager.

```typescript
import { useCache } from "minder-data-provider/cache";

const { get, set, invalidate, clear } = useCache();
```

### useWebSocket

Hook for WebSocket connections.

```typescript
import { useWebSocket } from "minder-data-provider/websocket";

const { connected, send, subscribe } = useWebSocket();
```

### useMediaUpload

Hook for file uploads with progress.

```typescript
import { useMediaUpload } from "minder-data-provider/upload";

const { uploadFile, progress, isUploading } = useMediaUpload(routeName);
```

---

## Subpath Exports

### minder-data-provider/hook

A lightweight entry point (~25KB) that exports *only* `useMinder`.
**Note:** This MUST be used within a `MinderDataProvider` context.

```typescript
import { useMinder } from "minder-data-provider/hook";
```

### minder-data-provider/logger

Access to the internal logger instance.

```typescript
import { defaultLogger } from "minder-data-provider/logger";

defaultLogger.info("Category", "Message");
```

---

## Utilities

### Performance
- `useDebounce(value, delay)`
- `useThrottle(value, limit)`
- `usePerformanceMonitor()`

### Security
- `RateLimiter` class
- `XSSSanitizer` class


## v2.2 — New & Updated API

This release adds two new package subpath entry points, opt-in request fields, new
`useMinder` options, a full plugin system, and a server-only secret-key toolkit.

### New entry points

Two narrowed subpaths ship alongside the existing exports (`/web`, `/nextjs`,
`/native`, `/expo`, `/electron`, `/node`, `/crud`, `/auth`, `/cache`, `/websocket`,
`/upload`, `/debug`, `/config`, `/ssr`, `/logger`, `/hook`).

#### `minder-data-provider/core`

Minimal surface for smaller bundles.

| Export | Kind |
| --- | --- |
| `minder` | function |
| `useMinder` | React hook |
| `configureMinder` | function |
| `MinderDataProvider` | component |
| `useMinderContext` | React hook |
| `MinderError` | error class |
| `MinderConfigError` | error class |
| `MinderNetworkError` | error class |
| `MinderValidationError` | error class |
| `MinderAuthError` | error class |
| `MinderTimeoutError` | error class |
| `isMinderError` | type guard |
| `getErrorMessage` | function |
| `getErrorCode` | function |
| core types | type exports |

#### `minder-data-provider/server`

**Server-only.** Throws if imported in a browser.

| Export | Kind |
| --- | --- |
| `resolveSecret` | function |
| `secret` | function |
| `env` | function |
| `SecretRef` | class |
| `isSecretRef` | type guard |
| `redactSecrets` | function |
| `findExposedSecrets` | function |

### New `MinderOptions` fields

```ts
transport?: 'auto' | 'axios' | 'fetch'   // default: 'axios'
throwOnError?: boolean                    // default: false
schema?: StandardSchemaV1<any, any>       // default: undefined (no validation)
```

- `transport` — selects the request engine. `'fetch'` opts into a faster native-fetch
  fast-path for simple requests; it does **not** handle `axiosConfig` or credentials, so
  use it only for plain requests.
- `throwOnError` — when `true`, `minder()` **throws** the `MinderError` instead of
  returning it inside the structured `MinderResult`. Defaults to `false` (never throws).
- `schema` — see [Response validation (Standard Schema)](#response-validation-standard-schema) below.

### Response validation (Standard Schema)

`ApiRoute.schema` (route-def) and `MinderOptions.schema` (per-call, overrides the
route-def) accept any [Standard Schema](https://standardschema.dev) validator — Zod
≥3.24, Valibot, ArkType, Effect Schema, or a hand-written object implementing the
`~standard` interface. Zero runtime dependency: `StandardSchemaV1` is a vendored,
type-only interface (`minder-data-provider/core` and the main entry both export it).

```ts
import { minder } from "minder-data-provider";
import type { StandardSchemaV1 } from "minder-data-provider/core";

const { data, error } = await minder("users/1", undefined, { schema: userSchema });
// data: InferOutput<typeof userSchema> | null
```

Validates the raw response body (before any `model` decode) and, on success, replaces
`data` with the validator's output — honoring transforms. On failure, `minder()`
returns `{ success: false, error }` with `error.code === 'RESPONSE_VALIDATION_FAILED'`,
`error.status` set to the real HTTP status (often `200` — the request succeeded, the
payload didn't), and `error.issues: readonly { message: string; path?: (PropertyKey |
{ key: PropertyKey })[] }[]` populated. Distinct from the existing input `validate`
option (client-side, pre-flight over OUTGOING mutation data — see the README's
[Response Validation](../README.md#response-validation-standard-schema) section for the
full contrast). A validator that itself throws is treated as a failure, never a pass
(fail-closed). Does not count toward `retries` (deterministic, not transient) and does
not affect `retries`/short-circuit plugin logic.

### New `useMinder` options

```ts
throwOnError?: boolean   // default: false
rawUrl?: boolean         // default: false
```

- `throwOnError` — surfaces errors via `try`/`catch`, TanStack Query error states, and
  React error boundaries instead of the returned `error` field. Defaults to `false`.
- `rawUrl` — treats `route` as an arbitrary URL and bypasses the route registry.
- Absolute `http(s)` URLs bypass the route registry automatically (no `rawUrl` needed).
- The `auth`, `cache`, `websocket`, and `upload` sub-objects returned by `useMinder` now
  have **stable identity** across re-renders (memoized) — they are safe to use in
  dependency arrays.

### Plugins

The integration system. Register per-instance via `config.plugins = [plugin, ...]` or
globally via `registerPlugins(plugin, ...)`. Hooks fire on **every** request — both
through `<MinderDataProvider>` and standalone `minder()`. Each plugin runs in its own
`try`/`catch`: a failing hook logs a warning and never breaks the request.

#### Exports

```ts
pluginManager                          // singleton
createPlugin(p: MinderPlugin): MinderPlugin
registerPlugins(...plugins: MinderPlugin[]): void
```

Built-ins:

```ts
createLoggerPlugin(/* options */)        LoggerPlugin
AnalyticsPlugin
RetryPlugin
CacheWarmupPlugin
createPerformanceMonitorPlugin(/* options */)   PerformanceMonitorPlugin
```

#### `MinderPlugin`

Every hook is optional except `name`.

```ts
interface MinderPlugin {
  name: string;                                    // required
  version?: string;
  manifest?: PluginManifest;

  onInit?(ctx): void | Promise<void>;
  onRequest?(req: PluginRequest): void | Promise<void>;
  onResponse?(res: PluginResponse): void | Promise<void>;
  onError?(err: PluginError): void | Promise<void>;
  onCacheHit?(e): void | Promise<void>;                     // fired by minder()'s opt-in {cache:true} response cache (hit on fresh)
  onCacheMiss?(key: string): void | Promise<void>;          // fired by minder()'s opt-in {cache:true} response cache (miss on first/expired call)
  onDestroy?(): void | Promise<void>;

  provideToken?(): string | null | Promise<string | null>;   // supplies auth token when the auth manager has none (Firebase/Auth0/Clerk)
  onAuthRefresh?(tokens): void | Promise<void>;              // fired on token rotation

  onUpload?(event: UploadLifecycleEvent): void | Promise<void>;   // fired by both useMinder/useMediaUpload path and MediaUploadManager; terminal phase 'success'
  onSync?(event: SyncLifecycleEvent): void | Promise<void>;       // fired by the unified OfflineManager, including automatically-queued failed requests
  onConnectivityChange?(online: boolean): void | Promise<void>;   // fired by the unified OfflineManager on connectivity changes
}
```

#### `PluginManifest`

```ts
interface PluginManifest {
  name: string;
  version?: string;
  capabilities?: MinderCapability[];
  runtime?: 'client' | 'server' | 'isomorphic';
  peerDependencies?: string[];
}
```

#### `MinderCapability`

```ts
type MinderCapability =
  | 'crash-reporting'
  | 'analytics'
  | 'payments'
  | 'auth-provider'
  | 'storage'
  | 'upload'
  | 'transport';
```

#### Event payloads

```ts
interface PluginRequest  { method: string; url: string; headers?: Record<string, string>; body?: unknown; timestamp: number; }
interface PluginResponse { status: number; data: unknown; headers?: Record<string, string>; duration: number; timestamp: number; }
interface PluginError    { message: string; code?: string; stack?: string; request?: PluginRequest; timestamp: number; }
interface UploadLifecycleEvent { phase: 'start' | 'progress' | 'complete' | 'error'; uploadId: string; url?: string; file?: unknown; progress?: number; error?: unknown; timestamp: number; }
interface SyncLifecycleEvent   { phase: string; pending?: number; processed?: number; error?: unknown; timestamp: number; }
```

#### Example

```ts
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: { /* ... */ },
  plugins: [
    { name: 'firebase-auth', provideToken: () => auth.currentUser?.getIdToken() ?? null },
    { name: 'sentry', onError: (e) => Sentry.captureException(new Error(e.message), { extra: e }) },
    { name: 'analytics', onResponse: (r) => track('api', { url: r.url, ms: r.duration }) },
  ],
});
```

### Secret-key safety

Helpers for keeping real secrets out of client bundles. `secret`, `env`, `SecretRef`,
`isSecretRef`, `redactSecrets`, `findExposedSecrets`, and `assertNoExposedSecrets` are
available from the main surface; `resolveSecret` is **server-only**
(`minder-data-provider/server`).

```ts
secret(name: string, value?: string): SecretRef
// On the server resolves from process.env[name] (or explicit value);
// on the client carries no value (name marker only).

env(name: string, fallback?: string): string   // fallback defaults to ''
// Plain string for NON-secret values (publishable keys, base URLs). Safe to inline.

class SecretRef {
  hasValue(): boolean;
  reveal(): string;        // server only; throws if no value
  toString(): string;      // '[SECRET:NAME]'
  toJSON(): string;        // '[SECRET:NAME]'
}

isSecretRef(x: unknown): x is SecretRef

redactSecrets(obj: unknown): unknown
// Masks SecretRefs and secret-shaped strings for safe logging.

findExposedSecrets(config: unknown): { path: string; reason: string }[]

assertNoExposedSecrets(config: unknown): void
// Throws in the browser (MinderConfigError, code 'CONFIG_EXPOSED_SECRET')
// if a raw secret-shaped value is found. Called automatically by configureMinder.

// from 'minder-data-provider/server' — SERVER-ONLY
resolveSecret(ref: SecretRef | string): string
// Returns the value; throws in the browser or if missing.
```

> **Rule:** publishable keys (Stripe `pk_`, Sentry DSN) and base URLs → `env()`; real
> secrets → `secret()` plus a server route / `resolveSecret`. Never put a raw secret in
> client config — `configureMinder` throws (`MinderConfigError`,
> `'CONFIG_EXPOSED_SECRET'`) in the browser.

### CLI: `minder generate` — OpenAPI codegen for typed routes

```
minder generate --from <openapi.json> [--out minder.routes.ts] [--base-path-strategy strip|keep]
```

Reads an OpenAPI 3.x JSON document (3.0 and 3.1 — **YAML is not supported**; convert to
JSON first) and emits a single `.ts` module wired for
[`createTypedMinder`](#typed-routes-optional):

- `export const routes = { ... } as const satisfies Record<string, ApiRoute>` — one entry
  per operation, `url`/`method` derived from the spec.
- One `export interface`/`export type` per `components.schemas` entry, plus a synthesized
  named type for any inline (non-`$ref`) request-body or response schema.
- `export interface RouteTypes { [routeName]: { body?: ...; response?: ... } }` for
  consumers who want the request/response shapes without going through
  `createTypedMinder`.

**Route naming.** `operationId` is used (sanitized to a valid TS identifier) when
present; otherwise a name is derived as `<method><PascalCasePath>` — e.g. `GET /pets` →
`getPets`, `GET /pets/{petId}` → `getPetsByPetId` (each `{param}` segment becomes
`By<PascalCaseParam>`). Colliding names are deduped deterministically with a numeric
suffix (`_2`, `_3`, ...), in the order operations appear in the spec.

**Path parameters.** OpenAPI's `{param}` becomes minder's own `:param` URL-template
convention — the same one `ApiClient` interpolates at request time (see
`src/core/ApiClient.ts`) — not the `{param}` braces themselves.

**JSON Schema subset.** Supported: `object` (`properties`/`required`), `array`, `string`
/`number`/`integer`/`boolean`, `enum` (string or number members), `oneOf` (emitted as a
TS union), and `$ref` resolved against this document's own `components.schemas`.
Anything else — `allOf`/`anyOf`, a `$ref` outside `components.schemas`, a schema with no
usable `type`/`properties` — lowers to `unknown` with an explanatory comment rather than
a wrong guess. Runtime validators (`ApiRoute.schema`, see
[Response validation](#response-validation-standard-schema) above) are **not** emitted —
codegen only produces compile-time types.

**`--base-path-strategy`** (default `strip`): `strip` ignores the spec's `servers[0].url`
entirely — every route is the raw OpenAPI path. `keep` prepends the *path portion* of
`servers[0].url` (e.g. `"https://api.example.com/v1"` → `/v1`) to every route — use this
when the spec's server URL carries a prefix your app's own `apiBaseUrl` does not already
include.

**Determinism.** Regenerating from an unchanged spec produces byte-identical output (no
wall-clock timestamp is embedded in the file header) — safe to commit and diff.

```ts
import { createTypedMinder } from 'minder-data-provider';
import { routes } from './minder.routes'; // generated

const api = createTypedMinder(routes);
const { data } = api.useMinder('listPets'); // typed from RouteTypes/components.schemas
```
