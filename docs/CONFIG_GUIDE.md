# Configuration Guide

This guide explains how to configure **minder-data-provider** with examples and all available options.

## 🚨 Important: Next.js Users

**If you're using Next.js, you MUST provide the `dynamic` field in your configuration.**

See [DYNAMIC_IMPORTS.md](./DYNAMIC_IMPORTS.md) for detailed explanation.

```typescript
import dynamic from "next/dynamic"; // Required for Next.js
import { configureMinder } from "minder-data-provider/config";

export const config = configureMinder({
  apiUrl: "https://api.example.com",
  dynamic: dynamic, // ⚠️ REQUIRED for Next.js
  routes: {
    /* ... */
  },
});
```

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration Presets](#configuration-presets)
3. [Manual Configuration](#manual-configuration)
4. [All Options Reference](#all-options-reference)
5. [Platform-Specific Setup](#platform-specific-setup)

---

## Quick Start

### Minimal Setup (45KB bundle)

```typescript
import { configureMinder } from "minder-data-provider/config";

export const config = configureMinder({
  preset: "minimal",
  apiUrl: "https://api.example.com",
  routes: {
    users: "/users",
    products: "/products",
  },
});
```

### Standard Setup (90KB bundle) - RECOMMENDED

```typescript
import { configureMinder } from "minder-data-provider/config";

export const config = configureMinder({
  preset: "standard",
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  routes: {
    users: "/users",
    products: "/products",
  },
});
```

### Enterprise Setup (150KB bundle)

```typescript
import { configureMinder } from "minder-data-provider/config";

export const config = configureMinder({
  preset: "enterprise",
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  websocket: { url: "wss://api.example.com/ws" },
  routes: {
    users: "/users",
    products: "/products",
  },
});
```

---

## Configuration Presets

Choose ONE preset that matches your application:

### 🟢 Minimal

**For:** Prototypes, MVPs, simple CRUD apps  
**Bundle:** ~45KB  
**Features:**

- ✅ Basic CRUD operations
- ✅ Memory cache (5 min)
- ✅ Error handling
- ❌ No auth
- ❌ No WebSocket
- ❌ No offline support

```typescript
const config = configureMinder({
  preset: "minimal",
  apiUrl: "https://api.example.com",
  routes: { users: "/users" },
});
```

---

### 🟡 Standard (RECOMMENDED)

**For:** Most production applications  
**Bundle:** ~90KB  
**Features:**

- ✅ CRUD operations
- ✅ Authentication (JWT via cookies)
- ✅ Hybrid cache (Memory + IndexedDB)
- ✅ CSRF protection
- ✅ Rate limiting (100 req/min)
- ✅ Request deduplication
- ✅ Request batching
- ❌ No WebSocket
- ❌ No SSR support

```typescript
const config = configureMinder({
  preset: "standard",
  apiUrl: "https://api.example.com",
  auth: { storage: "cookie" },
  cache: { staleTime: 15 * 60 * 1000 },
  routes: { users: "/users" },
});
```

---

### 🔵 Advanced

**For:** Large applications, PWAs, multi-platform apps  
**Bundle:** ~120KB  
**Features:**

- ✅ Everything in Standard
- ✅ Persistent cache (IndexedDB)
- ✅ Offline support
- ✅ SSR ready
- ✅ Advanced security headers
- ✅ Input validation
- ✅ Performance monitoring
- ✅ Dev tools integration
- ❌ No WebSocket
- ❌ No encryption

```typescript
const config = configureMinder({
  preset: "advanced",
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  routes: { users: "/users" },
});
```

---

### 🔴 Enterprise

**For:** Production-grade, real-time systems, enterprise apps  
**Bundle:** ~150KB  
**Features:**

- ✅ Everything in Advanced
- ✅ WebSocket support
- ✅ Real-time updates
- ✅ End-to-end encryption
- ✅ Advanced monitoring
- ✅ Network logging
- ✅ Performance analytics
- ✅ Custom security headers
- ✅ Request signing

```typescript
const config = configureMinder({
  preset: "enterprise",
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  websocket: { url: "wss://api.example.com/ws" },
  routes: { users: "/users" },
});
```

---

## Manual Configuration

If presets don't fit your needs, configure manually:

### Minimal Manual Config

```typescript
import { configureMinder, HttpMethod } from "minder-data-provider";

const config = configureMinder({
  apiUrl: "https://api.example.com",
  routes: {
    users: { method: HttpMethod.GET, url: "/users" },
    createUser: { method: HttpMethod.POST, url: "/users" },
    updateUser: { method: HttpMethod.PUT, url: "/users/:id" },
    deleteUser: { method: HttpMethod.DELETE, url: "/users/:id" },
  },
  cache: {
    staleTime: 5 * 60 * 1000,
  },
  performance: {
    retries: 1,
    timeout: 10000,
  },
});
```

### Full Manual Config

```typescript
import { configureMinder, HttpMethod, StorageType, LogLevel } from "minder-data-provider";

const config = configureMinder({
  // API Setup
  apiUrl: "https://api.example.com",

  // Routes
  routes: {
    users: { method: HttpMethod.GET, url: "/users" },
    createUser: { method: HttpMethod.POST, url: "/users" },
    getUserById: { method: HttpMethod.GET, url: "/users/:id" },
    updateUser: { method: HttpMethod.PUT, url: "/users/:id" },
    deleteUser: { method: HttpMethod.DELETE, url: "/users/:id" },
  },

  // Authentication
  auth: {
    tokenKey: "accessToken",
    storage: StorageType.COOKIE, // Web: 'cookie' | 'sessionStorage' | 'memory'
    refreshUrl: "/api/auth/refresh",
  },

  // Caching
  cache: {
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 10 * 60 * 1000, // Garbage collect after 10 min unused
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },

  // Security
  security: {
    sanitization: true,
    csrfProtection: true,
    rateLimiting: {
      requests: 100,
      window: 60000,
    },
  },

  // WebSocket (Optional)
  websocket: {
    url: "wss://api.example.com/ws",
    reconnect: true,
    heartbeat: 30000,
  },

  // Performance
  performance: {
    deduplication: true,
    retries: 3,
    timeout: 30000,
    compression: true,
  },

  // Server-Side Rendering
  ssr: {
    enabled: false,
  },

  // Debug
  debug: {
    enabled: process.env.NODE_ENV === "development",
    logLevel: LogLevel.WARN, // 'error' | 'warn' | 'info' | 'debug'
    performance: true,
    devTools: true,
  },
});
```

---

## All Options Reference

### Root Options

| Option       | Type   | Default    | Description                |
| ------------ | ------ | ---------- | -------------------------- |
| `apiUrl`     | string | Required   | Base URL for all API calls |
| `routes`     | object | {}         | Route mappings             |
| `preset`     | string | 'standard' | Configuration preset       |
| `dynamic`    | object | {}         | Dynamic config             |

### Authentication

| Option                       | Type    | Default         | Description            |
| ---------------------------- | ------- | --------------- | ---------------------- |
| `auth`                       | boolean | true            | Enable authentication  |
| `auth.tokenKey`              | string  | 'token'         | Key to store token     |
| `auth.storage`               | enum    | COOKIE          | Where to store token   |
| `auth.refreshUrl`            | string  | '/auth/refresh' | Token refresh endpoint |

### Caching

| Option                       | Type    | Default  | Description                          |
| ---------------------------- | ------- | -------- | ------------------------------------ |
| `cache`                      | boolean | true     | Enable caching                       |
| `cache.staleTime`            | number  | 15min    | Time to live in ms                   |
| `cache.gcTime`               | number  | 10min    | Garbage collect time                 |
| `cache.refetchOnWindowFocus` | boolean | true     | Refetch when tab focused             |
| `cache.refetchOnReconnect`   | boolean | true     | Refetch when back online             |

### Security

| Option                           | Type    | Default | Description           |
| -------------------------------- | ------- | ------- | --------------------- |
| `security`                       | boolean | true    | Enable security       |
| `security.sanitization`          | boolean | true    | Sanitize HTML output  |
| `security.csrfProtection`        | boolean | true    | CSRF token handling   |
| `security.rateLimiting.requests` | number  | 100     | Requests allowed      |
| `security.rateLimiting.window`   | number  | 60000   | Time window in ms     |

### WebSocket

| Option                           | Type    | Default | Description           |
| -------------------------------- | ------- | ------- | --------------------- |
| `websocket`                      | boolean | false   | Enable WebSocket      |
| `websocket.url`                  | string  | -       | WebSocket URL         |
| `websocket.reconnect`            | boolean | true    | Auto-reconnect        |
| `websocket.heartbeat`            | number  | 30000   | Heartbeat interval ms |

### Performance

| Option                      | Type    | Default | Description            |
| --------------------------- | ------- | ------- | ---------------------- |
| `performance.deduplication` | boolean | true    | Dedupe requests        |
| `performance.retries`       | number  | 3       | Retry count            |
| `performance.timeout`       | number  | 30000   | Request timeout ms     |
| `performance.compression`   | boolean | true    | Enable compression     |

### Server-Side Rendering

| Option        | Type    | Default | Description        |
| ------------- | ------- | ------- | ------------------ |
| `ssr`         | boolean | false   | Enable SSR support |
| `ssr.enabled` | boolean | false   | Enable SSR support |
| `ssr.prefetch`| array   | []      | Routes to prefetch |

### Debug

| Option              | Type    | Default  | Description      |
| ------------------- | ------- | -------- | ---------------- |
| `debug`             | boolean | dev only | Enable debugging |
| `debug.enabled`     | boolean | dev only | Enable debugging |
| `debug.logLevel`    | enum    | WARN     | Log level        |
| `debug.performance` | boolean | true     | Log performance  |
| `debug.devTools`    | boolean | true     | Enable dev tools |

---

## Platform-Specific Setup

### React Web App

```typescript
import { MinderDataProvider } from "minder-data-provider";
import { config } from "./config";

function App() {
  return (
    <MinderDataProvider config={config}>
      <YourApp />
    </MinderDataProvider>
  );
}
```

### Next.js

```typescript
import { configureMinder } from "minder-data-provider/config";
import dynamic from 'next/dynamic';

export const config = configureMinder({
  preset: "standard",
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  dynamic: dynamic,
  routes: { users: "/users" },
  ssr: { enabled: true },
});
```

### React Native

```typescript
import { configureMinder } from "minder-data-provider/config";
import { StorageType } from "minder-data-provider";

const config = configureMinder({
  preset: "standard",
  apiUrl: process.env.REACT_APP_API_URL,
  auth: { storage: StorageType.ASYNC_STORAGE },
});
```

### Electron

```typescript
import { configureMinder } from "minder-data-provider/config";
import { StorageType } from "minder-data-provider";

const config = configureMinder({
  preset: "advanced",
  apiUrl: "http://localhost:3000",
  // Electron store is auto-detected on Electron platform
});
```

### Node.js

```typescript
import { configureMinder } from "minder-data-provider/config";
import { StorageType } from "minder-data-provider";

const config = configureMinder({
  preset: "standard",
  apiUrl: "https://api.example.com",
  auth: { storage: StorageType.MEMORY },
});
```

---

## Environment Variables

```bash
# .env
REACT_APP_API_URL=https://api.example.com
REACT_APP_WS_URL=wss://api.example.com/ws
REACT_APP_DEBUG=false
```

## Tips

- ✅ Start with **Standard preset** for most apps
- ✅ Use **Minimal** for lightweight prototypes
- ✅ Use **Advanced** for offline support
- ✅ Use **Enterprise** for real-time features
- ✅ Always use **cookies** for auth (XSS protection)
- ✅ Enable **CSRF protection** in production
- ✅ Use **persistent cache** for offline apps
- ✅ Enable **rate limiting** to prevent abuse
- ✅ Enable **debug mode** during development only


## Plugins & Secrets in Configuration (v2.2)

Starting in v2.2, your `minder.config.ts` can wire up integrations (crash reporting, analytics, third-party auth) through **plugins**, and safely reference server-side secrets through `secret()` while keeping public values inline with `env()`.

### Registering plugins: per-instance vs. global

There are two ways to register plugins, and they cover different needs:

- **Per-instance — `config.plugins`**: attach plugins to a specific Minder configuration. This is the recommended default. Plugins live alongside the rest of your config and are scoped to that instance.
- **Global — `registerPlugins(...)`**: register plugins on the global singleton `pluginManager`. Use this when you can't (or don't want to) thread config through, e.g. registering a crash reporter from an app bootstrap file before any config is built.

```ts
// Per-instance: declared inside the config object
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  routes: { /* ... */ },
  plugins: [myPlugin, anotherPlugin],
});

// Global: registered on the singleton, applies everywhere
import { registerPlugins } from 'minder-data-provider';

registerPlugins(crashReporter, analytics);
```

Either way, plugin hooks fire on **every request** — both through `<MinderDataProvider>` and through standalone `minder()` calls.

### A complete `minder.config.ts`

This example wires three plugins — a crash reporter, an analytics tracker, and an auth-provider that supplies tokens via `provideToken()`. Note how public values use `env()` (safe to inline in the client bundle) while real secrets use `secret()` (resolved server-side only):

```ts
// minder.config.ts
import { configureMinder, env, secret } from 'minder-data-provider';
import * as Sentry from '@sentry/browser';
import { track } from '@/lib/analytics';
import { auth } from '@/lib/firebase';

configureMinder({
  // Public, publishable values — safe to inline via env()
  apiUrl: env('NEXT_PUBLIC_API_URL'),

  routes: {
    users: '/users',
    posts: '/posts',
  },

  auth: {
    // A real secret: carries no value in the browser bundle,
    // resolves from process.env on the server.
    tokenSigningKey: secret('AUTH_TOKEN_SIGNING_KEY'),
  },

  plugins: [
    // 1. Crash reporting — forward every error to Sentry.
    {
      name: 'sentry',
      manifest: { name: 'sentry', capabilities: ['crash-reporting'], runtime: 'client' },
      onError: (e) => {
        Sentry.captureException(new Error(e.message), { extra: e });
      },
    },

    // 2. Analytics — track each response's URL and duration.
    {
      name: 'analytics',
      manifest: { name: 'analytics', capabilities: ['analytics'], runtime: 'client' },
      onResponse: (r) => {
        track('api', { url: r.url, status: r.status, ms: r.duration });
      },
    },

    // 3. Auth provider — supply the token when the auth manager has none.
    //    provideToken() may return a string, null, or a Promise of either.
    {
      name: 'firebase-auth',
      manifest: { name: 'firebase-auth', capabilities: ['auth-provider'], runtime: 'client' },
      provideToken: () => auth.currentUser?.getIdToken() ?? null,
      onAuthRefresh: (tokens) => {
        // fired on token rotation
      },
    },
  ],
});
```

The `manifest` field is optional but recommended — it declares each plugin's `capabilities` (`'crash-reporting'`, `'analytics'`, `'auth-provider'`, `'payments'`, `'storage'`, `'upload'`, `'transport'`) and `runtime` (`'client'`, `'server'`, or `'isomorphic'`).

### Lifecycle & isolation

Plugin hooks are **optional** — implement only the ones you need. Across a request's lifecycle the relevant hooks fire in order: `onInit` → `onRequest` → `onResponse` (or `onError`), plus `onCacheHit`/`onCacheMiss`, `provideToken`, `onAuthRefresh`, `onUpload`, `onSync`, and `onConnectivityChange` where applicable, and `onDestroy` on teardown.

Crucially, **each plugin runs in its own `try/catch`**. If a plugin hook throws, Minder logs a warning and continues — a failing plugin **never breaks a request** and never blocks the other plugins. This isolation is what makes it safe to drop in third-party integrations like Sentry or an analytics SDK.

### Secrets: the config refuses to run with an exposed secret client-side

`configureMinder()` calls `assertNoExposedSecrets(config)` on your configuration. **In the browser, this throws** a `MinderConfigError` with code `CONFIG_EXPOSED_SECRET` if it finds a raw, secret-shaped value anywhere in the config:

```ts
// THROWS in the browser — raw Stripe secret key detected in client config
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  payments: { stripeKey: 'sk_live_abc123...' }, // MinderConfigError: CONFIG_EXPOSED_SECRET
});

// Safe — the secret is referenced, not inlined
configureMinder({
  apiUrl: env('NEXT_PUBLIC_API_URL'),
  payments: { stripeKey: secret('STRIPE_SECRET_KEY') }, // resolved server-side only
});
```

The detector flags common secret shapes — Stripe `sk_live`/`sk_test` and `rk_` keys, AWS `AKIA…` access keys, PEM private keys, GitHub (`ghp_`/`github_pat_`), Slack (`xox…`), SendGrid (`SG.…`), and any string of 8+ characters sitting under a key like `secret`, `password`, `privateKey`, `clientSecret`, or `apiSecret`. Values wrapped in a `SecretRef` (via `secret()`) are **never** flagged.

The rule of thumb:

- **Publishable keys and base URLs** (Stripe `pk_`, a Sentry DSN, your API URL) → `env()`. Safe to inline.
- **Real secrets** (signing keys, `sk_` keys, DB passwords) → `secret()`, paired with a server route or `resolveSecret()` from `minder-data-provider/server`.

This way your `minder.config.ts` stays identical across client and server — public values are inlined, secrets stay as references, and the client build refuses to ship a raw secret.
