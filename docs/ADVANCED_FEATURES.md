# 🔥 Advanced Features

Deep dive into Minder Data Provider's advanced capabilities.

## Table of Contents
1.  [Security](#security)
2.  [Performance Optimization](#performance-optimization)
3.  [State Management](#state-management)
4.  [Plugin System](#plugin-system)
5.  [Error Handling](#error-handling)

---

## Security

### Rate Limiting
Protect your API from spam directly from the client/middleware.

```typescript
import { RateLimiter, RateLimitPresets } from 'minder-data-provider/utils/security';

const limiter = new RateLimiter(RateLimitPresets.STRICT);

if (!limiter.checkLimit('user-id', 'api-call')) {
  throw new Error('Too many requests');
}
```

### Security Manager
Handles XSS sanitization, CSRF tokens, and secure storage encryption.

```typescript
import { SecurityManager } from 'minder-data-provider';
// Automatically active with 'standard' or 'enterprise' presets
```

---

## Performance Optimization

### Request Batching
Combines multiple API calls within a time window (default 50ms) into a single request, if supported by your API.

```typescript
import { RequestBatcher } from 'minder-data-provider/utils/performance';
// Configured via 'performance.batching' in configureMinder()
```

### Request Deduplication
Prevents duplicate identical requests from being in-flight simultaneously.
```typescript
// Configured via 'performance.deduplication' in configureMinder()
```

### Performance Monitoring
Track latency and cache hit rates.

```typescript
import { usePerformanceMonitor } from 'minder-data-provider/utils/performance';

function Monitor() {
  const metrics = usePerformanceMonitor();
  console.log(metrics.getMetrics()); 
  // { requestCount, averageLatency, cacheHitRate, ... }
}
```

---

## State Management

### Redux Integration
Minder exposes its internal Redux store if you need to dispatch manually or read state without hooks.

```typescript
import { useStore, useReduxSlice } from 'minder-data-provider';

function MyComponent() {
  const store = useStore();
  
  // Create a slice on the fly
  const { actions, selectors } = useReduxSlice('custom-data');
}
```

### UI State
Built-in helper for managing UI states like modals and notifications.

```typescript
import { useUIState } from 'minder-data-provider';

const { showModal, addNotification } = useUIState();
addNotification({ type: 'success', message: 'Saved!' });
```

---

## Plugin System

Extend Minder with custom plugins.

```typescript
import { PluginManager } from 'minder-data-provider/plugins';

const pluginManager = new PluginManager();

pluginManager.register({
  name: 'my-logger',
  onRequest: (config) => {
    console.log('Intercepted request:', config);
    return config;
  }
});
```

---

## Error Handling

Minder provides typed error classes for better handling.

```typescript
import { 
  MinderError, 
  isMinderError 
} from 'minder-data-provider/errors';

try {
  await minder('users');
} catch (error) {
  if (isMinderError(error)) {
    console.error(error.code); // e.g. 'NETWORK_ERROR'
    console.error(error.statusCode); // 404
  }
}
```

### Error Boundary
Wrap your app to catch React errors.

```typescript
import { MinderErrorBoundary } from 'minder-data-provider';

<MinderErrorBoundary fallback={<ErrorPage />}>
  <App />
</MinderErrorBoundary>
```
