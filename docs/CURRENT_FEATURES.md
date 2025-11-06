# 🎯 Minder Data Provider - Current Features Analysis

> **Generated**: November 6, 2025  
> **Version**: 2.1.x  
> **Branch**: demo/phase-3-features-part-2

This document provides a comprehensive overview of ALL current features in the codebase, based on actual implementation.

---

## 📦 Core Architecture

### 1. **Main Function: `minder()`**

**Location**: `src/core/minder.ts`

The ONE universal function that handles everything:

```typescript
import { minder } from "minder-data-provider";

// GET request
const { data, error, success } = await minder("users");

// POST request (auto-detected)
const result = await minder("users", { name: "John" });

// PUT request (auto-detected by ID)
const result = await minder("users/1", { name: "Jane" });

// DELETE request
const result = await minder("users/1", { method: "DELETE" });

// File upload with progress
const result = await minder("upload", file, {
  onProgress: (p) => console.log(`${p.percentage}%`),
});
```

**Features**:

- ✅ Smart HTTP method detection (GET/POST/PUT/PATCH/DELETE)
- ✅ File upload support (File, Blob, FileList, FormData)
- ✅ Model class integration (encode/decode)
- ✅ Never throws errors (returns structured result)
- ✅ Progress tracking for uploads
- ✅ Global configuration support

---

### 2. **React Hook: `useMinder()`**

**Location**: `src/hooks/useMinder.ts`

Reactive wrapper around `minder()` with TanStack Query integration:

```typescript
import { useMinder } from "minder-data-provider";

// Auto-fetch on mount
const { data, loading, error } = useMinder("users");

// Manual fetch control
const { data, refetch } = useMinder("users", { autoFetch: false });

// Mutations
const { mutate, loading } = useMinder("users");
await mutate({ name: "John" }); // Create
```

**Features**:

- ✅ Automatic data fetching
- ✅ Caching and deduplication (TanStack Query)
- ✅ Loading and error states
- ✅ Optimistic updates support
- ✅ SSR/CSR compatible
- ✅ Refetch on window focus/reconnect
- ✅ Polling/interval refetch

---

### 3. **CRUD Hook: `useOneTouchCrud()`**

**Location**: `src/hooks/index.ts`

Complete CRUD operations in one hook:

```typescript
import { useOneTouchCrud } from "minder-data-provider/crud";

const { data, loading, operations } = useOneTouchCrud<User>("users");

// Operations available
await operations.create({ name: "John" });
await operations.update(id, { name: "Jane" });
await operations.delete(id);
await operations.fetch(); // Manual refetch
operations.refresh(); // Invalidate cache
operations.clear(); // Clear cache
```

**Features**:

- ✅ Auto-fetch or manual control
- ✅ Separate loading states (fetch/create/update/delete)
- ✅ Error handling per operation
- ✅ Cache management
- ✅ Background refetch support

---

## 🔐 Authentication & Authorization

### `useAuth()`

**Location**: `src/hooks/index.ts`, `src/auth/index.ts`

```typescript
import { useAuth } from "minder-data-provider/auth";

const auth = useAuth();

// Token management
auth.setToken("jwt-token");
auth.getToken();
auth.clearAuth();
auth.isAuthenticated();

// Refresh tokens
auth.setRefreshToken("refresh-token");
auth.getRefreshToken();
```

### `useCurrentUser()`

**Location**: `src/hooks/index.ts`

```typescript
const { user, isLoggedIn, hasRole, hasPermission } = useCurrentUser();

if (hasRole("admin")) {
  // Admin-only content
}

if (hasPermission("users:write")) {
  // Permission-based access
}
```

**Features**:

- ✅ JWT token management
- ✅ Automatic token refresh
- ✅ Role-based access control (RBAC)
- ✅ Permission-based access
- ✅ Auto-decode JWT payload

---

## 💾 Caching System

### `useCache()`

**Location**: `src/hooks/index.ts`, `src/cache/index.ts`

```typescript
import { useCache } from "minder-data-provider/cache";

const cache = useCache();

// Cache operations
cache.getCachedData("users");
cache.setCachedData("users", data);
cache.invalidateQueries("users");
cache.clearCache("users");
cache.getAllCachedQueries();
cache.isQueryFresh("users");

// Prefetch
await cache.prefetchQuery("users", fetchUsers);
```

**Features**:

- ✅ Memory caching (TanStack Query)
- ✅ Persistent caching (localStorage/AsyncStorage)
- ✅ Cache invalidation
- ✅ Cache freshness checking
- ✅ Prefetch support
- ✅ TTL (Time To Live) support

---

## 🌐 WebSocket & Real-time

### `useWebSocket()`

**Location**: `src/hooks/index.ts`, `src/websocket/index.ts`

```typescript
import { useWebSocket } from "minder-data-provider/websocket";

const ws = useWebSocket();

// Connection
ws.connect();
ws.disconnect();
ws.isConnected();

// Send messages
ws.send("message", { text: "Hello" });

// Subscribe to events
ws.subscribe("newMessage", (data) => {
  console.log("New message:", data);
});
```

**Features**:

- ✅ Auto-reconnection
- ✅ Event subscription system
- ✅ Heartbeat/ping-pong
- ✅ Connection state tracking
- ✅ Message queuing
- ✅ Error handling

---

## 📤 File Upload

### `useMediaUpload()`

**Location**: `src/hooks/index.ts`, `src/upload/index.ts`

```typescript
import { useMediaUpload } from "minder-data-provider/upload";

const { uploadFile, uploadMultiple, progress, isUploading } =
  useMediaUpload("upload");

// Single file
const result = await uploadFile(file);
console.log(result.url, result.size);

// Multiple files
const results = await uploadMultiple([file1, file2]);

// Track progress
console.log(progress.percentage); // 0-100
```

**Features**:

- ✅ Single file upload
- ✅ Multiple file upload
- ✅ Progress tracking
- ✅ Size validation
- ✅ Type validation
- ✅ Chunked upload support

---

## 🔄 State Management

### Redux Integration

**Location**: `src/hooks/index.ts`

```typescript
import { useStore, useReduxSlice } from "minder-data-provider";

// Access Redux store
const store = useStore();
store.getState();
store.dispatch(action);
store.subscribe(listener);

// Use generated slice
const { state, actions, selectors, dispatch } = useReduxSlice("users");
```

### UI State Management

```typescript
import { useUIState } from "minder-data-provider";

const {
  modals,
  notifications,
  loading,
  showModal,
  hideModal,
  addNotification,
  removeNotification,
  setLoading,
} = useUIState();

// Show modal
showModal("confirmDelete");

// Add notification
addNotification({ type: "success", message: "Saved!" });

// Set loading
setLoading("users", true);
```

---

## 🌍 Platform Support

### Platform Detection

**Location**: `src/platform/PlatformDetector.ts`

```typescript
import { PlatformDetector } from "minder-data-provider";

const platform = PlatformDetector.detect();
// Returns: 'web' | 'nextjs' | 'react-native' | 'expo' | 'electron' | 'node'

const isBrowser = PlatformDetector.isBrowser();
const isServer = PlatformDetector.isServer();
const isNative = PlatformDetector.isNative();
```

### Platform Capabilities

**Location**: `src/platform/PlatformCapabilities.ts`

```typescript
import { PlatformCapabilityDetector } from "minder-data-provider";

const capabilities = PlatformCapabilityDetector.getCapabilities();

// Check what's available
if (capabilities.auth.supported) {
  // Use authentication
}

if (capabilities.offline.supported) {
  // Enable offline mode
}

if (capabilities.websockets.native) {
  // Use native WebSocket
}
```

**Detected Capabilities**:

- ✅ Authentication (JWT, OAuth, Biometric, Keychain)
- ✅ Caching (Memory, LocalStorage, AsyncStorage, SecureStore)
- ✅ WebSocket (Native vs Polyfill)
- ✅ CORS (Proxy needed, API routes)
- ✅ File Upload (FormData, DocumentPicker, Dialog)
- ✅ Offline Support (Background sync, Queue management)
- ✅ Push Notifications
- ✅ Security (XSS, CSRF, Secure storage, Certificate pinning)
- ✅ DevTools integration

---

## 📴 Offline Support

### `OfflineManager`

**Location**: `src/platform/offline/OfflineManager.ts`

```typescript
import { OfflineManager } from "minder-data-provider";

const offlineManager = new OfflineManager({
  storage: "localStorage",
  maxQueueSize: 100,
  syncInterval: 30000,
});

// Initialize
await offlineManager.initialize();

// Queue offline requests
offlineManager.queueRequest({
  url: "/api/users",
  method: "POST",
  data: userData,
});

// Sync when online
await offlineManager.sync();

// Get stats
const stats = offlineManager.getSyncStats();
```

**Features**:

- ✅ Request queuing when offline
- ✅ Auto-sync when connection restored
- ✅ Conflict resolution
- ✅ Network state detection
- ✅ Background sync support

---

## 🖥️ SSR/SSG Support

### `SSRManager`

**Location**: `src/platform/ssr/SSRManager.ts`

```typescript
import { SSRManager } from "minder-data-provider/ssr";

// Next.js getServerSideProps
export async function getServerSideProps(context) {
  const ssrManager = new SSRManager();

  await ssrManager.prefetch("users", fetchUsers);

  return {
    props: {
      dehydratedState: ssrManager.dehydrate(),
    },
  };
}

// getStaticProps with ISR
export async function getStaticProps() {
  const ssrManager = new SSRManager({
    enableISR: true,
    revalidate: 60,
  });

  await ssrManager.prefetch("posts", fetchPosts);

  return {
    props: {
      dehydratedState: ssrManager.dehydrate(),
    },
    revalidate: 60,
  };
}
```

**Features**:

- ✅ Server-side rendering (SSR)
- ✅ Static site generation (SSG)
- ✅ Incremental static regeneration (ISR)
- ✅ Data prefetching
- ✅ Hydration support
- ✅ Cookie/header management

---

## 🔧 Configuration & Environment

### `useConfiguration()`

**Location**: `src/hooks/useConfiguration.ts`

```typescript
import { useConfiguration } from "minder-data-provider/config";

const {
  config,
  upgradeToFull,
  updateFeature,
  optimizeForCurrentUsage,
  metrics,
} = useConfiguration({
  monitorPerformance: true,
  monitorSecurity: true,
  autoOptimize: true,
});

// Upgrade to full features
upgradeToFull();

// Update specific feature
updateFeature("cache", { ttl: 60000 });

// Get metrics
console.log(metrics.performance); // latency, cache hit rate, etc.
console.log(metrics.security); // auth attempts, rate limits, etc.
```

### Environment Management

**Location**: `src/hooks/useEnvironment.ts`

```typescript
import { useEnvironment, useProxy } from "minder-data-provider";

const { currentEnvironment, switchEnvironment, config, apiUrl } =
  useEnvironment();

// Switch environments
switchEnvironment("production");
switchEnvironment("staging");
switchEnvironment("development");

// CORS proxy
const { proxyUrl, enableProxy, disableProxy } = useProxy();
```

---

## 🚀 Performance Optimization

### Request Batching

**Location**: `src/utils/performance.ts`

```typescript
import { RequestBatcher } from "minder-data-provider";

const batcher = new RequestBatcher(10); // 10ms delay

// Multiple requests batched into one
await batcher.add("users", () => fetchUsers());
await batcher.add("users", () => fetchUsers()); // Deduped!
```

### Request Deduplication

```typescript
import { RequestDeduplicator } from "minder-data-provider";

const deduplicator = new RequestDeduplicator();

// Only one request sent
await deduplicator.deduplicate("users", fetchUsers);
await deduplicator.deduplicate("users", fetchUsers); // Uses cached promise
```

### Performance Monitoring

```typescript
import { PerformanceMonitor } from "minder-data-provider";

const monitor = new PerformanceMonitor();

monitor.recordRequest("users", 150); // 150ms latency
monitor.recordCacheHit();
monitor.recordError();

const metrics = monitor.getMetrics();
// Returns: requestCount, averageLatency, cacheHitRate, errorRate, slowestRequests
```

### React Performance Hooks

```typescript
import {
  useMemoizedCallback,
  useDebounce,
  useThrottle,
  usePerformanceMonitor,
  useLazyLoad,
  useAbortController,
} from "minder-data-provider";

// Debounce value
const debouncedSearch = useDebounce(searchTerm, 500);

// Throttle value
const throttledScroll = useThrottle(scrollPosition, 100);

// Monitor component performance
usePerformanceMonitor("UserList");

// Lazy load feature
const { Component, loading } = useLazyLoad(() => import("./HeavyComponent"));

// Abort controller for cleanup
const controller = useAbortController();
```

---

## 🛡️ Security Features

### Rate Limiting

**Location**: `src/middleware/rate-limiter.ts`

```typescript
import { RateLimiter, RateLimitPresets } from "minder-data-provider";

// Create rate limiter
const limiter = new RateLimiter(RateLimitPresets.STRICT);

// Check if allowed
const allowed = limiter.checkLimit("user-123", "api-call");

// Next.js middleware
import { createNextRateLimiter } from "minder-data-provider";
export const rateLimiter = createNextRateLimiter({
  windowMs: 60000,
  max: 100,
});

// Express middleware
import { createExpressRateLimiter } from "minder-data-provider";
app.use(createExpressRateLimiter({ max: 100 }));
```

### Security Manager

**Location**: `src/platform/security/SecurityManager.ts`

Features:

- ✅ XSS protection
- ✅ CSRF protection
- ✅ Secure storage (encrypted)
- ✅ Certificate pinning
- ✅ Content Security Policy (CSP)
- ✅ Input sanitization

---

## 🔌 Plugins System

**Location**: `src/plugins/PluginSystem.ts`

```typescript
import { PluginManager } from "minder-data-provider";

const pluginManager = new PluginManager();

// Register plugin
pluginManager.register({
  name: "analytics",
  version: "1.0.0",
  onRequest: (config) => {
    console.log("Request:", config);
    return config;
  },
  onResponse: (response) => {
    console.log("Response:", response);
    return response;
  },
  onError: (error) => {
    console.error("Error:", error);
  },
});

// Execute hooks
await pluginManager.executeHook("onRequest", config);
```

---

## 🐛 Debugging & DevTools

### Debug Manager

**Location**: `src/debug/DebugManager.ts`

```typescript
import { DebugManager, useDebug } from "minder-data-provider/debug";

// Enable debug mode
DebugManager.enable();

// Use in component
const { debug, debugInfo } = useDebug();

debug("User created", userData);
```

### DevTools Component

**Location**: `src/devtools/DevTools.tsx`

```typescript
import { DevTools } from "minder-data-provider";

function App() {
  return (
    <>
      <YourApp />
      <DevTools
        config={{
          position: "bottom-right",
          showNetworkTab: true,
          showCacheTab: true,
          showPerformanceTab: true,
        }}
      />
    </>
  );
}
```

**Features**:

- ✅ Network request monitoring
- ✅ Cache inspection
- ✅ Performance metrics
- ✅ State snapshots
- ✅ Real-time updates

---

## 🎨 Error Handling

### Custom Error Classes

**Location**: `src/errors/MinderError.ts`

```typescript
import {
  MinderError,
  MinderNetworkError,
  MinderValidationError,
  MinderAuthError,
  MinderTimeoutError,
  isMinderError,
  getErrorMessage,
} from "minder-data-provider";

try {
  // Your code
} catch (error) {
  if (isMinderError(error)) {
    console.log(getErrorMessage(error));
    console.log(error.code);
    console.log(error.statusCode);
  }
}
```

### Error Boundary

**Location**: `src/components/MinderErrorBoundary.tsx`

```typescript
import { MinderErrorBoundary } from "minder-data-provider";

<MinderErrorBoundary
  fallback={<ErrorPage />}
  onError={(error, errorInfo) => {
    logError(error);
  }}>
  <YourApp />
</MinderErrorBoundary>;
```

---

## 🎯 Feature Loader (Dynamic Imports)

**Location**: `src/core/FeatureLoader.ts`

```typescript
import { FeatureLoader, createFeatureLoader } from "minder-data-provider";

const loader = createFeatureLoader({
  features: {
    crud: true,
    auth: true,
    websocket: false, // Lazy load
    upload: false, // Lazy load
  },
});

// Load feature on demand
const websocketModule = await loader.load("websocket");
```

---

## 📊 Summary Table

| Feature Category       | Hooks/Components                 | Bundle Impact | Platform Support       |
| ---------------------- | -------------------------------- | ------------- | ---------------------- |
| **Core Data Fetching** | `minder()`, `useMinder()`        | 5KB           | All                    |
| **CRUD Operations**    | `useOneTouchCrud()`              | 8KB           | All                    |
| **Authentication**     | `useAuth()`, `useCurrentUser()`  | 3KB           | All                    |
| **Caching**            | `useCache()`                     | 2KB           | All                    |
| **WebSocket**          | `useWebSocket()`                 | 6KB           | Web, Next.js, Electron |
| **File Upload**        | `useMediaUpload()`               | 4KB           | All                    |
| **Offline Support**    | `OfflineManager`                 | 5KB           | Web, Native, Expo      |
| **SSR/SSG**            | `SSRManager`                     | 3KB           | Next.js, Node          |
| **State Management**   | `useStore()`, `useUIState()`     | 2KB           | All                    |
| **Platform Detection** | `PlatformDetector`               | 1KB           | All                    |
| **Security**           | `RateLimiter`, `SecurityManager` | 4KB           | All                    |
| **Performance**        | Performance hooks                | 3KB           | All                    |
| **Debugging**          | `DevTools`, `DebugManager`       | 8KB           | Dev only               |

**Total Full Bundle**: ~240KB (minified)  
**Minimal Bundle**: ~7KB (minder() + useMinder() only)

---

## 🎯 Next: Create Practical Examples

Now we'll create comprehensive examples showing:

1. **Different approaches** for the same task
2. **When to use each** approach
3. **Performance comparisons**
4. **Real-world scenarios**

Ready to create the example files! 🚀
