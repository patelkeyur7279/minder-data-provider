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
