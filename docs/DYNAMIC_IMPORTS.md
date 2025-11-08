# Dynamic Imports & Context Configuration

## 🚨 Required Configuration for Next.js

### The `dynamic` Field is REQUIRED

When using `minder-data-provider` with Next.js, you **MUST** provide the `dynamic` field in your configuration. Without it, the application will fail with errors like "Cannot read properties of null" during SSR.

## Why is `dynamic` Required?

The `dynamic` field is used to lazy-load React Query DevTools, which is a **client-only component**. In Next.js:

1. **SSR (Server-Side Rendering)** - Code runs on the server first
2. **Client Components** - Some components can only run in the browser
3. **Dynamic Imports** - Next.js needs `next/dynamic` to handle client-only components

Without the `dynamic` field:
- ❌ DevTools try to load during SSR
- ❌ Browser-specific code (like `window`) runs on server
- ❌ App crashes with null reference errors

With the `dynamic` field:
- ✅ DevTools only load on the client side
- ✅ SSR works correctly
- ✅ Smaller server bundle size
- ✅ Code-splitting enabled

## Configuration Examples

### ✅ CORRECT - Next.js Configuration

```typescript
// app/providers.tsx or pages/_app.tsx
import dynamic from 'next/dynamic';
import { createMinderConfig } from 'minder-data-provider';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: dynamic,  // ✅ REQUIRED for Next.js
  routes: {
    users: {
      method: 'GET',
      url: '/users'
    }
  }
});

export default config;
```

### ❌ WRONG - Missing dynamic field

```typescript
// This will FAIL in Next.js
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  // ❌ Missing dynamic field
  routes: {
    users: {
      method: 'GET',
      url: '/users'
    }
  }
});
```

## Platform-Specific Requirements

### Next.js (App Router)

```typescript
'use client';  // Required in App Router

import dynamic from 'next/dynamic';
import { createMinderConfig } from 'minder-data-provider';

export const config = createMinderConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  dynamic: dynamic,  // Required
  routes: { /* ... */ }
});
```

### Next.js (Pages Router)

```typescript
// pages/_app.tsx
import dynamic from 'next/dynamic';
import type { AppProps } from 'next/app';
import { MinderDataProvider } from 'minder-data-provider';

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  dynamic: dynamic,  // Required
  routes: { /* ... */ }
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MinderDataProvider config={config}>
      <Component {...pageProps} />
    </MinderDataProvider>
  );
}
```

### React (Vite, Create React App)

```typescript
// dynamic is NOT required for plain React
import { createMinderConfig } from 'minder-data-provider';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: {} as any,  // Provide empty object to satisfy TypeScript
  routes: { /* ... */ }
});
```

### React Native / Expo

```typescript
// dynamic is NOT required for React Native
import { createMinderConfig } from 'minder-data-provider/native';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: {} as any,  // Provide empty object to satisfy TypeScript
  routes: { /* ... */ }
});
```

### Node.js (Server-side only)

```typescript
// dynamic is NOT required for Node.js
import { createMinderConfig } from 'minder-data-provider/node';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: {} as any,  // Provide empty object to satisfy TypeScript
  routes: { /* ... */ }
});
```

## Advanced Configuration

### Custom Dynamic Import Function

You can provide a custom dynamic import function if needed:

```typescript
import dynamic from 'next/dynamic';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: (loader, options) => {
    // Custom dynamic import logic
    return dynamic(loader, {
      ...options,
      loading: () => <div>Loading DevTools...</div>
    });
  },
  routes: { /* ... */ }
});
```

### Disable DevTools in Production

```typescript
import dynamic from 'next/dynamic';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: process.env.NODE_ENV === 'production' 
    ? (() => null) as any  // Disable in production
    : dynamic,
  routes: { /* ... */ }
});
```

## What Gets Dynamically Loaded?

When you provide the `dynamic` field, the following components are lazy-loaded:

1. **React Query DevTools** - Development tools UI
   - Only loads in development mode
   - Not included in production bundle
   - Saves ~200KB from initial bundle

## TypeScript Configuration

The `dynamic` field type is intentionally `any` to support different dynamic import implementations:

```typescript
interface SimpleConfig {
  apiUrl: string;
  dynamic: any;  // Supports next/dynamic, React.lazy, custom loaders
  routes: Record<string, RouteConfig>;
  // ... other fields
}
```

## Troubleshooting

### Error: "dynamic is not defined"

```typescript
// ❌ Wrong - forgot to import
const config = createMinderConfig({
  dynamic: dynamic  // Error: dynamic is not defined
});

// ✅ Correct - import first
import dynamic from 'next/dynamic';

const config = createMinderConfig({
  dynamic: dynamic  // Now it works
});
```

### Error: "Cannot read properties of null"

This usually means the `dynamic` field is missing or incorrect:

```typescript
// ❌ Wrong - missing dynamic
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: {}
});

// ✅ Correct - add dynamic field
import dynamic from 'next/dynamic';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: dynamic,  // Add this
  routes: {}
});
```

### Error: "Text content does not match server-rendered HTML"

Make sure you're using `'use client'` directive in Next.js App Router:

```typescript
'use client';  // Add this at the top

import dynamic from 'next/dynamic';
import { MinderDataProvider } from 'minder-data-provider';

// ... rest of your code
```

## Context API Configuration

### What is Context?

The configuration you create is passed to the `MinderDataProvider` which uses React Context to make it available throughout your application.

### Provider Setup

```typescript
// providers.tsx
'use client';

import { MinderDataProvider } from 'minder-data-provider';
import { config } from './config';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MinderDataProvider config={config}>
      {children}
    </MinderDataProvider>
  );
}
```

### Using Context in Components

```typescript
// components/UserList.tsx
'use client';

import { useMinderContext } from 'minder-data-provider';

export function UserList() {
  const { config, apiClient, authManager } = useMinderContext();
  
  // Access configuration
  console.log('API URL:', config.apiBaseUrl);
  
  // Use API client
  const users = await apiClient.request('users');
  
  return <div>{/* ... */}</div>;
}
```

### Context Value Structure

The MinderContext provides:

```typescript
interface MinderContextValue {
  config: MinderConfig;           // Your configuration
  apiClient: ApiClient;            // HTTP client
  authManager: AuthManager;        // Authentication
  cacheManager: CacheManager;      // Cache management
  websocketManager?: WebSocketManager;
  environmentManager?: EnvironmentManager;
  proxyManager?: ProxyManager;
  debugManager?: DebugManager;
  store: ReduxStore;               // Redux store
  queryClient: QueryClient;        // React Query client
  ReactQueryDevtools?: Component;  // Lazy-loaded DevTools
  dehydratedState?: DehydratedState;
}
```

## Best Practices

### 1. Separate Configuration File

```typescript
// config/minder.config.ts
import dynamic from 'next/dynamic';
import { createMinderConfig } from 'minder-data-provider';

export const minderConfig = createMinderConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  dynamic: dynamic,
  routes: {
    // ... your routes
  }
});
```

```typescript
// app/providers.tsx
import { MinderDataProvider } from 'minder-data-provider';
import { minderConfig } from '@/config/minder.config';

export function Providers({ children }) {
  return (
    <MinderDataProvider config={minderConfig}>
      {children}
    </MinderDataProvider>
  );
}
```

### 2. Environment-Specific Configuration

```typescript
import dynamic from 'next/dynamic';
import { createMinderConfig } from 'minder-data-provider';

const isDev = process.env.NODE_ENV === 'development';

export const config = createMinderConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  dynamic: dynamic,
  debug: {
    enabled: isDev,
    logLevel: isDev ? 'debug' : 'error'
  },
  routes: { /* ... */ }
});
```

### 3. Type Safety

```typescript
import dynamic from 'next/dynamic';
import { createMinderConfig, LogLevel } from 'minder-data-provider';

export const config = createMinderConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  dynamic: dynamic,
  debug: {
    logLevel: LogLevel.DEBUG  // Use enum for type safety
  },
  routes: { /* ... */ }
});
```

## Migration Guide

### From v2.0 to v2.1

In v2.0, the `dynamic` field was optional. In v2.1, it's required:

```typescript
// v2.0 (Old - Still works but not recommended)
const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  // dynamic field was optional
  routes: {}
});

// v2.1 (New - Required for Next.js)
import dynamic from 'next/dynamic';

const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: dynamic,  // Now required
  routes: {}
});
```

## Summary

- ✅ **Next.js**: MUST provide `dynamic: dynamic`
- ✅ **React (Vite/CRA)**: Provide `dynamic: {} as any`
- ✅ **React Native/Expo**: Provide `dynamic: {} as any`
- ✅ **Node.js**: Provide `dynamic: {} as any`
- ✅ Always import from `'next/dynamic'` in Next.js
- ✅ Use `'use client'` in Next.js App Router
- ✅ DevTools only load in development mode
- ✅ Production builds exclude DevTools automatically

---

**Need Help?**
- See [CONFIG_GUIDE.md](./CONFIG_GUIDE.md) for complete configuration options
- See [examples/nextjs](../examples/nextjs) for working Next.js setup
- Open an issue on GitHub if you encounter problems
