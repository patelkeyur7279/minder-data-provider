# 🚀 Minder Data Provider v2.0

A comprehensive, production-ready data management solution for Next.js applications that automatically generates React hooks, Redux slices, and handles client/server state with performance, security, and CORS optimizations.

[![npm version](https://badge.fury.io/js/minder-data-provider.svg)](https://badge.fury.io/js/minder-data-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

## ✨ New in v2.0

- **📦 Modular Imports**: Tree-shakeable modules reduce bundle size by up to 87%
- **🔧 Simplified Configuration**: One-line setup with intelligent defaults
- **🔍 Advanced Debug Tools**: Comprehensive debugging with performance monitoring
- **🌐 Flexible SSR/CSR**: Choose rendering strategy per component
- **🛡️ Enhanced Security**: Built-in sanitization, CSRF protection, and rate limiting
- **⚡ Performance Optimizations**: Request deduplication, compression, and lazy loading

## ✨ Core Features

- **🔄 One-Touch CRUD Operations**: Complete CRUD with a single hook call
- **🏪 Hybrid State Management**: TanStack Query + Redux integration
- **🌐 CORS Support**: Built-in CORS handling for cross-origin requests
- **🔌 WebSocket Integration**: Real-time communication with auto-reconnection
- **💾 Advanced Caching**: Multi-level caching with TTL and invalidation
- **🔐 Authentication Management**: Token storage with multiple strategies
- **📁 File Upload Support**: Progress tracking and multiple formats
- **⚡ Optimistic Updates**: Instant UI updates with rollback
- **🛡️ Type Safety**: Full TypeScript support with auto-generated types
- **🎯 Next.js Optimized**: SSR/SSG compatible with hydration support

## 📦 Installation

```bash
npm install minder-data-provider
# or
yarn add minder-data-provider
# or
pnpm add minder-data-provider
```

## 🚀 Quick Start (Simplified)

### 1. Simple Configuration (New in v2.0)

```typescript
// config/minder.config.ts
import { createMinderConfig } from 'minder-data-provider/config';

export const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: {
    users: '/users',    // Auto-generates full CRUD
    posts: '/posts'     // Auto-generates full CRUD
  },
  auth: true,           // Auto-configures authentication
  cache: true,          // Auto-configures caching
  cors: true,           // Auto-configures CORS
  websocket: true,      // Auto-configures WebSocket
  debug: true           // Enables debug mode in development
});
```

### 2. Modular Imports (Tree-Shaking)

```typescript
// Import only what you need (87% smaller bundle)
import { useOneTouchCrud } from 'minder-data-provider/crud';
import { useAuth } from 'minder-data-provider/auth';
import { useCache } from 'minder-data-provider/cache';
import { useDebug } from 'minder-data-provider/debug';

// Or import everything (if you need all features)
import { useOneTouchCrud, useAuth, useCache } from 'minder-data-provider';
```

### 3. Setup Provider

```typescript
// pages/_app.tsx (Next.js Pages Router)
import { MinderDataProvider } from 'minder-data-provider';
import { config } from '../config/minder.config';

export default function App({ children }) {
  return (
    <MinderDataProvider config={config}>
      {children}
    </MinderDataProvider>
  );
}
```

### 4. Use in Components

```typescript
// components/UserManager.tsx
import { useOneTouchCrud, useAuth, useDebug } from 'minder-data-provider';

export function UserManager() {
  const { data: users, loading, operations } = useOneTouchCrud('users');
  const auth = useAuth();
  const debug = useDebug();
  
  const handleCreateUser = async () => {
    debug.startTimer('create-user');
    
    try {
      const newUser = await operations.create({
        name: 'John Doe',
        email: 'john@example.com',
      });
      debug.log('api', 'User created successfully', newUser);
    } catch (error) {
      debug.log('api', 'Failed to create user', error);
    } finally {
      debug.endTimer('create-user');
    }
  };
  
  if (loading.fetch) return <div>Loading users...</div>;
  
  return (
    <div>
      <h2>Users ({users.length})</h2>
      <button onClick={handleCreateUser}>Create User</button>
      
      {users.map(user => (
        <div key={user.id}>
          <span>{user.name} - {user.email}</span>
          <button onClick={() => operations.update(user.id, { name: user.name + ' (Updated)' })}>
            Update
          </button>
          <button onClick={() => operations.delete(user.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

## 🔧 Advanced Features

### Flexible SSR/CSR Support

```typescript
// SSR for SEO-critical pages
import { withSSR, prefetchData } from 'minder-data-provider/ssr';

export async function getServerSideProps() {
  const data = await prefetchData(config, ['users', 'posts']);
  return { props: { initialData: data } };
}

// CSR for interactive components
import { withCSR } from 'minder-data-provider/ssr';

function InteractiveComponent() {
  const { data } = useOneTouchCrud(withCSR('users'));
  // Client-side rendering with real-time updates
}
```

### Advanced Debug Tools

```typescript
import { useDebug } from 'minder-data-provider/debug';

function DebugExample() {
  const debug = useDebug();
  
  // Performance monitoring
  debug.startTimer('api-call');
  await apiCall();
  debug.endTimer('api-call');
  
  // Detailed logging
  debug.log('cache', 'Cache hit for users', { hitRate: '95%' });
  
  // Access from browser console
  // window.__MINDER_DEBUG__.getLogs()
}
```

### Enhanced Security

```typescript
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  security: {
    sanitization: true,        // XSS protection
    csrfProtection: true,      // CSRF tokens
    rateLimiting: {            // Rate limiting
      requests: 100,
      window: 60000
    }
  }
});
```

## 📊 Bundle Size Comparison

| Import Method | Bundle Size | Savings |
|---------------|-------------|---------|
| Full Import | ~150KB | - |
| CRUD Only | ~45KB | 70% smaller |
| Auth Only | ~25KB | 83% smaller |
| Cache Only | ~20KB | 87% smaller |

## 🎯 Available Modules

```typescript
// Modular imports for optimal bundle size
import { useOneTouchCrud } from 'minder-data-provider/crud';      // ~45KB
import { useAuth } from 'minder-data-provider/auth';              // ~25KB
import { useCache } from 'minder-data-provider/cache';            // ~20KB
import { useWebSocket } from 'minder-data-provider/websocket';    // ~15KB
import { useMediaUpload } from 'minder-data-provider/upload';     // ~10KB
import { useDebug } from 'minder-data-provider/debug';            // ~5KB
import { createMinderConfig } from 'minder-data-provider/config'; // ~3KB
import { withSSR, withCSR } from 'minder-data-provider/ssr';      // ~8KB
```

## 🔧 Advanced Configuration

### Complete Configuration (Traditional)

```typescript
import type { MinderConfig } from 'minder-data-provider';

export const config: MinderConfig = {
  apiBaseUrl: 'https://api.example.com',
  
  routes: {
    users: {
      method: 'GET',
      url: '/users',
      cache: true,
      optimistic: true,
    },
    createUser: {
      method: 'POST',
      url: '/users',
      optimistic: true,
    },
  },
  
  // Enhanced Security
  security: {
    sanitization: true,
    csrfProtection: true,
    rateLimiting: {
      requests: 100,
      window: 60000
    }
  },
  
  // Performance Optimizations
  performance: {
    deduplication: true,
    retries: 3,
    compression: true,
    lazyLoading: true
  },
  
  // Advanced Debug
  debug: {
    enabled: true,
    logLevel: 'info',
    performance: true,
    networkLogs: true
  },
  
  // Flexible SSR/CSR
  ssr: {
    enabled: true,
    prefetch: ['users', 'posts'],
    hydrate: true
  }
};
```

## 🌐 SSR/CSG Integration

### Next.js Pages Router

```typescript
// pages/users.tsx
import { GetServerSideProps } from 'next';
import { prefetchData } from 'minder-data-provider/ssr';

export const getServerSideProps: GetServerSideProps = async () => {
  const data = await prefetchData(config, ['users']);
  
  return {
    props: { initialData: data },
  };
};

export default function UsersPage({ initialData }) {
  return (
    <MinderDataProvider config={config}>
      <UsersList initialData={initialData} />
    </MinderDataProvider>
  );
}
```

### Next.js App Router

```typescript
// app/users/page.tsx
import { prefetchData } from 'minder-data-provider/ssr';

export default async function UsersPage() {
  const data = await prefetchData(config, ['users']);
  
  return (
    <MinderDataProvider config={config}>
      <UsersList initialData={data} />
    </MinderDataProvider>
  );
}
```

## 🛡️ Security Features

- **XSS Protection**: Automatic data sanitization
- **CSRF Protection**: Built-in CSRF token handling
- **Rate Limiting**: Configurable request rate limiting
- **Input Validation**: Model-based validation
- **Secure Storage**: Multiple token storage strategies
- **CORS Protection**: Configurable CORS policies

## ⚡ Performance Features

- **Request Deduplication**: Prevents duplicate API calls
- **Intelligent Caching**: Multi-level caching with TTL
- **Optimistic Updates**: Immediate UI updates with rollback
- **Background Refetching**: Keep data fresh without blocking UI
- **Bundle Splitting**: Tree-shakeable modular imports
- **Compression**: Built-in response compression
- **Lazy Loading**: Load features on demand

## 🔍 Debug & Monitoring

```typescript
// Enable debug mode
const config = createMinderConfig({
  debug: true  // Auto-enables in development
});

// Access debug tools
const debug = useDebug();

// Performance monitoring
debug.startTimer('operation');
debug.endTimer('operation');

// Detailed logging
debug.log('api', 'Request completed', { status: 200 });

// Browser console access
window.__MINDER_DEBUG__.getLogs();
window.__MINDER_DEBUG__.getPerformanceMetrics();
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Security audit
npm run security-audit
```

## 🚀 Demo

```bash
# Start demo application
npm run demo

# Build demo for production
npm run demo:build
```

Visit `http://localhost:3000` to see the interactive demo with all v2.0 features.

## 📚 Migration from v1.x

### Simple Migration

```typescript
// v1.x (Complex)
const config = {
  apiBaseUrl: 'https://api.example.com',
  routes: {
    users: { method: 'GET', url: '/users' },
    createUser: { method: 'POST', url: '/users' },
    // ... many route definitions
  },
  auth: { tokenKey: 'token', storage: 'localStorage' },
  // ... complex configuration
};

// v2.0 (Simple)
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' },  // Auto-generates CRUD
  auth: true                    // Auto-configures
});
```

### Bundle Optimization

```typescript
// v1.x (Large bundle)
import { useOneTouchCrud, useAuth } from 'minder-data-provider';

// v2.0 (Optimized bundle)
import { useOneTouchCrud } from 'minder-data-provider/crud';
import { useAuth } from 'minder-data-provider/auth';
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://minder-data-provider.docs.com)
- 💬 [Discord Community](https://discord.gg/minder-data-provider)
- 🐛 [Issue Tracker](https://github.com/minder-data-provider/issues)
- 📧 [Email Support](mailto:support@minder-data-provider.com)

## 🏆 Why Choose Minder Data Provider v2.0?

- **📦 87% Smaller Bundles**: Modular imports reduce bundle size dramatically
- **🔧 Zero Configuration**: Intelligent defaults with one-line setup
- **🔍 Advanced Debugging**: Comprehensive development tools
- **🌐 Flexible Rendering**: Choose SSR/CSR per component
- **🛡️ Enterprise Security**: Built-in security features
- **⚡ Maximum Performance**: Optimized for production workloads
- **🎯 Developer Experience**: Simplified API with powerful features
- **📊 Production Tested**: Battle-tested in production environments

---

**v2.0 Highlights**: Modular Architecture • Simplified Config • Advanced Debug Tools • Flexible SSR/CSR • Enhanced Security • Performance Optimizations

Built with ❤️ for the React/Next.js community