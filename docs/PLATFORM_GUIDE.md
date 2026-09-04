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

Bundle-size figures move with every release and are never hand-maintained here — see the
[README "Bundle Cost" section](../README.md#bundle-cost--measured-budgeted-enforced) for
current, reproducible numbers (`npm run measure:bundles`), and
[`docs/product/SUPPORT_MATRIX.md`](./product/SUPPORT_MATRIX.md) for what's covered per
platform. Run `npx minder doctor --bundle` in your own app for a number that reflects your
bundler's real resolution.

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

Current status of platform support as of `2.2.0`. This table used to hand-maintain its own
status labels and went stale; the accurate, evidence-cited status per platform now lives in
one place — [`docs/product/SUPPORT_MATRIX.md`](./product/SUPPORT_MATRIX.md) (also mirrored in
the [README "Platform Support" table](../README.md#platform-support)). At last check, that
includes React 19 (web), Next.js (Pages + App Router), Vite + React, React 18, Remix / React
Router 7, Astro + React islands, React Native / Expo, Electron, Node (server), and Edge
runtimes (Workers, Vercel Edge) — see the linked matrix for exact status labels and evidence.

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
