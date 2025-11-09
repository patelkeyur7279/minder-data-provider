# Configuration Guide

This guide explains how to configure **minder-data-provider** with examples and all available options.

## � Important: Next.js Users

**If you're using Next.js, you MUST provide the `dynamic` field in your configuration.**

See [DYNAMIC_IMPORTS.md](./DYNAMIC_IMPORTS.md) for detailed explanation.

```typescript
import dynamic from "next/dynamic"; // Required for Next.js

export const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  dynamic: dynamic, // ⚠️ REQUIRED for Next.js
  routes: {
    /* ... */
  },
});
```

---

## �📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration Presets](#configuration-presets)
3. [Manual Configuration](#manual-configuration)
4. [All Options Reference](#all-options-reference)
5. [Platform-Specific Setup](#platform-specific-setup)

---

## Quick Start

### Minimal Setup (45KB bundle)

```typescript
import { createMinderConfig } from "minder-data-provider/config";

export const config = createMinderConfig({
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
export const config = createMinderConfig({
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
export const config = createMinderConfig({
  preset: "enterprise",
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  websocket: "wss://api.example.com/ws",
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
const config = createMinderConfig({
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
const config = createMinderConfig({
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
const config = createMinderConfig({
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
const config = createMinderConfig({
  preset: "enterprise",
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  websocket: "wss://api.example.com/ws",
  routes: { users: "/users" },
});
```

---

## Manual Configuration

If presets don't fit your needs, configure manually:

### Minimal Manual Config

```typescript
const config: MinderConfig = {
  apiBaseUrl: "https://api.example.com",

  routes: {
    users: { method: "GET", url: "/users" },
    createUser: { method: "POST", url: "/users" },
    updateUser: { method: "PUT", url: "/users/:id" },
    deleteUser: { method: "DELETE", url: "/users/:id" },
  },

  cache: {
    type: "memory",
    ttl: 5 * 60 * 1000,
    maxSize: 50,
  },

  performance: {
    retries: 1,
    timeout: 10000,
  },
};
```

### Full Manual Config

```typescript
const config: MinderConfig = {
  // API Setup
  apiBaseUrl: "https://api.example.com",
  apiVersion: "v1",

  // Routes
  routes: {
    users: { method: "GET", url: "/users" },
    createUser: { method: "POST", url: "/users" },
    getUserById: { method: "GET", url: "/users/:id" },
    updateUser: { method: "PUT", url: "/users/:id" },
    deleteUser: { method: "DELETE", url: "/users/:id" },
  },

  // Authentication
  auth: {
    enabled: true,
    tokenKey: "accessToken",
    storage: "cookie", // Web: 'cookie' | 'sessionStorage' | 'memory'
    // RN: 'AsyncStorage' | 'SecureStore' (Expo) | 'memory'
    refreshUrl: "/api/auth/refresh",
    tokenRefreshThreshold: 5 * 60 * 1000, // Refresh 5 min before expiry
  },

  // Caching
  cache: {
    type: "hybrid", // 'memory' | 'hybrid' | 'persistent'
    ttl: 15 * 60 * 1000, // 15 minutes
    gcTime: 10 * 60 * 1000, // Garbage collect after 10 min unused
    maxSize: 200,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },

  // Security
  security: {
    sanitization: true,
    csrfProtection: true,
    inputValidation: true,
    encryption: false,
    rateLimiting: {
      enabled: true,
      requests: 100,
      window: 60000,
    },
    headers: {
      contentSecurityPolicy: "default-src 'self'",
      xFrameOptions: "DENY",
      xContentTypeOptions: true,
      strictTransportSecurity: "max-age=31536000",
    },
  },

  // WebSocket (Optional)
  websocket: {
    enabled: false,
    url: "wss://api.example.com/ws",
    reconnect: true,
    heartbeat: 30000,
    maxReconnectAttempts: 5,
  },

  // Performance
  performance: {
    deduplication: true,
    batching: true,
    batchDelay: 50,
    retries: 3,
    retryDelay: 1000,
    timeout: 30000,
    compression: true,
    lazyLoading: true,
    monitoring: false,
  },

  // CORS
  cors: {
    enabled: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },

  // Server-Side Rendering
  ssr: {
    enabled: false,
    hydrate: true,
  },

  // Debug
  debug: {
    enabled: process.env.NODE_ENV === "development",
    logLevel: "warn", // 'error' | 'warn' | 'info' | 'debug'
    performance: true,
    devTools: true,
    networkLogs: false,
  },
};
```

---

## All Options Reference

### Root Options

| Option       | Type   | Default    | Description                |
| ------------ | ------ | ---------- | -------------------------- |
| `apiBaseUrl` | string | Required   | Base URL for all API calls |
| `apiVersion` | string | 'v1'       | API version to use         |
| `routes`     | object | {}         | Route mappings             |
| `preset`     | string | 'standard' | Configuration preset       |
| `dynamic`    | object | {}         | Dynamic config             |

### Authentication

| Option                       | Type    | Default         | Description            |
| ---------------------------- | ------- | --------------- | ---------------------- |
| `auth.enabled`               | boolean | true            | Enable authentication  |
| `auth.tokenKey`              | string  | 'token'         | Key to store token     |
| `auth.storage`               | string  | 'cookie'        | Where to store token   |
| `auth.refreshUrl`            | string  | '/auth/refresh' | Token refresh endpoint |
| `auth.tokenRefreshThreshold` | number  | 5min            | Refresh before expiry  |

### Caching

| Option                       | Type    | Default  | Description                          |
| ---------------------------- | ------- | -------- | ------------------------------------ |
| `cache.type`                 | string  | 'hybrid' | Cache type: memory/hybrid/persistent |
| `cache.ttl`                  | number  | 15min    | Time to live in ms                   |
| `cache.gcTime`               | number  | 10min    | Garbage collect time                 |
| `cache.maxSize`              | number  | 200      | Max cached items                     |
| `cache.refetchOnWindowFocus` | boolean | true     | Refetch when tab focused             |
| `cache.refetchOnReconnect`   | boolean | true     | Refetch when back online             |

### Security

| Option                           | Type    | Default | Description           |
| -------------------------------- | ------- | ------- | --------------------- |
| `security.sanitization`          | boolean | true    | Sanitize HTML output  |
| `security.csrfProtection`        | boolean | true    | CSRF token handling   |
| `security.inputValidation`       | boolean | true    | Validate input        |
| `security.encryption`            | boolean | false   | End-to-end encryption |
| `security.rateLimiting.requests` | number  | 100     | Requests allowed      |
| `security.rateLimiting.window`   | number  | 60000   | Time window in ms     |

### WebSocket

| Option                           | Type    | Default | Description           |
| -------------------------------- | ------- | ------- | --------------------- |
| `websocket.enabled`              | boolean | false   | Enable WebSocket      |
| `websocket.url`                  | string  | -       | WebSocket URL         |
| `websocket.reconnect`            | boolean | true    | Auto-reconnect        |
| `websocket.heartbeat`            | number  | 30000   | Heartbeat interval ms |
| `websocket.maxReconnectAttempts` | number  | 5       | Max retries           |

### Performance

| Option                      | Type    | Default | Description            |
| --------------------------- | ------- | ------- | ---------------------- |
| `performance.deduplication` | boolean | true    | Dedupe requests        |
| `performance.batching`      | boolean | true    | Batch requests         |
| `performance.batchDelay`    | number  | 50      | Batch delay ms         |
| `performance.retries`       | number  | 3       | Retry count            |
| `performance.retryDelay`    | number  | 1000    | Retry delay ms         |
| `performance.timeout`       | number  | 30000   | Request timeout ms     |
| `performance.compression`   | boolean | true    | Enable compression     |
| `performance.lazyLoading`   | boolean | true    | Lazy load              |
| `performance.monitoring`    | boolean | false   | Performance monitoring |

### Server-Side Rendering

| Option        | Type    | Default | Description        |
| ------------- | ------- | ------- | ------------------ |
| `ssr.enabled` | boolean | false   | Enable SSR support |
| `ssr.hydrate` | boolean | true    | Hydrate on client  |

### Debug

| Option              | Type    | Default  | Description      |
| ------------------- | ------- | -------- | ---------------- |
| `debug.enabled`     | boolean | dev only | Enable debugging |
| `debug.logLevel`    | string  | 'warn'   | Log level        |
| `debug.performance` | boolean | true     | Log performance  |
| `debug.devTools`    | boolean | true     | Enable dev tools |
| `debug.networkLogs` | boolean | false    | Network logs     |

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
import { configureMinder } from "minder-data-provider/platforms/nextjs";

export const config = configureMinder({
  preset: "standard",
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  routes: { users: "/users" },
  ssr: { enabled: true },
});
```

### React Native

```typescript
import { configureMinder } from "minder-data-provider/platforms/native";

const config = configureMinder({
  preset: "standard",
  apiUrl: process.env.REACT_APP_API_URL,
  auth: { storage: "memory" }, // No localStorage on native
});
```

### Electron

```typescript
import { configureMinder } from "minder-data-provider/platforms/electron";

const config = configureMinder({
  preset: "advanced",
  apiUrl: "http://localhost:3000",
  cache: { type: "persistent" },
});
```

### Node.js

```typescript
import { configureMinder } from "minder-data-provider/platforms/node";

const config = configureMinder({
  preset: "standard",
  apiUrl: "https://api.example.com",
  auth: { storage: "memory" },
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
