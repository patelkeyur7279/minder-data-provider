<div align="center">

# Minder Data Provider

A complete data management solution for React applications.  
One hook. Everything included. Works everywhere.

<br>

[![npm version](https://img.shields.io/npm/v/minder-data-provider.svg)](https://www.npmjs.com/package/minder-data-provider)
[![npm downloads](https://img.shields.io/npm/dm/minder-data-provider.svg)](https://www.npmjs.com/package/minder-data-provider)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/minder-data-provider)](https://bundlephobia.com/package/minder-data-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](http://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-1397%20Passing-success)](./tests)

</div>

<br>

## Installation

```bash
npm install minder-data-provider
```

<br>

## Usage

```typescript
import { setGlobalMinderConfig, useMinder } from "minder-data-provider";

// 1. Configure once (in your app entry point)
setGlobalMinderConfig({
  apiBaseUrl: "https://api.example.com",
  routes: {
    users: { method: "GET", url: "/users" },
    posts: { method: "GET", url: "/posts" },
  },
});

// 2. Use anywhere in your app
function UserList() {
  const { data, create, update, delete: remove } = useMinder("users");

  return (
    <div>
      <button onClick={() => create({ name: "John" })}>Add User</button>
      {data.map((user) => (
        <div key={user.id}>
          {user.name}
          <button onClick={() => remove(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

<br>

## Features

| Feature              | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| **CRUD Operations**  | Complete create, read, update, delete operations in one hook   |
| **Authentication**   | Built-in JWT token management, login/logout, auto-refresh      |
| **File Upload**      | Upload files with real-time progress tracking                  |
| **Caching**          | Smart multi-level caching with automatic invalidation          |
| **Infinite Scroll**  | Built-in pagination support for large datasets                 |
| **Real-time**        | WebSocket support for live data updates                        |
| **Offline Support**  | Queue mutations and sync when connection restored              |
| **TypeScript**       | Full type safety with automatic type inference                 |
| **Platform Support** | Works on React, Next.js, React Native, Expo, Electron, Node.js |

<br>

## Quick Examples

### Authentication

```typescript
import { useAuth, useCurrentUser } from "minder-data-provider";

function LoginPage() {
  const auth = useAuth(); // ✅ Dedicated auth hook (recommended)
  const { user, isLoggedIn } = useCurrentUser();

  const handleLogin = async () => {
    await auth.setToken("your-jwt-token");
    // User is now logged in!
  };

  return (
    <div>
      {isLoggedIn ? (
        <div>
          <p>Welcome, {user.name}!</p>
          <button onClick={() => auth.clearAuth()}>Logout</button>
        </div>
      ) : (
        <button onClick={handleLogin}>Login</button>
      )}
    </div>
  );
}

// Also works: Access via useMinder() for data + auth together
function UsersPage() {
  const { data: users, auth } = useMinder("users"); // Works but useAuth() is cleaner
}
```

### File Upload

```typescript
import { useMediaUpload } from "minder-data-provider";

function FileUploader() {
  const { uploadFile, getProgress } = useMediaUpload("media"); // ✅ Dedicated upload hook
  const [progress, setProgress] = useState(0);

  const handleUpload = (file) => {
    uploadFile(file, "upload-id", {
      onProgress: (p) => setProgress(p.percentage),
    });
  };

  return (
    <div>
      <input type='file' onChange={(e) => handleUpload(e.target.files[0])} />
      {progress > 0 && <progress value={progress} max={100} />}
    </div>
  );
}

// Also works: Access via useMinder()
function MediaPage() {
  const { upload } = useMinder("media"); // Works but useMediaUpload() is cleaner
}
```

### Infinite Scroll

```typescript
function BlogFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMinder(
    "posts",
    {
      infinite: true,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  return (
    <div>
      {data?.pages.map((page) =>
        page.posts.map((post) => (
          <article key={post.id}>
            <h2>{post.title}</h2>
            <p>{post.content}</p>
          </article>
        ))
      )}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading..." : "Load More"}
        </button>
      )}
    </div>
  );
}
```

<br>

## Dedicated Hooks

For better code organization, use specialized hooks for specific features:

```typescript
// ✅ Authentication (route-independent)
import { useAuth, useCurrentUser } from "minder-data-provider";
const auth = useAuth();
const { user, isLoggedIn, hasRole } = useCurrentUser();

// ✅ Cache management (global)
import { useCache } from "minder-data-provider";
const { invalidate, prefetch } = useCache();

// ✅ File uploads
import { useMediaUpload } from "minder-data-provider";
const { uploadFile, getProgress } = useMediaUpload("media");

// ✅ WebSocket (real-time)
import { useWebSocket } from "minder-data-provider";
const { connect, subscribe } = useWebSocket();

// ✅ Pagination
import { usePaginatedMinder } from "minder-data-provider";
const { data, fetchNextPage } = usePaginatedMinder("posts");

// ✅ UI state (modals, notifications)
import { useUIState } from "minder-data-provider";
const { showModal, addNotification } = useUIState();
```

> **Note:** `useAuth()`, `useCurrentUser()`, and `useCache()` are **route-independent** and work globally across your app. No route conflicts with your data endpoints!

<br>

## Configuration Options

```typescript
setGlobalMinderConfig({
  apiBaseUrl: "https://api.example.com",
  routes: {
    users: { method: "GET", url: "/users" },
  },
});
```

### Hook Options

```typescript
useMinder("users", {
  // Cache configuration
  staleTime: 5000, // How long data stays fresh
  gcTime: 10000, // When to delete from cache
  queryKey: ["custom-key"], // Custom cache key

  // Pagination
  infinite: true, // Enable infinite scroll
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  initialPageParam: 0,

  // Behavior
  autoFetch: true, // Fetch on mount
  enabled: true, // Enable/disable query
  retryConfig: {
    maxAttempts: 3,
    delay: 1000,
    backoff: "exponential",
  },
});
```

<br>

## Platform Support

| Platform     | Status        | Use Case              |
| ------------ | ------------- | --------------------- |
| React (Web)  | ✅ Production | SPAs, Dashboards      |
| Next.js      | ✅ Production | SSR, SSG, ISR         |
| React Native | ✅ Production | iOS, Android Apps     |
| Expo         | ✅ Production | Cross-platform Mobile |
| Electron     | ✅ Production | Desktop Apps          |
| Node.js      | ✅ Production | APIs, Microservices   |

<br>

## API Reference

### Dedicated Hooks (Recommended)

```typescript
// Authentication (route-independent)
const auth = useAuth();
auth.setToken(token);
auth.getToken();
auth.clearAuth();
auth.isAuthenticated();
auth.setRefreshToken(token);
auth.getRefreshToken();

// Current user info (route-independent)
const { user, isLoggedIn, hasRole, hasPermission } = useCurrentUser();

// Cache management (global)
const cache = useCache();
cache.invalidateQueries(key);
cache.getCachedData(key);
cache.setCachedData(key, data);

// File uploads
const { uploadFile, getProgress, cancelUpload } = useMediaUpload("route");

// WebSocket (real-time)
const ws = useWebSocket();
ws.connect();
ws.subscribe(event, callback);
ws.emit(event, data);

// Pagination
const { data, fetchNextPage, hasNextPage } = usePaginatedMinder("route");
```

### useMinder() Returns

```typescript
const {
  // Data & State
  data,              // Your data
  loading,           // Loading states
  error,             // Error info

  // CRUD Operations
  create,            // Create item
  update,            // Update item
  delete,            // Delete item

  // Authentication
  auth: {
    setToken,        // Login
    clearAuth,       // Logout
    isAuthenticated, // Check if logged in
    getCurrentUser,  // Get user info
    getTokenExpiryTime
  },

  // File Upload
  upload: {
    uploadFile,      // Upload with progress
    getProgress,     // Get upload progress
  },

  // Cache Control
  cache: {
    invalidate,      // Refresh data
    clear,           // Clear cache
    prefetch,        // Pre-load data
  },

  // Pagination
  fetchNextPage,     // Infinite scroll
  hasNextPage,       // More data available?
  isFetchingNextPage,

  // Advanced
  cancel,            // Cancel request
  isCancelled,       // Check if cancelled
  websocket,         // Real-time updates

} = useMinder('routeName', options);
```

<br>

## What's New in v2.1.1

- 🐛 **Critical Bug Fixes** - Fixed 5 critical bugs found in production
- ✅ **CRUD Params Support** - All operations now properly pass dynamic parameters
- ✅ **DevTools Production Fix** - DevTools respect debug.enabled flag
- ✅ **JWT Parsing Safety** - Graceful handling of malformed tokens
- ✅ **WebSocket Memory Fix** - Proper cleanup to prevent memory leaks
- ✅ **TypeScript Improvements** - Complete type safety for all operations
- 📚 **Better Documentation** - Dedicated hooks highlighted (useAuth, useCurrentUser, useCache)
- 🧪 **27 New Tests** - All critical bugs covered with comprehensive tests

### What's New in v2.1.0

- ✅ **No Provider Required** - Global config works everywhere
- ✅ **Standalone Auth** - JWT parsing, auto-refresh, expiry checking
- ✅ **Shared Upload Progress** - All components see same progress
- ✅ **Smart Route Validation** - Helpful error suggestions
- ✅ **Infinite Scroll** - Built-in pagination support
- ✅ **Custom Query Keys** - Full cache control
- ✅ **Request Cancellation** - Prevent race conditions
- ✅ **Per-Hook Retry** - Custom retry per request

<br>

## Comparison

| Feature            | Minder      | React Query | SWR         | Apollo      |
| ------------------ | ----------- | ----------- | ----------- | ----------- |
| CRUD Operations    | ✅ Built-in | ❌ Manual   | ❌ Manual   | ⚠️ GraphQL  |
| Authentication     | ✅ Built-in | ❌ External | ❌ External | ❌ External |
| File Upload        | ✅ Built-in | ❌ External | ❌ External | ❌ External |
| Real-time          | ✅ Built-in | ❌ External | ❌ External | ✅ Limited  |
| No Provider Needed | ✅ Yes      | ✅ Yes      | ✅ Yes      | ❌ No       |
| Learning Curve     | ✅ 5 min    | 📚 Hours    | 📚 Hours    | 📚 Days     |

<br>

## Documentation

- **[API Reference](./docs/API_REFERENCE.md)** - Complete API documentation
- **[Config Guide](./docs/CONFIG_GUIDE.md)** - Configuration options
- **[Examples](./docs/EXAMPLES.md)** - Real-world examples
- **[Migration Guide](./docs/MIGRATION_GUIDE.md)** - Upgrade guide
- **[Security Guide](./SECURITY.md)** - Security best practices

<br>

## Testing

```bash
npm test              # Run all tests
npm run test:coverage # With coverage report
```

**Test Status**: 1,397 tests passing (100%)

<br>

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

<br>

## License

MIT License - see [LICENSE](LICENSE) for details.

<br>

## Support

- 📖 [Documentation](./docs/API_REFERENCE.md)
- 💬 [Discord Community](https://discord.gg/dN3eFFjmfy)
- 🐛 [Issue Tracker](https://github.com/patelkeyur7279/minder-data-provider/issues)
- 📧 [Email](mailto:patelkeyur7279@gmail.com)

<br>
<br>

<div align="center">

**Built with ❤️ for the React community**

**v2.1.1** - November 2025

</div>

```

```
