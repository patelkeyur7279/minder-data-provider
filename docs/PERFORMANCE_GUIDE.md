# Performance Guide

Comprehensive guide to optimizing your application with Minder Data Provider v2.0.

## Table of Contents

- [Bundle Size Optimization](#bundle-size-optimization)
- [Request Optimization](#request-optimization)
- [Caching Strategies](#caching-strategies)
- [React Performance](#react-performance)
- [Network Performance](#network-performance)
- [Memory Management](#memory-management)
- [Monitoring & Profiling](#monitoring--profiling)
- [Best Practices](#best-practices)

---

## Bundle Size Optimization

### Modular Imports

The fastest way to reduce bundle size is using modular imports:

```typescript
// ❌ Bad: Imports everything (~150KB)
import { useOneTouchCrud, useAuth, useCache } from 'minder-data-provider';

// ✅ Good: Imports only what you need (~90KB total)
import { useOneTouchCrud } from 'minder-data-provider/crud';
import { useAuth } from 'minder-data-provider/auth';
import { useCache } from 'minder-data-provider/cache';
```

### Module Sizes

| Module | Size | Use Case |
|--------|------|----------|
| `/crud` | ~45KB | CRUD operations |
| `/auth` | ~25KB | Authentication |
| `/cache` | ~20KB | Caching |
| `/websocket` | ~15KB | Real-time features |
| `/upload` | ~10KB | File uploads |
| `/debug` | ~5KB | Development tools |
| `/config` | ~3KB | Configuration |
| `/ssr` | ~8KB | Server-side rendering |

### Bundle Analysis

```typescript
import { getBundleSizeImpact } from 'minder-data-provider/utils/performance';

const result = getBundleSizeImpact([
  'crud',
  'auth',
  'cache'
]);

console.log('Estimated bundle size:', result.estimatedSize, 'KB');
console.log('Recommendations:', result.recommendations);
```

### Tree Shaking Configuration

Ensure your bundler is configured for tree shaking:

```javascript
// next.config.js
module.exports = {
  webpack: (config) => {
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false
    };
    return config;
  }
};
```

---

## Request Optimization

### Request Deduplication

Automatically prevents duplicate simultaneous requests:

```typescript
// Configuration
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  performance: {
    deduplication: true  // Enabled by default
  }
});

// Example: Multiple components requesting same data
// Only 1 actual API call is made
function UserProfile() {
  const { data } = useOneTouchCrud('users/123');
  return <div>{data.name}</div>;
}

function UserAvatar() {
  const { data } = useOneTouchCrud('users/123');  // Uses same request
  return <img src={data.avatar} />;
}
```

**Benefits:**
- Reduces network calls by ~50-70%
- Prevents race conditions
- Improves response time

### Request Batching

Batch multiple requests into a single API call:

```typescript
import { RequestBatcher } from 'minder-data-provider/utils/performance';

const batcher = new RequestBatcher(10);  // 10ms batch delay

// These will be batched into a single request
Promise.all([
  batcher.add('users', () => fetch('/api/users')),
  batcher.add('users', () => fetch('/api/users')),
  batcher.add('users', () => fetch('/api/users'))
]);
```

**Configuration:**

```typescript
const config = createMinderConfig({
  performance: {
    batching: true,
    batchDelay: 10  // milliseconds
  }
});
```

### Request Retries

Automatic retry for failed requests:

```typescript
const config = createMinderConfig({
  performance: {
    retries: 3,           // Retry up to 3 times
    retryDelay: 1000,     // 1 second between retries
    retryOn: [408, 429, 500, 502, 503, 504]  // HTTP codes to retry
  }
});
```

---

## Caching Strategies

### Cache Configuration

```typescript
const config = createMinderConfig({
  cache: {
    ttl: 300000,          // 5 minutes default TTL
    storage: 'memory',    // or 'localStorage'
    maxSize: 100,         // Max cached items
    invalidationPatterns: [
      /^users/,           // Invalidate all user cache
      /^posts/            // Invalidate all posts cache
    ]
  }
});
```

### Cache Levels

**1. Memory Cache (Fastest)**
```typescript
import { useCache } from 'minder-data-provider/cache';

const cache = useCache();

// Store in memory
cache.set('users', userData, 60000);  // 1 minute TTL
```

**2. Local Storage Cache (Persistent)**
```typescript
const config = createMinderConfig({
  cache: {
    storage: 'localStorage',  // Persists across sessions
    ttl: 3600000             // 1 hour
  }
});
```

**3. HTTP Cache (Browser)**
```typescript
const config = createMinderConfig({
  routes: {
    users: {
      url: '/users',
      cache: true,
      cacheControl: 'max-age=300'  // 5 minutes browser cache
    }
  }
});
```

### Cache Invalidation

```typescript
import { useCache } from 'minder-data-provider/cache';

const cache = useCache();

// Invalidate specific key
cache.invalidate('users');

// Invalidate by pattern
cache.invalidate(/^users-/);

// Clear all cache
cache.clear();
```

### Smart Caching Example

```typescript
function useSmartUserData(userId: string) {
  const cache = useCache();
  const cacheKey = `user-${userId}`;

  // 1. Check cache first
  const cached = cache.get(cacheKey);

  // 2. Fetch from API if not cached
  const { data, loading } = useOneTouchCrud(`users/${userId}`, {
    autoFetch: !cached
  });

  // 3. Update cache when data arrives
  useEffect(() => {
    if (data) {
      cache.set(cacheKey, data, 300000);  // 5 min TTL
    }
  }, [data]);

  return {
    user: cached || data,
    loading: !cached && loading,
    fromCache: !!cached
  };
}
```

---

## React Performance

### Debouncing

Prevent excessive API calls during user input:

```typescript
import { useDebounce } from 'minder-data-provider/utils/performance';

function SearchComponent() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);  // 500ms delay

  // Only triggers API call 500ms after user stops typing
  const { data } = useOneTouchCrud(`search?q=${debouncedSearch}`);

  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  );
}
```

**Performance Impact:**
- Before: 10 API calls (typing "javascript")
- After: 1 API call
- **90% reduction** in API calls

### Throttling

Limit function execution rate:

```typescript
import { useThrottle } from 'minder-data-provider/utils/performance';

function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0);
  const throttledScroll = useThrottle(scrollY, 100);  // Max 1 update per 100ms

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Only re-renders max 10 times per second
  return <div>Scroll: {throttledScroll}px</div>;
}
```

### Lazy Loading

Load components only when needed:

```typescript
import { useLazyLoad } from 'minder-data-provider/utils/performance';

function InfiniteList() {
  const [page, setPage] = useState(1);
  const loadMoreRef = useRef(null);

  const { data, loading } = useOneTouchCrud(`posts?page=${page}`);

  // Automatically loads more when user scrolls to bottom
  useLazyLoad(loadMoreRef, () => {
    if (!loading) {
      setPage(prev => prev + 1);
    }
  });

  return (
    <div>
      {data.map(post => <PostCard key={post.id} post={post} />)}
      <div ref={loadMoreRef}>
        {loading && <Spinner />}
      </div>
    </div>
  );
}
```

### Memoization

Optimize expensive computations:

```typescript
import { useMemoizedCallback } from 'minder-data-provider/utils/performance';

function ExpensiveComponent({ data }) {
  // Memoizes the callback to prevent re-renders
  const processData = useMemoizedCallback((items) => {
    return items.map(item => ({
      ...item,
      computed: expensiveCalculation(item)
    }));
  }, []);

  const processed = useMemo(() => processData(data), [data, processData]);

  return <DataTable data={processed} />;
}
```

---

## Network Performance

### Compression

Enable response compression:

```typescript
const config = createMinderConfig({
  performance: {
    compression: true  // Gzip/Brotli compression
  }
});
```

**Impact:**
- JSON payload: 100KB → 20KB (80% reduction)
- Faster load times on slow connections

### Parallel Requests

Fetch multiple resources simultaneously:

```typescript
async function fetchDashboardData() {
  const [users, posts, stats] = await Promise.all([
    fetch('/api/users'),
    fetch('/api/posts'),
    fetch('/api/stats')
  ]);

  return { users, posts, stats };
}
```

### Request Prioritization

```typescript
const config = createMinderConfig({
  routes: {
    // High priority - loads immediately
    currentUser: {
      url: '/users/me',
      priority: 'high'
    },
    // Low priority - loads in background
    recommendations: {
      url: '/recommendations',
      priority: 'low'
    }
  }
});
```

---

## Memory Management

### Prevent Memory Leaks

```typescript
import { useUnmountCleanup } from 'minder-data-provider/utils/performance';

function Component() {
  const timers = [];

  useUnmountCleanup(() => {
    // Cleanup automatically runs on unmount
    timers.forEach(timer => clearTimeout(timer));
  });

  return <div>...</div>;
}
```

### AbortController

Cancel requests on unmount:

```typescript
import { useAbortController } from 'minder-data-provider/utils/performance';

function SearchResults() {
  const abortController = useAbortController();

  const search = async (query) => {
    try {
      const response = await fetch(`/api/search?q=${query}`, {
        signal: abortController.signal
      });
      // Process response
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request cancelled');
      }
    }
  };

  // Automatically aborts on unmount
  return <div>...</div>;
}
```

### Garbage Collection

```typescript
// Clear large data structures when done
useEffect(() => {
  return () => {
    // Component unmounting - clear data
    largeDataStructure = null;
    cache.clear();
  };
}, []);
```

---

## Monitoring & Profiling

### Performance Monitor

Track application performance in real-time:

```typescript
import { usePerformanceMonitor } from 'minder-data-provider/utils/performance';

function PerformanceDashboard() {
  const monitor = usePerformanceMonitor();

  const metrics = monitor.getMetrics();

  return (
    <div>
      <h2>Performance Metrics</h2>
      <p>Requests: {metrics.requestCount}</p>
      <p>Avg Latency: {metrics.averageLatency}ms</p>
      <p>Cache Hit Rate: {metrics.cacheHitRate}%</p>
      <p>Error Rate: {metrics.errorRate}%</p>

      <h3>Slowest Requests</h3>
      {metrics.slowestRequests.map(req => (
        <div key={req.route}>
          {req.route}: {req.duration}ms
        </div>
      ))}
    </div>
  );
}
```

### Debug Tools

```typescript
import { useDebug } from 'minder-data-provider/debug';

function Component() {
  const debug = useDebug();

  const performOperation = async () => {
    debug.startTimer('operation');

    await fetchData();

    const duration = debug.endTimer('operation');
    debug.log('performance', 'Operation completed', { duration });
  };

  return <button onClick={performOperation}>Execute</button>;
}
```

### Browser DevTools

```javascript
// Access performance data from console
window.__MINDER_DEBUG__.getPerformanceMetrics();

// Output:
// {
//   requestCount: 42,
//   averageLatency: 150,
//   cacheHitRate: 75,
//   errorRate: 2,
//   slowestRequests: [...]
// }
```

### Production Monitoring

```typescript
const config = createMinderConfig({
  performance: {
    monitoring: true,
    onMetrics: (metrics) => {
      // Send to analytics service
      analytics.track('performance', metrics);
    }
  }
});
```

---

## Best Practices

### 1. Use Modular Imports

```typescript
✅ import { useOneTouchCrud } from 'minder-data-provider/crud';
❌ import { useOneTouchCrud } from 'minder-data-provider';
```

### 2. Enable Caching

```typescript
const config = createMinderConfig({
  cache: true,  // Always enable for read-heavy apps
  performance: {
    deduplication: true
  }
});
```

### 3. Optimize Images

```typescript
import { useMediaUpload } from 'minder-data-provider/upload';

const { upload } = useMediaUpload({
  maxSize: 2 * 1024 * 1024,  // 2MB limit
  compress: true,             // Enable compression
  quality: 0.8                // 80% quality
});
```

### 4. Lazy Load Heavy Components

```typescript
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Spinner />,
  ssr: false  // Don't render on server
});
```

### 5. Debounce User Input

```typescript
const debouncedSearch = useDebounce(searchTerm, 300);
```

### 6. Use Optimistic Updates

```typescript
const { operations } = useOneTouchCrud('todos', {
  optimistic: true  // Instant UI updates
});
```

### 7. Monitor in Production

```typescript
const config = createMinderConfig({
  performance: {
    monitoring: true,
    onMetrics: (metrics) => {
      if (metrics.errorRate > 5) {
        alertTeam('High error rate detected');
      }
    }
  }
});
```

### 8. Batch Requests

```typescript
// Instead of 3 separate calls
const users = await fetch('/api/users');
const posts = await fetch('/api/posts');
const comments = await fetch('/api/comments');

// Use batching
const [users, posts, comments] = await Promise.all([
  fetch('/api/users'),
  fetch('/api/posts'),
  fetch('/api/comments')
]);
```

---

## Performance Checklist

Before deploying to production:

- [ ] Use modular imports
- [ ] Enable caching
- [ ] Enable request deduplication
- [ ] Enable compression
- [ ] Implement error boundaries
- [ ] Add performance monitoring
- [ ] Optimize images
- [ ] Lazy load heavy components
- [ ] Debounce user inputs
- [ ] Use optimistic updates
- [ ] Test on slow networks (throttle to 3G)
- [ ] Analyze bundle size
- [ ] Profile React components
- [ ] Check memory leaks
- [ ] Monitor cache hit rates

---

## Performance Targets

| Metric | Target | Good | Needs Work |
|--------|--------|------|------------|
| Bundle Size | <100KB | <150KB | >150KB |
| First Load | <2s | <3s | >3s |
| API Latency | <200ms | <500ms | >500ms |
| Cache Hit Rate | >80% | >60% | <60% |
| Error Rate | <1% | <3% | >3% |

---

For more optimization techniques, see the [API Reference](./API_REFERENCE.md) and [Examples](./EXAMPLES.md).
