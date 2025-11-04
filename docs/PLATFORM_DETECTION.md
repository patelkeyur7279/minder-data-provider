# Platform Detection Usage Examples

## Basic Platform Detection

```typescript
import { PlatformDetector, PlatformCapabilityDetector } from 'minder-data-provider';

// Detect current platform
const platform = PlatformDetector.detect();
console.log('Running on:', platform); // 'web' | 'nextjs' | 'react-native' | 'expo' | 'electron' | 'node'

// Check platform type
if (PlatformDetector.isWeb()) {
  console.log('Running in browser');
}

if (PlatformDetector.isMobile()) {
  console.log('Running on React Native or Expo');
}

if (PlatformDetector.isServer()) {
  console.log('Running on server');
}
```

## Platform Capabilities

```typescript
import { PlatformCapabilityDetector } from 'minder-data-provider';

// Get capabilities for current platform
const capabilities = PlatformCapabilityDetector.getCurrentCapabilities();

// Check if SSR is supported
if (capabilities.ssr) {
  console.log('SSR available! Using getServerSideProps');
}

// Check storage type
console.log('Storage type:', capabilities.cache.storageType);
// Web: 'localStorage'
// React Native: 'AsyncStorage'
// Expo: 'SecureStore'
// Electron: 'electron-store'

// Check if offline support is available
if (capabilities.offline.supported) {
  console.log('Offline mode available!');
  // Enable offline queue, background sync
}

// Check auth capabilities
if (capabilities.auth.types.includes('biometric')) {
  console.log('Biometric auth available (React Native/Expo)');
}
```

## Platform-Specific Code

```typescript
import { PlatformDetector, PlatformCapabilityDetector } from 'minder-data-provider';

function setupStorage() {
  const caps = PlatformCapabilityDetector.getCurrentCapabilities();
  
  switch (caps.cache.storageType) {
    case 'localStorage':
      return new WebStorageAdapter();
    
    case 'AsyncStorage':
      return new NativeStorageAdapter();
    
    case 'SecureStore':
      return new ExpoStorageAdapter();
    
    case 'electron-store':
      return new ElectronStorageAdapter();
    
    default:
      return new MemoryStorageAdapter();
  }
}

// Use in config
const config = {
  baseURL: 'https://api.example.com',
  cache: {
    storage: setupStorage() // Auto-selected based on platform
  }
};
```

## Platform Summary

```typescript
import { PlatformCapabilityDetector } from 'minder-data-provider';

// Get readable summary
const summary = PlatformCapabilityDetector.getCapabilitiesSummary();

console.log('Platform:', summary.platform);
console.log('Supported:', summary.supportedFeatures);
console.log('Not supported:', summary.unsupportedFeatures);

/*
Platform: nextjs
Supported: ['SSR', 'SSG', 'ISR', 'Persistent Cache', 'WebSockets', 'Offline Support', 'Push Notifications', 'XSS Protection', 'CSRF Protection']
Not supported: []
*/
```

## Conditional Features

```typescript
import { PlatformDetector, PlatformCapabilityDetector } from 'minder-data-provider';

const capabilities = PlatformCapabilityDetector.getCurrentCapabilities();

const config = {
  baseURL: 'https://api.example.com',
  
  // Enable CORS proxy only for web
  cors: capabilities.cors.proxyNeeded ? {
    enabled: true,
    proxy: '/api/proxy'
  } : undefined,
  
  // Enable offline queue for mobile
  offline: capabilities.offline.supported ? {
    enabled: true,
    backgroundSync: true
  } : undefined,
  
  // Use secure storage on mobile
  auth: {
    type: 'jwt',
    storage: capabilities.security.secureStorage ? 'secure' : 'memory'
  }
};
```

## Platform Information

```typescript
import { PlatformDetector } from 'minder-data-provider';

const info = PlatformDetector.getInfo();

console.log(info);
/*
{
  platform: 'web',
  isWeb: true,
  isMobile: false,
  isDesktop: false,
  isServer: false,
  isClient: true,
  userAgent: 'Mozilla/5.0...',
  nodeVersion: undefined
}
*/
```
