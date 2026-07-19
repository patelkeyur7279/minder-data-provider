# Migration Guide

This guide covers: **v2.x → v3.0** (the Redux removal, below), **2.2.0-beta.0 → 2.2.0-beta.1**,
and the older **v1.x → v2.0** guide (further down).

## v2.x → v3.0 — Redux integration removed (BREAKING)

**What changed:** MDP no longer ships any Redux integration. Redux was an optional peer used only
for auto-generated per-route slices that nothing on the core data path read. It has been removed
entirely — smaller bundle, one clear state model (TanStack Query for server state).

**Removed public API:**

| Removed | Replace with |
|---|---|
| `useStore()` hook | Use your app's own Redux store (`react-redux`'s `useStore`) if you still need Redux — MDP no longer provides one. |
| `useReduxSlice(route)` hook | Use `useMinder(route)` for data (it already exposes `data`/`loading`/`error`/`mutate`); manage any extra UI state in your own store. |
| `ReduxConfig` type + `configureMinder({ redux })` config field | Remove the `redux` field from your config — it is no longer read. |
| `MinderDataProvider`'s Redux `<Provider>` wrapper + `useMinderContext().store` | `MinderDataProvider` renders the `QueryClientProvider` tree directly; `ctx.store` is gone. If you need a Redux `<Provider>`, add your own around `MinderDataProvider`. |
| `DynamicLoader` redux members (`loadRedux`, `getStore`, `isReduxLoaded`, `addReducer`, the `'redux'` preload option, and the `redux` field in `getLoadingStatus()`/`getBundleSavings()`) | None — these lazy-loaded a store MDP no longer manages. |
| `@reduxjs/toolkit` / `react-redux` optional peer dependencies | No longer declared. If your app uses Redux independently, keep them as your own direct dependencies. |

**Migration steps:**
1. Remove any `redux` field from your `configureMinder(...)` / `MinderDataProvider` config.
2. Replace `useStore()` / `useReduxSlice()` calls — use `useMinder()` for data; use your own store for UI state.
3. If you relied on MDP creating a Redux store, wrap your app in your own `<Provider>` from `react-redux`.
4. No dependency changes are required unless you were relying on MDP to pull in Redux transitively (it never did — they were optional peers).

If you were **not** using the Redux hooks/config (the common case — they were read by nothing on the
main path), **no code changes are needed.**



## 2.2.0-beta.0 → 2.2.0-beta.1

Every default-changing or breaking behavior change in the 2.2.0-beta.1 release — see
[CHANGELOG.md](../CHANGELOG.md) for the complete, unabridged list. These are logged
there as behavior changes, not API removals: your code will very likely keep compiling
and running unmodified, but several **defaults** changed, so read this even if nothing
breaks at build time.

**In this section:**

- [1. Fail-closed `isAuthenticated()`](#1-fail-closed-isauthenticated)
- [2. CORS defaults](#2-cors-defaults)
- [3. No forced CORS preflight](#3-no-forced-cors-preflight)
- [4. Default retry changed](#4-default-retry-changed)
- [5. peerDependencies move](#5-peerdependencies-move)
- [6. `useAuth` root-entry shadowing](#6-useauth-root-entry-shadowing)
- [7. `rawUrl` and config unification](#7-rawurl-and-config-unification)

### 1. Fail-closed `isAuthenticated()`

**Old behavior:** a JWT-shaped token (three dot-separated segments) whose payload
couldn't be decoded, or whose `exp` claim was non-numeric, was treated as
**authenticated** (`isAuthenticated()` returned `true`). The no-provider fallback used
by standalone `useMinder()` (`GlobalAuthManager`) was even looser: it only checked
token *presence* — an **expired** JWT still counted as authenticated.

**New behavior:** both `AuthManager.isAuthenticated()` (provider mode) and
`GlobalAuthManager.isAuthenticated()` (standalone/no-provider mode) now fail closed —
a JWT-shaped token that can't be decoded, or whose `exp` has passed, returns `false`.
The two are now parity-tested against each other. Opaque (non-JWT) bearer tokens are
unchanged — still presence-based, since there's nothing to decode. Signature
verification was never performed client-side and still isn't; this only affects the
shape/expiry check.

**Why:** silently treating a corrupt or expired token as valid is a fail-open
authorization bug — it let invalid sessions look "logged in" to client-side route
guards.

**Migration:**

```typescript
// Before — a corrupt or expired JWT-shaped token still passed this check
if (auth.isAuthenticated()) {
  /* ... */
}

// After — if you intentionally store JWT-shaped-but-not-actually-JWT strings
// (three dot-separated segments that aren't valid JWTs) and want the old
// presence-only semantics, check for a token instead:
if (auth.getToken() !== null) {
  /* ... */
}
```

No action needed if your tokens are real JWTs or genuinely opaque strings — this is a
pure bug fix for the corrupt/expired case.

### 2. CORS defaults

**Old behavior:** the library's own CORS-emitting code — the default `corsMiddleware`
export and `ProxyManager.generateNextJSProxy()` (the Next.js proxy-route generator) —
defaulted to `origin: '*', credentials: true`. That combination is invalid per the CORS
spec (browsers reject it) and was already flagged by the library's own
`CorsManager.validateConfig()`.

**New behavior:** the default is now `origin: '*', credentials: false`.
`generateNextJSProxy()` emits `Access-Control-Allow-Credentials: false` unless
`cors.credentials` is explicitly `true` in the `ProxyConfig` you pass it — and now
**throws** rather than generate a proxy combining `credentials: true` with a wildcard
origin.

**Why:** `Access-Control-Allow-Credentials: true` next to a wildcard origin tells
browsers "any origin may send this browser's cookies here" — a real vulnerability if a
server ever ships that pairing.

**Migration:**

```typescript
import { ProxyManager } from "minder-data-provider";

// Before (implicit): credentials always on, wildcard origin
const proxy = new ProxyManager({ enabled: true, baseUrl: "https://api.example.com" });

// After: an explicit allowlist is required to keep credentials on
const proxy = new ProxyManager({
  enabled: true,
  baseUrl: "https://api.example.com",
  cors: { origin: ["https://app.example.com"], credentials: true },
});
proxy.generateNextJSProxy(); // throws if origin is '*' and credentials is true
```

> **`createCorsMiddleware`:** the CHANGELOG documents a new `createCorsMiddleware(options)`
> factory with this same safe-by-default behavior. As of this writing it lives at
> `src/core/corsMiddleware.ts` but is **not re-exported from any published entry point**
> (`minder-data-provider`, `/server`, `/core`, or any platform subpath) —
> `import { createCorsMiddleware } from "minder-data-provider"` will fail today. The
> `ProxyManager` snippet above is the reachable equivalent for Next.js proxy generation.

> **`configureMinder()` history note:** earlier 2.2.0-beta.1 development builds had a
> preset bug that undermined this change for `configureMinder()` users — the
> web-platform preset forced `credentials: true` onto any config that didn't set it, and
> the `corsHelper: true` boolean shorthand also defaulted credentials on. Both are fixed
> in the current build: `configureMinder()` now defaults credentials **off on every
> platform**, and only an explicit `corsHelper: { credentials: true }` from you turns
> them on (explicit user values always win over presets). Note that the `cors` config
> key is deprecated in favor of `corsHelper` — it logs a runtime deprecation warning and
> is slated for removal in v3.0, and its `configureMinder()` type only accepts
> `enabled`/`proxy` (no `credentials` field).

### 3. No forced CORS preflight

**Old behavior:** the default axios instance attached 7 response-type security headers
(CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
X-XSS-Protection, Referrer-Policy, Permissions-Policy) to every outgoing *request*, and
set `withCredentials: true` by default. Non-safelisted request headers plus credentialed
mode force the browser to run a CORS preflight `OPTIONS` round-trip before every
cross-origin call — roughly doubling latency.

**New behavior:** default request headers are exactly `Content-Type: application/json`
and `Accept: application/json` — nothing else. `withCredentials` defaults to `false`;
the client reads the resolved config's `cors.credentials === true` to enable it — via
`configureMinder()`, set `corsHelper: { credentials: true }` (this also now governs the
token-refresh call, which previously hardcoded credentials).

**Why:** this was a performance bug, not a security feature — the security-response
headers never belonged on a *request*, and most apps don't need cookies sent
cross-origin. The internal helper that builds those response headers
(`getSecurityHeaders()` in `src/utils/security.ts`) is unaffected — it's just no
longer applied to outgoing requests. Note it is an internal helper today, not exported
from any public entry point; set your own server response headers if you need them.

**Migration:**

```typescript
// If your API relies on cookies for auth, opt back in explicitly (pair with an
// explicit origin allowlist server-side — see item 2). Use `corsHelper`, not the
// deprecated `cors` key (see the note in item 2):
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { /* ... */ },
  corsHelper: { credentials: true },
});

// If you were relying on the old default request headers, use route- or call-level
// headers instead — they were never meant to be silent global defaults:
useMinder("users", { headers: { "X-Custom-Header": "value" } });
```

> Earlier 2.2.0-beta.1 development builds had a `configureMinder()` preset bug that
> re-enabled `credentials: true` on web by default, undoing this change; it is fixed in
> the current build — see the history note in item 2.

### 4. Default retry changed

**Old behavior:** failed queries retried 3 times by default
(`performance.retries: 3`). Explicitly passing `performance.retries: 0` or
`retryDelay: 0` to disable retries silently didn't work — the code used `||`-style
fallbacks (`retries || <default>`), and `||` treats `0` as falsy, reverting to the
default anyway.

**New behavior:** the default query retry is now 1
(`config.performance?.retries ?? 1` — `??`, not `||`). An explicit `0` is now honored
and genuinely disables retries.

**Why:** 3 retries meant a truly-down backend took ~3x longer to surface an error to the
user; 1 retry balances resilience against transient blips with a faster failure signal.
The `||` → `??` change is a correctness fix — `0` is a legitimate value that was being
silently discarded.

**Migration:**

```typescript
// Restore the old 3-retry behavior explicitly:
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { /* ... */ },
  performance: { retries: 3 },
});

// Explicit zero now works (previously silently reverted to the default):
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { /* ... */ },
  performance: { retries: 0 },
});
```

> `retryDelay` is not a `configureMinder()` option (its `performance` block accepts
> `deduplication`/`retries`/`timeout`/`compression`). The `retryDelay: 0` fix applies
> when you construct a `MinderConfig` for `<MinderDataProvider>` directly, where
> `performance.retryDelay` exists.

> **`configureMinder()` history note:** earlier 2.2.0-beta.1 development builds had a
> preset bug here too — every platform preset hardcoded `performance.retries: 3`, which
> pre-empted the new default for anyone configuring through `configureMinder()`. Fixed
> in the current build: `configureMinder()` presets now emit `retries: 1` on every
> platform, and an explicit user value (including `retries: 0`) still wins. Precision
> note on where the `?? 1` fallback lives: it is `MinderDataProvider`'s **query-layer**
> retry default (what TanStack Query uses when `performance.retries` is completely
> unset). `ApiClient`'s own interceptor-level exponential-backoff retry treats unset
> `performance.retries` as `0` — it adds no HTTP-layer retries unless you configure
> some.

### 5. peerDependencies move

**Old behavior:** `@tanstack/react-query`, `@tanstack/query-core`,
`@reduxjs/toolkit`, `react-redux`, and `@tanstack/react-query-devtools` were regular
`dependencies` — your package manager installed the library's own copies alongside
whatever version (if any) your app already had.

**New behavior:** all five moved to `peerDependencies` with caret ranges.
`@tanstack/react-query` and `@tanstack/query-core` are **required** peers;
`@reduxjs/toolkit`, `react-redux`, and `@tanstack/react-query-devtools` are **optional**
peers.

**Why:** a hard dependency on `@tanstack/react-query` could install a second copy
alongside your app's own, silently breaking `QueryClientProvider` context — React
context identity is per-module-instance, so two copies of react-query means two
incompatible `QueryClient` implementations sharing one tree. This also shrank the
packed install by roughly 73% (928kB → 252kB).

**Migration:**

```bash
# Required — you almost certainly already have this if you use React Query elsewhere:
npm install @tanstack/react-query

# Only if you use the Redux-backed hooks:
npm install @reduxjs/toolkit react-redux
```

No code changes — this is purely an installation-time change. A peer-dependency warning
after upgrading is telling you exactly this.

### 6. `useAuth` root-entry shadowing

**Old behavior:** `import { useAuth } from "minder-data-provider"` resolved to the
legacy `AuthManager`-based hook — token get/set, `isAuthenticated()`, and the rest of
the request-layer auth API described in the README's Security Model.

**New behavior:** the root entry's `useAuth` is now the **capability-contract** hook —
the same shape backing provider integrations (Supabase/Clerk/Firebase's
`useAuth()`: `{ ready, session, error, signOut, getProviderClient }`). It's a different
contract for a different job: a swappable auth *provider* interface, not the
request-layer token manager. The legacy hook didn't go away — it's reachable through
`useMinder().auth`.

**Why:** the provider-platform capability contracts (`useAuth`, `useCheckout`,
`useStorage`, `useLive`) needed the name every provider's own docs already use for it.
Explicit named exports at the root entry intentionally shadow the star-exported legacy
`useAuth` (ES module semantics: local exports win over `export *`).

**Migration:**

```typescript
// Before (2.2.0-beta.0 and earlier) — root import was the token/session manager
import { useAuth } from "minder-data-provider";
const { isAuthenticated, getToken, setToken } = useAuth();

// After — same legacy hook, reached through useMinder()
import { useMinder } from "minder-data-provider";
const { auth } = useMinder("anyRouteName");
const isLoggedIn = auth.isAuthenticated();

// After — root `useAuth` is now the capability-contract hook (requires a
// registered auth provider — see the README's Level 2)
import { useAuth } from "minder-data-provider";
const { session, ready, signOut } = useAuth();
```

### 7. `rawUrl` and config unification

**Old behavior:** `useMinder("https://api.example.com/users")` or
`useMinder("/some/path", { rawUrl: true })` threw `"Route not found"` whenever a
`MinderDataProvider` was mounted — the escape hatch only worked in standalone
(no-provider) mode. Separately, `configureMinder()`'s routes registry and the
standalone `minder()` function's URL resolver were two independent stores: calling
standalone `useMinder("routeName")` after `configureMinder()` treated the route name as
a literal path instead of resolving it from your registry.

**New behavior:** `ApiClient.request` now dispatches ad-hoc URLs (absolute
`http(s)://`, `rawUrl: true`, or an unregistered leading-slash path) through the same
client instance in provider mode too — auth, interceptors, and plugins still run.
Unknown *bare* route names (no scheme, no leading slash) still throw, so typos are
still caught. `configureMinder()` now feeds both stores, so standalone
`useMinder("routeName")` correctly resolves url/method/headers/timeout from your
registry. `minder.config()` still works but logs a deprecation warning.

**Why:** this was both a capability gap (the escape hatch existed in only one of the
two usage modes) and a bug (two configs meant to be one source of truth silently
weren't).

**Migration:**

```tsx
// Now works identically whether or not <MinderDataProvider> is mounted:
const { data: status } = useMinder("https://third-party.example.com/status");
const { data: raw } = useMinder("/unregistered/path", { rawUrl: true });

// Standalone useMinder("routeName") now honors configureMinder()'s registry:
configureMinder({ apiUrl: "https://api.example.com", routes: { users: "/users" } });
const { data: users } = useMinder("users"); // resolves via the registry, no provider needed
```

No action needed unless you were working around the old `"Route not found"` behavior
(e.g. avoiding `rawUrl` in provider mode) — that workaround is no longer necessary.

---

## v1.x → v2.0

Guide for migrating from Minder Data Provider v1.x to v2.0.

## Table of Contents

- [Overview](#overview)
- [Breaking Changes](#breaking-changes)
- [New Features](#new-features)
- [Step-by-Step Migration](#step-by-step-migration)
- [Configuration Changes](#configuration-changes)
- [Import Changes](#import-changes)
- [API Changes](#api-changes)
- [Performance Improvements](#performance-improvements)
- [Troubleshooting](#troubleshooting)

---

## Overview

Minder Data Provider v2.0 introduces significant improvements while maintaining backward compatibility where possible. This guide will help you migrate your existing application smoothly.

### What's New in v2.0

✅ **87% smaller bundle sizes** with modular imports  
✅ **Simplified configuration** with intelligent defaults  
✅ **Advanced debugging tools** for better DX  
✅ **Flexible SSR/CSR** rendering strategies  
✅ **Enhanced security** features built-in  
✅ **Performance optimizations** (batching, deduplication, monitoring)

### Migration Timeline

- **Simple projects**: 30-60 minutes
- **Medium projects**: 2-4 hours
- **Large projects**: 4-8 hours

---

## Breaking Changes

### 1. Configuration Structure

**v1.x:**

```typescript
const config = {
  apiBaseUrl: "https://api.example.com",
  routes: {
    users: { method: "GET", url: "/users" },
    createUser: { method: "POST", url: "/users" },
    updateUser: { method: "PUT", url: "/users/:id" },
    deleteUser: { method: "DELETE", url: "/users/:id" },
  },
};
```

**v2.0:**

```typescript
import { createMinderConfig } from "minder-data-provider/config";

const config = createMinderConfig({
  apiUrl: "https://api.example.com", // Changed from apiBaseUrl
  routes: {
    users: "/users", // Auto-generates full CRUD
  },
});
```

### 2. Import Paths

**v1.x:**

```typescript
import { useOneTouchCrud, useAuth, useCache } from "minder-data-provider";
```

**v2.0 (Recommended for smaller bundles):**

```typescript
import { useOneTouchCrud } from "minder-data-provider/crud";
import { useAuth } from "minder-data-provider/auth";
import { useCache } from "minder-data-provider/cache";
```

**v2.0 (Still supported for backward compatibility):**

```typescript
import { useOneTouchCrud, useAuth, useCache } from "minder-data-provider";
```

### 3. Debug API

**v1.x:**

```typescript
// No built-in debug tools
console.log("Debug info");
```

**v2.0:**

```typescript
import { useDebug } from "minder-data-provider/debug";

const debug = useDebug();
debug.log("api", "Debug info", { data: "value" });
```

---

## New Features

### 1. Auto-Generated CRUD Routes

**v1.x** required explicit route definitions:

```typescript
routes: {
  getUsers: { method: 'GET', url: '/users' },
  createUser: { method: 'POST', url: '/users' },
  updateUser: { method: 'PUT', url: '/users/:id' },
  deleteUser: { method: 'DELETE', url: '/users/:id' }
}
```

**v2.0** auto-generates all CRUD operations:

```typescript
routes: {
  users: "/users"; // Generates: GET, POST, PUT, DELETE automatically
}
```

### 2. Simplified Authentication

**v1.x:**

```typescript
auth: {
  loginRoute: 'login',
  logoutRoute: 'logout',
  tokenKey: 'token',
  storage: 'cookie', // ✅ More secure (or 'sessionStorage', 'memory')
  autoRefresh: true,
  refreshRoute: 'refresh'
}
```

**v2.0:**

```typescript
auth: true  // Auto-configures with intelligent defaults

// Or customize:
auth: {
  tokenKey: 'access_token',
  storage: 'cookie', // ✅ Secure storage (or 'sessionStorage', 'memory')
  autoRefresh: true
}
```

### 3. Performance Monitoring

New in v2.0:

```typescript
import { usePerformanceMonitor } from "minder-data-provider/utils/performance";

function Component() {
  const monitor = usePerformanceMonitor();

  useEffect(() => {
    const metrics = monitor.getMetrics();
    console.log("Performance:", metrics);
  }, []);
}
```

### 4. Advanced Security

New in v2.0:

```typescript
security: {
  sanitization: true,        // XSS protection
  csrfProtection: true,      // CSRF tokens
  rateLimiting: {            // Rate limiting
    requests: 100,
    window: 60000
  }
}
```

---

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
# Uninstall v1.x
npm uninstall minder-data-provider

# Install v2.0
npm install minder-data-provider@latest
```

### Step 2: Update Configuration

Create a new configuration file using the simplified API:

```typescript
// config/minder.config.ts (v2.0)
import { createMinderConfig } from "minder-data-provider/config";

export const config = createMinderConfig({
  // Change apiBaseUrl → apiUrl
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://api.example.com",

  // Simplify routes (auto-generates CRUD)
  routes: {
    users: "/users",
    posts: "/posts",
    comments: "/comments",
  },

  // Simplify feature configuration
  auth: true,
  cache: true,
  cors: true,

  // Add new features
  security: {
    sanitization: true,
    csrfProtection: true,
  },

  performance: {
    deduplication: true,
    monitoring: true,
  },

  debug: process.env.NODE_ENV === "development",
});
```

### Step 3: Update Imports

**Option A: Modular Imports (Recommended)**

```typescript
// Before (v1.x)
import { useOneTouchCrud, useAuth } from "minder-data-provider";

// After (v2.0)
import { useOneTouchCrud } from "minder-data-provider/crud";
import { useAuth } from "minder-data-provider/auth";
```

**Option B: Unified Import (Backward Compatible)**

```typescript
// Still works in v2.0
import { useOneTouchCrud, useAuth } from "minder-data-provider";
```

### Step 4: Update Provider Setup

```typescript
// pages/_app.tsx
import { MinderDataProvider } from "minder-data-provider";
import { config } from "../config/minder.config";

export default function App({ Component, pageProps }) {
  return (
    <MinderDataProvider config={config}>
      <Component {...pageProps} />
    </MinderDataProvider>
  );
}
```

### Step 5: Update Component Usage

Most components will work without changes, but you can leverage new features:

```typescript
// Before (v1.x)
function UsersList() {
  const { data, loading, operations } = useOneTouchCrud("users");

  if (loading.fetch) return <div>Loading...</div>;

  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}

// After (v2.0) - Add debug tools
import { useDebug } from "minder-data-provider/debug";

function UsersList() {
  const { data, loading, operations } = useOneTouchCrud("users");
  const debug = useDebug();

  useEffect(() => {
    if (data) {
      debug.log("data", "Users loaded", { count: data.length });
    }
  }, [data]);

  if (loading.fetch) return <div>Loading...</div>;

  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

### Step 6: Test Your Application

```bash
# Run tests
npm test

# Start dev server
npm run dev

# Build for production
npm run build
```

---

## Configuration Changes

### API URL

```typescript
// v1.x
apiBaseUrl: "https://api.example.com";

// v2.0
apiUrl: "https://api.example.com";
```

### Routes

```typescript
// v1.x - Explicit routes
routes: {
  getUsers: { method: 'GET', url: '/users' },
  createUser: { method: 'POST', url: '/users' },
  updateUser: { method: 'PUT', url: '/users/:id' },
  deleteUser: { method: 'DELETE', url: '/users/:id' }
}

// v2.0 - Auto-generated CRUD
routes: {
  users: '/users'  // Auto-generates all CRUD operations
}

// v2.0 - Custom routes (when needed)
routes: {
  users: {
    method: 'GET',
    url: '/users',
    cache: true,
    optimistic: true
  }
}
```

### Authentication

```typescript
// v1.x
auth: {
  loginRoute: 'login',
  logoutRoute: 'logout',
  tokenKey: 'token',
  storage: 'cookie' // ✅ Secure storage
}

// v2.0 - Simple
auth: true

// v2.0 - Custom
auth: {
  tokenKey: 'access_token',
  storage: 'cookie', // ✅ Recommended for production
  autoRefresh: true
}
```

### Cache

```typescript
// v1.x
cache: {
  enabled: true,
  ttl: 300000,
  storage: 'memory'
}

// v2.0 - Simple
cache: true

// v2.0 - Custom
cache: {
  ttl: 300000,
  storage: 'memory',
  invalidationPatterns: [/^users/, /^posts/]
}
```

---

## Import Changes

### Module Reorganization

| Feature   | v1.x                   | v2.0 (Modular)                   | v2.0 (Unified)         |
| --------- | ---------------------- | -------------------------------- | ---------------------- |
| CRUD      | `minder-data-provider` | `minder-data-provider/crud`      | `minder-data-provider` |
| Auth      | `minder-data-provider` | `minder-data-provider/auth`      | `minder-data-provider` |
| Cache     | `minder-data-provider` | `minder-data-provider/cache`     | `minder-data-provider` |
| WebSocket | `minder-data-provider` | `minder-data-provider/websocket` | `minder-data-provider` |
| Upload    | `minder-data-provider` | `minder-data-provider/upload`    | `minder-data-provider` |
| Debug     | N/A                    | `minder-data-provider/debug`     | `minder-data-provider` |
| Config    | N/A                    | `minder-data-provider/config`    | `minder-data-provider` |
| SSR       | N/A                    | `minder-data-provider/ssr`       | `minder-data-provider` |

### Bundle Size Comparison

```typescript
// v1.x - Full import (~150KB)
import { useOneTouchCrud, useAuth, useCache } from "minder-data-provider";

// v2.0 - Modular imports (45KB + 25KB + 20KB = 90KB)
import { useOneTouchCrud } from "minder-data-provider/crud";
import { useAuth } from "minder-data-provider/auth";
import { useCache } from "minder-data-provider/cache";

// Savings: 60KB (40% reduction)
```

---

## API Changes

### Hook Return Values

Most hooks remain compatible, with added features:

```typescript
// v1.x
const { data, loading, error, operations } = useOneTouchCrud("users");

// v2.0 - Same API, enhanced with better TypeScript support
const { data, loading, error, operations } = useOneTouchCrud<User>("users");
```

### New Options

```typescript
// v2.0 adds new options
const { data, operations } = useOneTouchCrud("users", {
  optimistic: true, // New: Optimistic updates
  onSuccess: (data) => {}, // New: Success callback
  onError: (error) => {}, // New: Error callback
});
```

---

## Performance Improvements

### Automatic Optimizations in v2.0

1. **Request Deduplication**: Prevents duplicate API calls automatically
2. **Request Batching**: Batches multiple requests when possible
3. **Smart Caching**: Improved cache invalidation strategies
4. **Tree Shaking**: Only include code you use

### Migration to Performance Features

```typescript
// v1.x - Manual optimization
const [loading, setLoading] = useState(false);
const [users, setUsers] = useState([]);

useEffect(() => {
  let isCanceled = false;

  setLoading(true);
  fetch("/api/users")
    .then((res) => res.json())
    .then((data) => {
      if (!isCanceled) setUsers(data);
    })
    .finally(() => {
      if (!isCanceled) setLoading(false);
    });

  return () => {
    isCanceled = true;
  };
}, []);

// v2.0 - Automatic optimization
const { data: users, loading } = useOneTouchCrud("users");
// Deduplication, caching, and cleanup handled automatically
```

---

## Troubleshooting

### Common Migration Issues

#### Issue 1: Configuration Not Found

**Error:**

```
Error: MinderConfig not found
```

**Solution:**

```typescript
// Make sure to use createMinderConfig
import { createMinderConfig } from "minder-data-provider/config";

const config = createMinderConfig({
  /* ... */
});
```

#### Issue 2: Import Errors

**Error:**

```
Module not found: Can't resolve 'minder-data-provider/crud'
```

**Solution:**

```bash
# Make sure you're on v2.0
npm install minder-data-provider@latest

# Clear cache
rm -rf node_modules .next
npm install
```

#### Issue 3: TypeScript Errors

**Error:**

```
Type 'User[]' is not assignable to type 'never[]'
```

**Solution:**

```typescript
// Add generic type
const { data } = useOneTouchCrud<User>("users");
```

#### Issue 4: Routes Not Working

**Error:**

```
404 Not Found on /users
```

**Solution:**

```typescript
// v2.0 requires explicit route registration
routes: {
  users: "/users"; // Must define routes
}
```

### Getting Help

If you encounter issues during migration:

1. Check the [API Reference](./API_REFERENCE.md)
2. Review [Examples](./EXAMPLES.md)
3. Join our [Discord Community](https://discord.gg/minder-data-provider)
4. Open an [Issue on GitHub](https://github.com/minder-data-provider/issues)

---

## Deprecation Timeline

| Feature           | v1.x | v2.0          | v3.0 (Future)  |
| ----------------- | ---- | ------------- | -------------- |
| `apiBaseUrl`      | ✅   | ⚠️ Deprecated | ❌ Removed     |
| Unified imports   | ✅   | ✅ Supported  | ⚠️ Discouraged |
| Old config format | ✅   | ⚠️ Deprecated | ❌ Removed     |

---

## Next Steps

After migration:

1. **Enable Debug Mode** to verify everything works
2. **Run Tests** to ensure functionality
3. **Monitor Performance** using new tools
4. **Enable Security Features** (CSRF, XSS protection)
5. **Optimize Imports** for smaller bundle sizes
6. **Review New Features** in the [API Reference](./API_REFERENCE.md)

---

## Summary Checklist

- [ ] Update package to v2.0
- [ ] Update configuration using `createMinderConfig`
- [ ] Change `apiBaseUrl` to `apiUrl`
- [ ] Simplify routes (use auto-generated CRUD)
- [ ] Update imports (use modular imports for smaller bundles)
- [ ] Add debug tools for development
- [ ] Enable security features
- [ ] Test application thoroughly
- [ ] Monitor bundle size improvements
- [ ] Review and adopt new features

---

For detailed examples, see the [Examples Guide](./EXAMPLES.md).
