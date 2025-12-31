# 🌍 Platform Guide

Comprehensive guide for cross-platform development with Minder Data Provider.

## Table of Contents
1.  [Entry Points & Bundle Sizes](#entry-points--bundle-sizes)
2.  [Platform Detection](#platform-detection)
3.  [Platform Support Matrix](#platform-support-matrix)
4.  [Server-Side Rendering (SSR)](#server-side-rendering-ssr)
5.  [Offline Support](#offline-support)

---

## Entry Points & Bundle Sizes

Minder provides platform-specific entry points to optimize bundle size.

| Platform | Import Path | Size | Features Included |
| :--- | :--- | :--- | :--- |
| **Web** | `minder-data-provider/web` | ~200KB | Browser APIs, WebSocket, Auth |
| **Next.js** | `minder-data-provider/nextjs` | ~200KB | SSR Utils + Web features |
| **Native** | `minder-data-provider/native` | ~200KB | AsyncStorage, Native Utils |
| **Electron**| `minder-data-provider/electron`| ~200KB | FileSystem, ElectronStore |
| **Node.js** | `minder-data-provider/node` | ~150KB | Server Utils (No hooks) |
| **Universal**| `minder-data-provider` | ~240KB | Everything |

### Usage Example
```typescript
// ✅ Recommended: Platform-specific import
import { minder } from 'minder-data-provider/web';

// ❌ Universal (works but larger)
import { minder } from 'minder-data-provider';
```

---

## Platform Detection

Use `PlatformDetector` to write cross-platform code.

```typescript
import { PlatformDetector } from 'minder-data-provider';

if (PlatformDetector.isNative()) {
  console.log("Running on React Native");
}

if (PlatformDetector.isServer()) {
  console.log("Running on Node/SSR");
}

// Get capability summary
// Returns specific capabilities like 'storageType', 'corsNeeded', etc.
import { PlatformCapabilityDetector } from 'minder-data-provider';
const caps = PlatformCapabilityDetector.getCurrentCapabilities();
```

---

## Platform Support Matrix

Current status of platform support in v2.1.

| Platform | Type | Status | Features |
| :--- | :--- | :--- | :--- |
| **Web (React)** | SPA | ✅ Production | Full support |
| **Next.js** | Fullstack | ✅ Production | SSR, SSG, ISR |
| **Node.js** | Backend | ✅ Production | API Client, Scripts |
| **Electron** | Desktop | ✅ Production | File I/O, Dialogs |
| **React Native** | Mobile | 🟡 Beta | Offline, AsyncStore |
| **Expo** | Mobile | 🟡 Beta | SecureStore |

---

## Server-Side Rendering (SSR)

For Next.js or Node.js applications.

### Setup (Next.js)

```typescript
// pages/users.tsx
import { SSRManager } from 'minder-data-provider/ssr';
import { useMinder } from 'minder-data-provider';

export async function getServerSideProps() {
  const ssrManager = new SSRManager();
  
  // Prefetch data on server
  await ssrManager.prefetch('users');

  return {
    props: {
      // Dehydrate to pass to client
      dehydratedState: ssrManager.dehydrate()
    }
  };
}
```

---

## Offline Support

For Web PWAs and React Native/Expo apps.

```typescript
import { OfflineManager } from 'minder-data-provider';

const offlineManager = new OfflineManager({
  storage: 'localStorage', // or 'AsyncStorage'
  syncInterval: 30000
});

// Queue requests automatically when offline
offlineManager.init();

// Build custom UI indicators
const isOnline = offlineManager.isOnline();
```
