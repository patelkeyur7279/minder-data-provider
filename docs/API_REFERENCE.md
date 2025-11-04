# API Reference

Complete API documentation for Minder Data Provider v2.0.

## Table of Contents

- [Core Modules](#core-modules)
- [CRUD Operations](#crud-operations)
- [Authentication](#authentication)
- [Caching](#caching)
- [WebSocket](#websocket)
- [File Upload](#file-upload)
- [Debugging](#debugging)
- [Configuration](#configuration)
- [Performance](#performance)
- [Security](#security)

---

## Core Modules

### MinderDataProvider

The main provider component that wraps your application.

```typescript
import { MinderDataProvider } from 'minder-data-provider';

<MinderDataProvider config={config}>
  {children}
</MinderDataProvider>
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `config` | `MinderConfig` | Yes | Configuration object |
| `children` | `ReactNode` | Yes | Child components |

---

## CRUD Operations

### useOneTouchCrud

Hook for complete CRUD operations with a single call.

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';

const {
  data,
  loading,
  error,
  operations
} = useOneTouchCrud<T>(route, options);
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `route` | `string` | Yes | API route name |
| `options` | `CrudOptions` | No | Configuration options |

**Returns:**

```typescript
{
  data: T[];                    // Array of items
  loading: {
    fetch: boolean;             // Fetching data
    create: boolean;            // Creating item
    update: boolean;            // Updating item
    delete: boolean;            // Deleting item
  };
  error: Error | null;          // Error state
  operations: {
    create: (data: Partial<T>) => Promise<T>;
    update: (id: string, data: Partial<T>) => Promise<T>;
    delete: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
  };
}
```

**Options:**

```typescript
interface CrudOptions {
  autoFetch?: boolean;          // Auto-fetch on mount (default: true)
  optimistic?: boolean;         // Optimistic updates (default: true)
  cache?: boolean;              // Enable caching (default: true)
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}
```

**Example:**

```typescript
function UsersList() {
  const { data: users, loading, operations } = useOneTouchCrud<User>('users', {
    optimistic: true,
    onSuccess: (user) => console.log('Success:', user),
    onError: (error) => console.error('Error:', error)
  });

  const handleCreate = async () => {
    await operations.create({ 
      name: 'John Doe', 
      email: 'john@example.com' 
    });
  };

  const handleUpdate = async (id: string) => {
    await operations.update(id, { name: 'Jane Doe' });
  };

  const handleDelete = async (id: string) => {
    await operations.delete(id);
  };

  if (loading.fetch) return <div>Loading...</div>;

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>
          <span>{user.name}</span>
          <button onClick={() => handleUpdate(user.id)}>Edit</button>
          <button onClick={() => handleDelete(user.id)}>Delete</button>
        </div>
      ))}
      <button onClick={handleCreate}>Add User</button>
    </div>
  );
}
```

---

## Authentication

### useAuth

Hook for authentication management.

```typescript
import { useAuth } from 'minder-data-provider/auth';

const {
  user,
  isAuthenticated,
  login,
  logout,
  register,
  refresh
} = useAuth();
```

**Returns:**

```typescript
{
  user: User | null;                    // Current user
  isAuthenticated: boolean;              // Auth status
  login: (credentials: Credentials) => Promise<User>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<User>;
  refresh: () => Promise<void>;         // Refresh token
}
```

**Example:**

```typescript
function LoginForm() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      // Redirect to dashboard
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  if (isAuthenticated) {
    return <div>Welcome back!</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

---

## Caching

### useCache

Hook for cache management.

```typescript
import { useCache } from 'minder-data-provider/cache';

const {
  get,
  set,
  invalidate,
  clear
} = useCache();
```

**Methods:**

```typescript
{
  get: <T>(key: string) => T | null;
  set: <T>(key: string, value: T, ttl?: number) => void;
  invalidate: (key: string | RegExp) => void;
  clear: () => void;
}
```

**Example:**

```typescript
function CachedComponent() {
  const cache = useCache();

  useEffect(() => {
    // Set cache with 5 minute TTL
    cache.set('users', users, 300000);
  }, [users]);

  const handleRefresh = () => {
    // Invalidate all user-related cache
    cache.invalidate(/^users/);
  };

  const cachedData = cache.get('users');

  return (
    <div>
      <button onClick={handleRefresh}>Refresh</button>
      {cachedData && <UsersList data={cachedData} />}
    </div>
  );
}
```

---

## WebSocket

### useWebSocket

Hook for WebSocket connections.

```typescript
import { useWebSocket } from 'minder-data-provider/websocket';

const {
  connected,
  send,
  subscribe,
  unsubscribe
} = useWebSocket(url, options);
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `string` | Yes | WebSocket URL |
| `options` | `WebSocketOptions` | No | Connection options |

**Returns:**

```typescript
{
  connected: boolean;
  send: (event: string, data: any) => void;
  subscribe: (event: string, handler: Function) => void;
  unsubscribe: (event: string, handler: Function) => void;
}
```

**Example:**

```typescript
function RealtimeChat() {
  const ws = useWebSocket('wss://api.example.com/chat', {
    autoConnect: true,
    reconnect: true,
    reconnectInterval: 3000
  });

  useEffect(() => {
    const handleMessage = (data: Message) => {
      console.log('New message:', data);
    };

    ws.subscribe('message', handleMessage);

    return () => {
      ws.unsubscribe('message', handleMessage);
    };
  }, []);

  const sendMessage = (text: string) => {
    ws.send('message', { text, timestamp: Date.now() });
  };

  return (
    <div>
      <div>Status: {ws.connected ? 'Connected' : 'Disconnected'}</div>
      <button onClick={() => sendMessage('Hello!')}>Send</button>
    </div>
  );
}
```

---

## File Upload

### useMediaUpload

Hook for file uploads with progress tracking.

```typescript
import { useMediaUpload } from 'minder-data-provider/upload';

const {
  upload,
  progress,
  uploading,
  error
} = useMediaUpload(options);
```

**Returns:**

```typescript
{
  upload: (file: File) => Promise<UploadResult>;
  progress: number;          // 0-100
  uploading: boolean;
  error: Error | null;
}
```

**Example:**

```typescript
function FileUploader() {
  const { upload, progress, uploading } = useMediaUpload({
    maxSize: 10 * 1024 * 1024,  // 10MB
    acceptedTypes: ['image/*', 'application/pdf']
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const result = await upload(file);
        console.log('Upload successful:', result.url);
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      {uploading && <div>Progress: {progress}%</div>}
    </div>
  );
}
```

---

## Debugging

### useDebug

Hook for debugging and performance monitoring.

```typescript
import { useDebug } from 'minder-data-provider/debug';

const debug = useDebug();
```

**Methods:**

```typescript
{
  log: (category: string, message: string, data?: any) => void;
  startTimer: (label: string) => void;
  endTimer: (label: string) => number;
  getMetrics: () => PerformanceMetrics;
  clear: () => void;
}
```

**Example:**

```typescript
function DebugExample() {
  const debug = useDebug();

  const performOperation = async () => {
    debug.startTimer('api-call');
    debug.log('api', 'Starting API call', { endpoint: '/users' });

    try {
      const result = await fetchUsers();
      const duration = debug.endTimer('api-call');
      debug.log('api', 'API call completed', { duration, count: result.length });
    } catch (error) {
      debug.log('error', 'API call failed', error);
    }
  };

  return (
    <div>
      <button onClick={performOperation}>Execute</button>
      <button onClick={() => console.log(debug.getMetrics())}>
        Show Metrics
      </button>
    </div>
  );
}
```

**Browser Console Access:**

```javascript
// Get all logs
window.__MINDER_DEBUG__.getLogs();

// Get performance metrics
window.__MINDER_DEBUG__.getPerformanceMetrics();

// Get cache statistics
window.__MINDER_DEBUG__.getCacheStats();

// Clear logs
window.__MINDER_DEBUG__.clear();
```

---

## Configuration

### createMinderConfig

Create a configuration object with intelligent defaults.

```typescript
import { createMinderConfig } from 'minder-data-provider/config';

const config = createMinderConfig(options);
```

**Options:**

```typescript
interface MinderConfigOptions {
  // Required
  apiUrl: string;
  
  // Routes (auto-generates CRUD)
  routes?: {
    [key: string]: string | RouteConfig;
  };
  
  // Features (boolean = auto-configure)
  auth?: boolean | AuthConfig;
  cache?: boolean | CacheConfig;
  cors?: boolean | CorsConfig;
  websocket?: boolean | WebSocketConfig;
  debug?: boolean | DebugConfig;
  
  // Security
  security?: {
    sanitization?: boolean;
    csrfProtection?: boolean;
    rateLimiting?: {
      requests: number;
      window: number;
    };
  };
  
  // Performance
  performance?: {
    deduplication?: boolean;
    batching?: boolean;
    batchDelay?: number;
    monitoring?: boolean;
    retries?: number;
    compression?: boolean;
  };
  
  // SSR
  ssr?: {
    enabled?: boolean;
    prefetch?: string[];
    hydrate?: boolean;
  };
}
```

**Example:**

```typescript
// Simple configuration
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: {
    users: '/users',      // Auto-generates full CRUD
    posts: '/posts'
  },
  auth: true,             // Auto-configures auth
  cache: true,            // Auto-configures cache
  debug: true             // Enables debug mode
});

// Advanced configuration
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: {
    users: {
      method: 'GET',
      url: '/users',
      cache: true,
      optimistic: true
    }
  },
  auth: {
    tokenKey: 'access_token',
    storage: 'localStorage',
    autoRefresh: true
  },
  security: {
    sanitization: true,
    csrfProtection: true,
    rateLimiting: {
      requests: 100,
      window: 60000
    }
  },
  performance: {
    deduplication: true,
    batching: true,
    monitoring: true
  }
});
```

---

## Performance

### Performance Utilities

```typescript
import { 
  RequestBatcher,
  RequestDeduplicator,
  PerformanceMonitor 
} from 'minder-data-provider/utils/performance';
```

### React Performance Hooks

```typescript
import {
  useDebounce,
  useThrottle,
  useLazyLoad,
  usePerformanceMonitor
} from 'minder-data-provider/utils/performance';
```

**useDebounce Example:**

```typescript
function SearchComponent() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    if (debouncedSearch) {
      // API call with debounced value
      fetchResults(debouncedSearch);
    }
  }, [debouncedSearch]);

  return (
    <input 
      value={search} 
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

**useThrottle Example:**

```typescript
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0);
  const throttledScroll = useThrottle(scrollY, 100);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return <div>Scroll position: {throttledScroll}px</div>;
}
```

**usePerformanceMonitor Example:**

```typescript
function MonitoredComponent() {
  const monitor = usePerformanceMonitor();

  useEffect(() => {
    const metrics = monitor.getMetrics();
    console.log('Performance metrics:', metrics);
  }, []);

  return <div>Check console for metrics</div>;
}
```

---

## Security

### Security Utilities

```typescript
import {
  CSRFTokenManager,
  XSSSanitizer,
  RateLimiter,
  InputValidator
} from 'minder-data-provider/utils/security';
```

**CSRF Protection:**

```typescript
const csrfManager = new CSRFTokenManager();

// Generate token
const token = await csrfManager.generateToken();

// Verify token
const isValid = await csrfManager.verifyToken(token);
```

**XSS Sanitization:**

```typescript
const sanitizer = new XSSSanitizer();

// Sanitize HTML
const clean = sanitizer.sanitize('<script>alert("xss")</script>Hello');
// Result: 'Hello'

// Sanitize object
const cleanData = sanitizer.sanitizeObject({
  name: '<b>John</b>',
  bio: '<script>alert("xss")</script>'
});
```

**Rate Limiting:**

```typescript
const limiter = new RateLimiter({
  requests: 100,
  window: 60000  // 1 minute
});

// Check if allowed
if (limiter.isAllowed('user-123')) {
  // Make API call
} else {
  // Show rate limit error
}
```

**Input Validation:**

```typescript
const validator = new InputValidator();

// Validate email
if (!validator.isValidEmail('test@example.com')) {
  // Show error
}

// Validate URL
if (!validator.isValidUrl('https://example.com')) {
  // Show error
}

// Sanitize input
const clean = validator.sanitize('<script>alert("xss")</script>');
```

---

## TypeScript Types

### Core Types

```typescript
import type {
  MinderConfig,
  RouteConfig,
  AuthConfig,
  CacheConfig,
  CrudOptions,
  PerformanceMetrics
} from 'minder-data-provider';
```

### Type Inference

The library provides full TypeScript support with automatic type inference:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

const { data, operations } = useOneTouchCrud<User>('users');

// data is typed as User[]
// operations.create expects Partial<User>
// operations.update expects (id: string, data: Partial<User>)
```

---

## Error Handling

All hooks and methods provide consistent error handling:

```typescript
const { data, error, operations } = useOneTouchCrud('users');

// Check for errors
if (error) {
  console.error('Error:', error.message);
}

// Try-catch for operations
try {
  await operations.create({ name: 'John' });
} catch (error) {
  console.error('Create failed:', error);
}
```

---

## Best Practices

1. **Use Modular Imports** for smaller bundle sizes
2. **Enable Caching** for frequently accessed data
3. **Use Optimistic Updates** for better UX
4. **Enable Debug Mode** during development
5. **Implement Error Boundaries** for error handling
6. **Use TypeScript** for type safety
7. **Monitor Performance** in production
8. **Enable Security Features** (CSRF, XSS, rate limiting)

---

For more examples, see the [Examples Guide](./EXAMPLES.md) and [Migration Guide](./MIGRATION_GUIDE.md).
