# Platform-Specific Entry Points

## Overview

Minder Data Provider now supports platform-specific entry points for optimal bundle sizes. Import only what you need for your platform!

## Bundle Size Comparison

| Platform | Entry Point | Size | Excludes |
|----------|-------------|------|----------|
| **Web** | `minder-data-provider/web` | ~200KB | SSR, React Native, Electron |
| **Next.js** | `minder-data-provider/nextjs` | ~200KB | React Native, Electron |
| **React Native** | `minder-data-provider/native` | ~200KB | SSR, Web APIs, Electron |
| **Expo** | `minder-data-provider/expo` | ~200KB | SSR, Web APIs, Electron |
| **Electron** | `minder-data-provider/electron` | ~200KB | React Native |
| **Node.js** | `minder-data-provider/node` | ~150KB | React hooks, Browser APIs |
| **Universal** | `minder-data-provider` | ~240KB | Nothing (all platforms) |

## Usage by Platform

### Web (React)

```typescript
import { minder, useMinder, createFeatureLoader } from 'minder-data-provider/web';

// Optimized for browser
// Includes: Web Storage, WebSocket, Auth, Cache
// Excludes: SSR, React Native features

const { data } = await minder('users');
```

### Next.js

```typescript
import { minder, useMinder, createSSRConfig } from 'minder-data-provider/nextjs';

// Includes everything from web + SSR utilities
export async function getServerSideProps() {
  const ssrConfig = createSSRConfig({ ... });
  const data = await minder('users', ssrConfig);
  
  return { props: { data } };
}
```

### React Native

```typescript
import { minder, useMinder } from 'minder-data-provider/native';

// Optimized for mobile
// Includes: AsyncStorage, Auth, Cache, WebSocket
// Excludes: SSR, localStorage, sessionStorage

function App() {
  const { data } = useMinder('users');
  return <View>...</View>;
}
```

### Expo

```typescript
import { minder, useMinder, SecureStorageAdapter } from 'minder-data-provider/expo';

// Includes everything from native + SecureStore
// Automatic encryption for sensitive data

const { data } = await minder('users', {
  storage: new SecureStorageAdapter()
});
```

### Electron

```typescript
import { minder, useMinder, DesktopStorageAdapter } from 'minder-data-provider/electron';

// Includes everything from web + Electron storage
// File-based persistence with electron-store

const { data } = await minder('users', {
  storage: new DesktopStorageAdapter()
});
```

### Node.js (Server-Side)

```typescript
import { minder, FeatureLoader } from 'minder-data-provider/node';

// Server-only features (no React hooks)
// Includes: Memory storage, Auth, SSR utilities

const data = await minder('users');
```

## Dynamic Feature Loading

All platform entries support the FeatureLoader for even smaller bundles:

```typescript
import { createFeatureLoader } from 'minder-data-provider/web';

const loader = createFeatureLoader({
  apiBaseUrl: 'https://api.example.com',
  routes: { ... },
  // Only enable what you need
  auth: { enabled: true },  // +8KB
  cache: { enabled: true }, // +12KB
});

// Estimate your bundle size
console.log(`Bundle: ${loader.estimateBundleSize()}KB`);
```

## Migration Guide

### From Universal Import

**Before:**
```typescript
import { minder } from 'minder-data-provider';
```

**After (Web):**
```typescript
import { minder } from 'minder-data-provider/web';
```

**After (Next.js):**
```typescript
import { minder, createSSRConfig } from 'minder-data-provider/nextjs';
```

**After (React Native):**
```typescript
import { minder } from 'minder-data-provider/native';
```

## Tree-Shaking

Platform-specific imports enable better tree-shaking:

```typescript
// ❌ Universal import (240KB)
import { minder, useMinder } from 'minder-data-provider';

// ✅ Web-specific (200KB, -17% smaller)
import { minder, useMinder } from 'minder-data-provider/web';

// ✅ With feature loader (15-150KB, up to 90% smaller)
import { createFeatureLoader } from 'minder-data-provider/web';
const loader = createFeatureLoader({ 
  apiBaseUrl: '...',
  routes: { ... }
  // Only auth enabled
  auth: { enabled: true }
});
// Result: ~23KB (15KB base + 8KB auth)
```

## TypeScript Support

All platform entries include full TypeScript definitions:

```typescript
import type { 
  MinderConfig, 
  Platform, 
  FeatureFlags 
} from 'minder-data-provider/web';
```

## Platform Detection

Automatic platform detection is built-in:

```typescript
import { PlatformDetector } from 'minder-data-provider/web';

const platform = PlatformDetector.detect();
console.log(platform); // 'web' | 'nextjs' | 'react-native' | etc.

if (PlatformDetector.isWeb()) {
  // Web-specific code
}
```

## Best Practices

1. **Use Platform-Specific Imports**: Always prefer platform-specific imports over universal
2. **Enable Only What You Need**: Use FeatureLoader to minimize bundle size
3. **Lazy Load Features**: Let FeatureLoader dynamically import features
4. **Monitor Bundle Size**: Use `estimateBundleSize()` during development

## Examples

See `/demo` folder for complete examples:
- `demo/web` - React web app
- `demo/nextjs` - Next.js with SSR
- `demo/native` - React Native app (coming soon)
- `demo/expo` - Expo app (coming soon)
- `demo/electron` - Electron desktop app (coming soon)
