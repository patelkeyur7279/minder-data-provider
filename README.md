# 🚀 Minder Data Provider

> **One library. Zero code changes. Scales from prototype to enterprise.**

Universal data management for React, Next.js, React Native, Expo, Node.js, and Electron.

[![npm version](https://badge.fury.io/js/minder-data-provider.svg)](https://www.npmjs.com/package/minder-data-provider)
[![Bundle Size](https://img.shields.io/badge/Bundle-47KB%20(min)-success)](./BUNDLE_ANALYSIS.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](http://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-441%20Passing-success)](./tests)

---

## ✨ Quick Start

```bash
npm install minder-data-provider
```

```typescript
// 1. Configure (config/minder.ts)
import { createMinderConfig } from 'minder-data-provider/config';

export const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' }
});

// 2. Setup Provider (App.tsx)
import { MinderDataProvider } from 'minder-data-provider';

export default function App({ children }) {
  return (
    <MinderDataProvider config={config}>
      {children}
    </MinderDataProvider>
  );
}

// 3. Use in Components
import { useOneTouchCrud } from 'minder-data-provider/crud';

function Users() {
  const { data, loading, operations } = useOneTouchCrud('users');

  return (
    <div>
      <button onClick={() => operations.create({ name: 'John' })}>
        Add User
      </button>
      {data.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

**That's it!** Full CRUD, caching, optimistic updates, and type safety included.

---

## 🎯 Why Choose Minder?

| Problem | Traditional Approach | Minder Solution |
|---------|---------------------|-----------------|
| **Setup Time** | 2-3 days | 10 minutes |
| **Lines of Code** | ~500 lines | ~20 lines |
| **Bundle Size** | ~400KB | 47-250KB |
| **Scaling** | Major refactoring | Zero changes |
| **Type Safety** | Manual types | Auto-generated |
| **Caching** | Manual setup | Auto-configured |
| **Offline** | Custom implementation | One toggle |

---

## 🌐 Platform Support

| Platform | Status | Bundle Size | Use Case |
|----------|--------|-------------|----------|
| 🌐 **Web (React + Vite)** | ✅ Production | 47KB | SPAs, Dashboards |
| ⚡ **Next.js (SSR/SSG)** | ✅ Production | 145KB | SEO, E-commerce |
| 🖥️ **Node.js** | ✅ Production | 120KB | APIs, Microservices |
| 📱 **React Native** | ✅ Production | Variable | iOS, Android |
| 🎯 **Expo** | ✅ Production | Variable | Cross-platform |
| ⚙️ **Electron** | ✅ Production | Variable | Desktop Apps |

**Same code works on ALL platforms!**

---

## 📦 Features

### ✅ Core Features
- **🔄 Full CRUD Operations** - Create, read, update, delete with one hook
- **🎯 Smart Caching** - Multi-level caching with automatic invalidation
- **⚡ Optimistic Updates** - Instant UI updates with automatic rollback
- **🔐 Authentication** - JWT tokens with auto-refresh
- **📡 Real-time** - WebSocket support with auto-reconnection
- **💾 Offline Support** - Queue mutations when offline, sync when online
- **🛡️ Type Safety** - Full TypeScript support with auto-generated types
- **🔍 Developer Tools** - Built-in DevTools panel for debugging

### 🎨 Developer Experience
- **Zero Configuration** - Intelligent defaults, works out of the box
- **Modular Imports** - Import only what you need (87% smaller bundles)
- **Auto-Generated Types** - No manual type definitions needed
- **Smart Error Messages** - Helpful error messages with solutions
- **Hot Module Replacement** - Works seamlessly with Vite/Next.js

### 🛡️ Security
- **XSS Protection** - Automatic input/output sanitization
- **CSRF Protection** - Built-in CSRF token handling
- **Rate Limiting** - Prevent API abuse
- **Secure Storage** - httpOnly cookies by default
- **HTTPS Enforcement** - Automatic HTTPS validation

### ⚡ Performance
- **Request Deduplication** - Prevent duplicate API calls
- **Background Refetching** - Keep data fresh without loading states
- **Bundle Splitting** - Tree-shakeable modules
- **Compression** - Built-in response compression
- **Lazy Loading** - Load features on-demand

---

## 🚀 Scale Without Rewrites

**Write once. Scale forever.**

```typescript
// Same code for ALL scales
const { data, operations } = useOneTouchCrud('users');

// ✅ 10 users      → Simple fetch, basic cache
// ✅ 1K users      → Request deduplication, smart cache  
// ✅ 100K users    → Multi-level cache, background sync
// ✅ 10M users     → Distributed cache, queue system, rate limiting

// ALL AUTOMATIC. ZERO CONFIG REQUIRED.
```

| Stage | Users | Code Changes |
|-------|-------|--------------|
| Prototype | 10 | ✅ 0 changes |
| MVP | 1,000 | ✅ 0 changes |
| Growth | 100,000 | ✅ 0 changes |
| Enterprise | 10,000,000+ | ✅ 0 changes |

---

## 📊 Bundle Analysis

| Configuration | Bundle Size | Use Case |
|--------------|-------------|----------|
| **Minimal** (CRUD only) | 47 KB | Prototypes, MVPs |
| **Standard** (+ Auth + Cache) | 145 KB | Startups, SaaS |
| **Advanced** (+ WebSocket + SSR) | 195 KB | Scale-ups |
| **Enterprise** (Everything) | 250 KB | Large-scale apps |

**Verify yourself:**
```bash
npm run analyze-bundle
```

---

## 🎨 Progressive Enhancement

Start simple. Add features without rewriting code.

```typescript
// Week 1: MVP
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' }
});

// Week 5: Add auth (no code changes in components)
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  auth: true  // ← Just add this
});

// Month 3: Add caching (no code changes in components)
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  auth: true,
  cache: true  // ← Just add this
});

// Month 6: Add real-time (no code changes in components)
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  auth: true,
  cache: true,
  websocket: true  // ← Just add this
});

// YOUR COMPONENTS NEVER CHANGE!
```

---

## 🔧 Configuration Levels

### Level 1: Minimal (2 minutes)

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' }
});
```

**Gets you:** CRUD, optimistic updates, error handling, loading states, type safety  
**Bundle:** ~47KB

### Level 2: Standard (5 minutes)

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users', posts: '/posts' },
  auth: true,     // JWT with auto-refresh
  cache: true,    // Smart caching
  offline: true   // Offline queue
});
```

**Gets you:** Everything from Level 1 + Auth + Caching + Offline support  
**Bundle:** ~145KB

### Level 3: Advanced (10 minutes)

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users', messages: '/messages' },
  auth: true,
  cache: true,
  offline: true,
  websocket: true,  // Real-time
  upload: true,     // File uploads
  debug: true       // DevTools
});
```

**Gets you:** Everything from Level 2 + Real-time + File uploads + Debug tools  
**Bundle:** ~195KB

### Level 4: Enterprise (Use preset)

```typescript
import { createFromPreset } from 'minder-data-provider/config';

const config = createFromPreset('enterprise', {
  apiUrl: 'https://api.example.com',
  routes: { /* your routes */ }
});
```

**Gets you:** All features optimized for production  
**Bundle:** ~250KB

---

## 📚 API Reference

### `useOneTouchCrud(resource)`

Complete CRUD operations with one hook.

```typescript
const { 
  data,           // Resource data
  loading,        // Loading states
  error,          // Error state
  operations      // CRUD operations
} = useOneTouchCrud('users');

// Available operations
await operations.create({ name: 'John' });
await operations.update(id, { name: 'Jane' });
await operations.delete(id);
await operations.refresh();
```

### `useAuth()`

Authentication with auto-refresh.

```typescript
const auth = useAuth();

await auth.login({ email, password });
await auth.logout();
const isAuth = auth.isAuthenticated;
const user = auth.user;
```

### `useCache()`

Cache management and inspection.

```typescript
const cache = useCache();

cache.invalidate('users');
cache.clear();
const stats = cache.getStats();
```

### `useWebSocket(channel)`

Real-time WebSocket connection.

```typescript
const ws = useWebSocket('messages');

ws.on('message', (data) => console.log(data));
ws.send({ text: 'Hello!' });
ws.disconnect();
```

### `useMediaUpload()`

File upload with progress tracking.

```typescript
const upload = useMediaUpload();

const result = await upload.image(file, {
  onProgress: (percent) => console.log(percent),
  resize: { width: 800, height: 800 }
});
```

### `useDebug()`

Performance monitoring and debugging.

```typescript
const debug = useDebug();

debug.startTimer('operation');
// ... your code
debug.endTimer('operation');
debug.log('api', 'Request completed', { status: 200 });
```

---

## 🎯 Modular Imports

Import only what you need for smaller bundles.

```typescript
// Minimal bundle (~47KB)
import { useOneTouchCrud } from 'minder-data-provider/crud';

// Add auth (~25KB more)
import { useAuth } from 'minder-data-provider/auth';

// Add cache (~20KB more)
import { useCache } from 'minder-data-provider/cache';

// Add WebSocket (~15KB more)
import { useWebSocket } from 'minder-data-provider/websocket';

// Add uploads (~10KB more)
import { useMediaUpload } from 'minder-data-provider/upload';

// Add debug (~5KB more)
import { useDebug } from 'minder-data-provider/debug';

// Tree-shaking removes unused code automatically
```

---

## 🌐 Platform Examples

### Web (React + Vite)

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';

function ProductList() {
  const { data, operations } = useOneTouchCrud('products');
  
  return (
    <div>
      {data.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

### Next.js (SSR)

```typescript
import { prefetchData } from 'minder-data-provider/ssr';

export async function getServerSideProps() {
  const data = await prefetchData(config, ['users', 'posts']);
  
  return {
    props: { dehydratedState: data }
  };
}
```

### Node.js (API)

```typescript
import { minder } from 'minder-data-provider';

app.get('/api/users', async (req, res) => {
  const { data } = await minder('users');
  res.json(data);
});
```

### React Native

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';

function UserList() {
  const { data, operations } = useOneTouchCrud('users');
  
  return (
    <FlatList
      data={data}
      renderItem={({ item }) => <UserCard user={item} />}
    />
  );
}
```

---

## 🔍 Advanced Features

### Authentication with Auto-Refresh

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  auth: {
    endpoints: {
      login: '/auth/login',
      refresh: '/auth/refresh',
      logout: '/auth/logout'
    },
    storage: 'cookie',      // Secure httpOnly cookies
    refreshBefore: 300      // Refresh 5min before expiration
  }
});
```

### Multi-Level Caching

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  cache: {
    memory: { ttl: 300000, max: 1000 },
    storage: { ttl: 3600000, max: 10000 },
    strategy: 'stale-while-revalidate'
  }
});
```

### WebSocket with Reconnection

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { messages: '/messages' },
  websocket: {
    url: 'wss://ws.example.com',
    reconnect: true,
    heartbeat: 30000
  }
});
```

### Security Configuration

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },
  security: {
    sanitization: true,
    csrfProtection: true,
    rateLimiting: {
      requests: 1000,
      window: 60000
    }
  }
});
```

### DevTools Integration

```typescript
import { DevTools } from 'minder-data-provider/devtools';

function App() {
  return (
    <>
      <YourApp />
      <DevTools position="bottom-right" />
    </>
  );
}
```

---

## 📖 Documentation

- **[API Reference](./docs/API_REFERENCE.md)** - Complete API documentation
- **[Migration Guide](./docs/MIGRATION_GUIDE.md)** - Upgrade from v1.x to v2.0
- **[Examples](./docs/EXAMPLES.md)** - Real-world code examples
- **[Performance Guide](./docs/PERFORMANCE_GUIDE.md)** - Optimization tips
- **[Security Guide](./SECURITY.md)** - Security best practices

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

**Test Results:**
- ✅ 441 tests passing
- ✅ 85.78% code coverage
- ✅ All features verified

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

## 🆘 Support

- 📖 [Documentation](./docs/API_REFERENCE.md)
- 🐛 [Issue Tracker](https://github.com/patelkeyur7279/minder-data-provider/issues)
- 💬 [Discussions](https://github.com/patelkeyur7279/minder-data-provider/discussions)

---

## 🎉 What Makes Minder Special?

✅ **Zero Configuration** - Works out of the box with intelligent defaults  
✅ **Scales Automatically** - From 10 to 10M users without code changes  
✅ **Platform Agnostic** - Same code on 6+ platforms  
✅ **Modular** - 87% smaller bundles with tree-shaking  
✅ **Type Safe** - Auto-generated TypeScript types  
✅ **Production Ready** - Battle-tested with 441 passing tests  
✅ **Developer Friendly** - Simple API, great DX  
✅ **Secure by Default** - XSS, CSRF, rate limiting built-in  

---

**Built with ❤️ for the React community**

**npm:** [`minder-data-provider`](https://www.npmjs.com/package/minder-data-provider) | **GitHub:** [minder-data-provider](https://github.com/patelkeyur7279/minder-data-provider)
