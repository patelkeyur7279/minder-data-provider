# 🚀 Multi-Platform Support & Dynamic Bundle - Execution Plan v2.2

> **Goal**: Support all React platforms with platform-specific optimizations while maintaining a unified, simple API
> **NEW**: Complete Docker infrastructure with live statistics dashboard for comprehensive feature testing

---

## 🆕 **IMMEDIATE PRIORITY: Docker & Statistics Implementation**

### **Current Status** (as of v2.1.1):
- ✅ Production-ready package
- ✅ All critical issues fixed
- ✅ 6 platform adapters completed
- ✅ Demo structure exists
- ❌ **Docker configuration empty**
- ❌ **No live statistics dashboard**
- ❌ **No multi-platform testing environment**

### **User Request**: 
"Create multiple platforms and examples with docker containing multiple things like db, backend api etc and including all features and live statistics for showing cache data, ssr/csr rendering etc."

---

## 📋 **Overview**

### **Core Principles**
1. ✅ **One Config, All Platforms** - Same simple config works everywhere
2. ✅ **Platform-Native Features** - Leverage each platform's unique capabilities
3. ✅ **Auto-Detection** - Zero platform configuration needed
4. ✅ **Optimal Bundles** - Load only what each platform needs
5. ✅ **Best Practices** - Follow platform-specific conventions

### **Supported Platforms**
- **Web (React)** - CSR with localStorage, CORS proxy
- **Next.js** - Full SSR/SSG/ISR support with API routes
- **React Native** - Native offline, AsyncStorage, background sync
- **Expo** - Secure storage, managed workflow integrations
- **Electron** - IPC communication, native dialogs, auto-updates
- **Node.js** - Server-side rendering, API middleware

---

## 🎯 **Platform Feature Matrix**

| Feature | Web | Next.js | React Native | Expo | Electron | Node.js |
|---------|-----|---------|--------------|------|----------|---------|
| **CRUD Operations** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Authentication** | ✅ JWT/OAuth | ✅ JWT/OAuth | ✅ Biometric | ✅ SecureStore | ✅ Keychain | ✅ Server |
| **Cache (Memory)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cache (Persistent)** | ✅ localStorage | ✅ localStorage | ✅ AsyncStorage | ✅ SecureStore | ✅ electron-store | ❌ |
| **SSR/SSG** | ❌ | ✅ Full | ❌ | ❌ | ⚠️ Main only | ✅ |
| **WebSockets** | ✅ Native | ✅ Native | ⚠️ Polyfill | ✅ Native | ✅ Native | ✅ Native |
| **File Upload** | ✅ FormData | ✅ API routes | ⚠️ Custom | ✅ DocumentPicker | ✅ Dialog | ❌ |
| **Offline Support** | ⚠️ Limited | ⚠️ Limited | ✅ Full | ✅ Full | ✅ Full | ❌ |
| **Push Notifications** | ⚠️ Web Push | ⚠️ Web Push | ✅ Native | ✅ Expo Push | ✅ Native | ❌ |
| **CORS Proxy** | ✅ Required | ✅ API routes | ❌ | ❌ | ❌ | ❌ |
| **XSS Protection** | ✅ DOMPurify | ✅ DOMPurify | ⚠️ Limited | ⚠️ Limited | ✅ CSP | ✅ |
| **CSRF Protection** | ✅ Tokens | ✅ Tokens | ❌ | ❌ | ⚠️ Different | ✅ |
| **Background Sync** | ⚠️ Service Worker | ⚠️ Service Worker | ✅ Native | ✅ Native | ✅ Native | ❌ |
| **DevTools** | ✅ Browser | ✅ Browser | ✅ RN Debugger | ✅ Expo DevTools | ✅ Browser | ⚠️ CLI |

---

## 📦 **Phase 1: Platform Detection & Capabilities** (Week 1)

### **Branch**: `feature/platform-detection`

### **Step 1.1: Create Platform Detection System**
**File**: `src/platform/PlatformDetector.ts`

```typescript
export type Platform = 'web' | 'nextjs' | 'react-native' | 'expo' | 'electron' | 'node';

export class PlatformDetector {
  private static cache: Platform | null = null;

  static detect(): Platform {
    if (this.cache) return this.cache;

    // Server-side (Node.js)
    if (typeof window === 'undefined') {
      // Check if Next.js
      if (process.env.NEXT_RUNTIME || process.env.__NEXT_PROCESSED_ENV) {
        this.cache = 'nextjs';
        return 'nextjs';
      }
      this.cache = 'node';
      return 'node';
    }

    // Client-side detection
    const win = window as any;

    // Electron
    if (win.electron || win.process?.type === 'renderer') {
      this.cache = 'electron';
      return 'electron';
    }

    // Expo
    if (win.expo || win.ExpoModules) {
      this.cache = 'expo';
      return 'expo';
    }

    // React Native
    if (win.ReactNativeWebView || navigator.product === 'ReactNative') {
      this.cache = 'react-native';
      return 'react-native';
    }

    // Next.js (client-side)
    if (win.__NEXT_DATA__ || win.next) {
      this.cache = 'nextjs';
      return 'nextjs';
    }

    // Default to web
    this.cache = 'web';
    return 'web';
  }

  static reset() {
    this.cache = null;
  }

  static is(platform: Platform): boolean {
    return this.detect() === platform;
  }

  static isWeb(): boolean {
    return this.is('web') || this.is('nextjs');
  }

  static isMobile(): boolean {
    return this.is('react-native') || this.is('expo');
  }

  static isDesktop(): boolean {
    return this.is('electron');
  }

  static isServer(): boolean {
    return this.is('node') || (this.is('nextjs') && typeof window === 'undefined');
  }
}
```

### **Step 1.2: Create Capability Matrix**
**File**: `src/platform/PlatformCapabilities.ts`

```typescript
export interface PlatformCapabilities {
  // Core features
  crud: true;
  auth: {
    supported: boolean;
    types: ('jwt' | 'oauth' | 'biometric' | 'keychain')[];
  };
  cache: {
    memory: true;
    persistent: boolean;
    storageType: 'localStorage' | 'AsyncStorage' | 'SecureStore' | 'electron-store' | null;
  };

  // Rendering
  ssr: boolean;
  ssg: boolean;
  isr: boolean;

  // Network
  websockets: {
    native: boolean;
    polyfillNeeded: boolean;
  };
  cors: {
    proxyNeeded: boolean;
    apiRoutesAvailable: boolean;
  };

  // File operations
  fileUpload: {
    supported: boolean;
    method: 'FormData' | 'DocumentPicker' | 'Dialog' | 'Custom' | null;
  };

  // Mobile features
  offline: {
    supported: boolean;
    backgroundSync: boolean;
    queueManagement: boolean;
  };
  pushNotifications: {
    supported: boolean;
    type: 'web' | 'native' | 'expo' | null;
  };

  // Security
  security: {
    xssProtection: boolean;
    csrfProtection: boolean;
    secureStorage: boolean;
    certificatePinning: boolean;
    csp: boolean;
  };

  // Development
  devTools: {
    supported: boolean;
    type: 'browser' | 'react-native-debugger' | 'expo-dev-tools' | 'cli' | null;
  };
}

export class PlatformCapabilityDetector {
  static getCapabilities(platform: Platform): PlatformCapabilities {
    switch (platform) {
      case 'web':
        return {
          crud: true,
          auth: {
            supported: true,
            types: ['jwt', 'oauth']
          },
          cache: {
            memory: true,
            persistent: true,
            storageType: 'localStorage'
          },
          ssr: false,
          ssg: false,
          isr: false,
          websockets: {
            native: true,
            polyfillNeeded: false
          },
          cors: {
            proxyNeeded: true,
            apiRoutesAvailable: false
          },
          fileUpload: {
            supported: true,
            method: 'FormData'
          },
          offline: {
            supported: true,
            backgroundSync: true, // Service Worker
            queueManagement: true
          },
          pushNotifications: {
            supported: true,
            type: 'web'
          },
          security: {
            xssProtection: true,
            csrfProtection: true,
            secureStorage: false,
            certificatePinning: false,
            csp: true
          },
          devTools: {
            supported: true,
            type: 'browser'
          }
        };

      case 'nextjs':
        return {
          crud: true,
          auth: {
            supported: true,
            types: ['jwt', 'oauth']
          },
          cache: {
            memory: true,
            persistent: true,
            storageType: 'localStorage'
          },
          ssr: true, // ✨ Full SSR support
          ssg: true, // ✨ Full SSG support
          isr: true, // ✨ Incremental Static Regeneration
          websockets: {
            native: true,
            polyfillNeeded: false
          },
          cors: {
            proxyNeeded: false, // Use API routes instead
            apiRoutesAvailable: true
          },
          fileUpload: {
            supported: true,
            method: 'FormData'
          },
          offline: {
            supported: true,
            backgroundSync: true,
            queueManagement: true
          },
          pushNotifications: {
            supported: true,
            type: 'web'
          },
          security: {
            xssProtection: true,
            csrfProtection: true,
            secureStorage: false,
            certificatePinning: false,
            csp: true
          },
          devTools: {
            supported: true,
            type: 'browser'
          }
        };

      case 'react-native':
        return {
          crud: true,
          auth: {
            supported: true,
            types: ['jwt', 'oauth', 'biometric']
          },
          cache: {
            memory: true,
            persistent: true,
            storageType: 'AsyncStorage'
          },
          ssr: false,
          ssg: false,
          isr: false,
          websockets: {
            native: false,
            polyfillNeeded: true
          },
          cors: {
            proxyNeeded: false,
            apiRoutesAvailable: false
          },
          fileUpload: {
            supported: true,
            method: 'Custom'
          },
          offline: {
            supported: true, // ✨ Native offline support
            backgroundSync: true,
            queueManagement: true
          },
          pushNotifications: {
            supported: true,
            type: 'native'
          },
          security: {
            xssProtection: false, // Limited attack vector
            csrfProtection: false,
            secureStorage: true,
            certificatePinning: true,
            csp: false
          },
          devTools: {
            supported: true,
            type: 'react-native-debugger'
          }
        };

      case 'expo':
        return {
          crud: true,
          auth: {
            supported: true,
            types: ['jwt', 'oauth', 'biometric']
          },
          cache: {
            memory: true,
            persistent: true,
            storageType: 'SecureStore' // ✨ Encrypted storage
          },
          ssr: false,
          ssg: false,
          isr: false,
          websockets: {
            native: true,
            polyfillNeeded: false
          },
          cors: {
            proxyNeeded: false,
            apiRoutesAvailable: false
          },
          fileUpload: {
            supported: true,
            method: 'DocumentPicker'
          },
          offline: {
            supported: true,
            backgroundSync: true,
            queueManagement: true
          },
          pushNotifications: {
            supported: true,
            type: 'expo' // ✨ Expo Push Notifications
          },
          security: {
            xssProtection: false,
            csrfProtection: false,
            secureStorage: true,
            certificatePinning: true,
            csp: false
          },
          devTools: {
            supported: true,
            type: 'expo-dev-tools'
          }
        };

      case 'electron':
        return {
          crud: true,
          auth: {
            supported: true,
            types: ['jwt', 'oauth', 'keychain']
          },
          cache: {
            memory: true,
            persistent: true,
            storageType: 'electron-store'
          },
          ssr: false,
          ssg: false,
          isr: false,
          websockets: {
            native: true,
            polyfillNeeded: false
          },
          cors: {
            proxyNeeded: false,
            apiRoutesAvailable: false
          },
          fileUpload: {
            supported: true,
            method: 'Dialog' // ✨ Native file dialogs
          },
          offline: {
            supported: true,
            backgroundSync: true,
            queueManagement: true
          },
          pushNotifications: {
            supported: true,
            type: 'native'
          },
          security: {
            xssProtection: true,
            csrfProtection: true,
            secureStorage: true,
            certificatePinning: false,
            csp: true
          },
          devTools: {
            supported: true,
            type: 'browser'
          }
        };

      case 'node':
        return {
          crud: true,
          auth: {
            supported: true,
            types: ['jwt']
          },
          cache: {
            memory: true,
            persistent: false,
            storageType: null
          },
          ssr: true,
          ssg: true,
          isr: false,
          websockets: {
            native: true,
            polyfillNeeded: false
          },
          cors: {
            proxyNeeded: false,
            apiRoutesAvailable: false
          },
          fileUpload: {
            supported: false,
            method: null
          },
          offline: {
            supported: false,
            backgroundSync: false,
            queueManagement: false
          },
          pushNotifications: {
            supported: false,
            type: null
          },
          security: {
            xssProtection: true,
            csrfProtection: true,
            secureStorage: false,
            certificatePinning: false,
            csp: true
          },
          devTools: {
            supported: true,
            type: 'cli'
          }
        };
    }
  }
}
```

**Commits for Week 1**:
1. `feat: Add PlatformDetector with auto-detection for all platforms`
2. `feat: Add PlatformCapabilityDetector with feature matrix`
3. `test: Add platform detection tests`

---

## 🔌 **Phase 2: Storage Adapters** (Week 2)

### **Branch**: `feature/storage-adapters`

### **Step 2.1: Universal Storage Interface**
**File**: `src/platform/adapters/storage/StorageAdapter.ts`

```typescript
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

export interface StorageAdapterOptions {
  namespace?: string; // Prefix for all keys
  encrypt?: boolean; // Encrypt values
  ttl?: number; // Default TTL in ms
}
```

### **Step 2.2: Platform-Specific Implementations**

**Web Storage** (`src/platform/adapters/storage/WebStorageAdapter.ts`):
```typescript
export class WebStorageAdapter implements StorageAdapter {
  constructor(
    private storage: Storage = localStorage,
    private options: StorageAdapterOptions = {}
  ) {}

  async getItem(key: string): Promise<string | null> {
    const prefixedKey = this.getPrefixedKey(key);
    const value = this.storage.getItem(prefixedKey);
    
    if (!value) return null;
    
    // Check TTL
    if (this.options.ttl) {
      const item = JSON.parse(value);
      if (Date.now() > item.expiresAt) {
        await this.removeItem(key);
        return null;
      }
      return item.value;
    }
    
    return value;
  }

  async setItem(key: string, value: string): Promise<void> {
    const prefixedKey = this.getPrefixedKey(key);
    
    if (this.options.ttl) {
      const item = {
        value,
        expiresAt: Date.now() + this.options.ttl
      };
      this.storage.setItem(prefixedKey, JSON.stringify(item));
    } else {
      this.storage.setItem(prefixedKey, value);
    }
  }

  // ... rest of implementation
}
```

**React Native Storage** (`src/platform/adapters/storage/NativeStorageAdapter.ts`):
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export class NativeStorageAdapter implements StorageAdapter {
  constructor(private options: StorageAdapterOptions = {}) {}

  async getItem(key: string): Promise<string | null> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const value = await AsyncStorage.getItem(prefixedKey);
      
      if (!value) return null;
      
      // Check TTL
      if (this.options.ttl) {
        const item = JSON.parse(value);
        if (Date.now() > item.expiresAt) {
          await this.removeItem(key);
          return null;
        }
        return item.value;
      }
      
      return value;
    } catch (error) {
      console.error('AsyncStorage getItem error:', error);
      return null;
    }
  }

  // ... rest of implementation
}
```

**Expo Storage** (`src/platform/adapters/storage/ExpoStorageAdapter.ts`):
```typescript
import * as SecureStore from 'expo-secure-store';

export class ExpoStorageAdapter implements StorageAdapter {
  constructor(private options: StorageAdapterOptions = {}) {}

  async getItem(key: string): Promise<string | null> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const value = await SecureStore.getItemAsync(prefixedKey);
      
      // SecureStore automatically encrypts! ✨
      
      if (!value) return null;
      
      if (this.options.ttl) {
        const item = JSON.parse(value);
        if (Date.now() > item.expiresAt) {
          await this.removeItem(key);
          return null;
        }
        return item.value;
      }
      
      return value;
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  }

  // ... rest of implementation
}
```

**Electron Storage** (`src/platform/adapters/storage/ElectronStorageAdapter.ts`):
```typescript
// Uses electron-store (installed as peer dependency)
export class ElectronStorageAdapter implements StorageAdapter {
  private store: any;

  constructor(private options: StorageAdapterOptions = {}) {
    if (typeof window !== 'undefined' && (window as any).electron) {
      const Store = require('electron-store');
      this.store = new Store({
        name: options.namespace || 'minder-cache'
      });
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (!this.store) return null;
    
    try {
      const value = this.store.get(key);
      
      if (!value) return null;
      
      if (this.options.ttl) {
        if (Date.now() > value.expiresAt) {
          await this.removeItem(key);
          return null;
        }
        return value.value;
      }
      
      return value;
    } catch (error) {
      console.error('Electron Store getItem error:', error);
      return null;
    }
  }

  // ... rest of implementation
}
```

### **Step 2.3: Storage Adapter Factory**
**File**: `src/platform/adapters/storage/StorageAdapterFactory.ts`

```typescript
export class StorageAdapterFactory {
  static create(
    platform?: Platform,
    options?: StorageAdapterOptions
  ): StorageAdapter {
    const detectedPlatform = platform || PlatformDetector.detect();
    const capabilities = PlatformCapabilityDetector.getCapabilities(detectedPlatform);

    if (!capabilities.cache.persistent) {
      return new MemoryStorageAdapter(options);
    }

    switch (capabilities.cache.storageType) {
      case 'localStorage':
        return new WebStorageAdapter(localStorage, options);
      
      case 'AsyncStorage':
        return new NativeStorageAdapter(options);
      
      case 'SecureStore':
        return new ExpoStorageAdapter(options);
      
      case 'electron-store':
        return new ElectronStorageAdapter(options);
      
      default:
        return new MemoryStorageAdapter(options);
    }
  }
}
```

**Commits for Week 2**:
1. `feat: Add StorageAdapter interface`
2. `feat: Implement WebStorageAdapter for web/Next.js`
3. `feat: Implement NativeStorageAdapter for React Native`
4. `feat: Implement ExpoStorageAdapter with SecureStore`
5. `feat: Implement ElectronStorageAdapter with electron-store`
6. `feat: Add StorageAdapterFactory with auto-selection`
7. `test: Add storage adapter tests for all platforms`

---

## 🌐 **Phase 3: Network Adapters** (Week 3)

### **Branch**: `feature/network-adapters`

### **Step 3.1: Universal Network Interface**
**File**: `src/platform/adapters/network/NetworkAdapter.ts`

```typescript
export interface NetworkRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface NetworkResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface NetworkAdapter {
  request<T = any>(config: NetworkRequest): Promise<NetworkResponse<T>>;
  get<T = any>(url: string, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>>;
  post<T = any>(url: string, data?: any, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>>;
  put<T = any>(url: string, data?: any, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>>;
  patch<T = any>(url: string, data?: any, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>>;
  delete<T = any>(url: string, config?: Partial<NetworkRequest>): Promise<NetworkResponse<T>>;
}
```

### **Step 3.2: Platform Implementations**

**Web/Next.js** - Uses existing Axios implementation
**React Native** - Custom fetch with timeout handling
**Expo** - Uses expo-fetch
**Electron** - IPC-aware implementation

**Commits for Week 3**:
1. `feat: Add NetworkAdapter interface`
2. `feat: Implement platform-specific network adapters`
3. `test: Add network adapter tests`

---

## 🔄 **Phase 4: SSR/SSG Support** (Week 4)

### **Branch**: `feature/ssr-ssg`

### **Step 4.1: Next.js SSR Manager**
**File**: `src/platform/ssr/NextSSRManager.ts`

```typescript
import { dehydrate, Hydrate, QueryClient } from '@tanstack/react-query';

export class NextSSRManager {
  static async getServerSideProps(
    context: any,
    config: MinderConfig,
    prefetchRoutes: string[]
  ) {
    const queryClient = new QueryClient();
    const minder = createMinder(config);

    // Prefetch all specified routes
    await Promise.all(
      prefetchRoutes.map(routeName =>
        queryClient.prefetchQuery({
          queryKey: [routeName],
          queryFn: () => minder.crud.fetch(routeName)
        })
      )
    );

    return {
      props: {
        dehydratedState: dehydrate(queryClient)
      }
    };
  }

  static async getStaticProps(
    context: any,
    config: MinderConfig,
    prefetchRoutes: string[]
  ) {
    const queryClient = new QueryClient();
    const minder = createMinder(config);

    await Promise.all(
      prefetchRoutes.map(routeName =>
        queryClient.prefetchQuery({
          queryKey: [routeName],
          queryFn: () => minder.crud.fetch(routeName)
        })
      )
    );

    return {
      props: {
        dehydratedState: dehydrate(queryClient)
      },
      revalidate: 60 // ISR - revalidate every 60 seconds
    };
  }
}
```

**Usage in Next.js**:
```typescript
// pages/users.tsx
export async function getServerSideProps(context) {
  return NextSSRManager.getServerSideProps(
    context,
    minderConfig,
    ['users', 'posts'] // Routes to prefetch
  );
}

export default function UsersPage({ dehydratedState }) {
  return (
    <Hydrate state={dehydratedState}>
      <UsersList />
    </Hydrate>
  );
}
```

**Commits for Week 4**:
1. `feat: Add NextSSRManager with getServerSideProps helper`
2. `feat: Add getStaticProps and ISR support`
3. `feat: Add TanStack Query dehydration helpers`
4. `docs: Add SSR/SSG usage guide for Next.js`

---

## 📱 **Phase 5: Offline Support** (Week 5)

### **Branch**: `feature/offline-support`

### **Step 5.1: Offline Manager for Mobile**
**File**: `src/platform/offline/OfflineManager.ts`

```typescript
import NetInfo from '@react-native-community/netinfo';

export class OfflineManager {
  private queue: NetworkRequest[] = [];
  private isOnline: boolean = true;

  constructor(private storage: StorageAdapter) {
    this.setupNetworkListener();
    this.loadQueue();
  }

  private async setupNetworkListener() {
    // React Native / Expo
    if (PlatformDetector.isMobile()) {
      NetInfo.addEventListener(state => {
        this.isOnline = state.isConnected ?? false;
        if (this.isOnline) {
          this.processQueue();
        }
      });
    }
    // Web
    else if (PlatformDetector.isWeb()) {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.processQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  async addToQueue(request: NetworkRequest) {
    this.queue.push(request);
    await this.saveQueue();
  }

  private async processQueue() {
    const requests = [...this.queue];
    this.queue = [];

    for (const request of requests) {
      try {
        await this.retryRequest(request);
      } catch (error) {
        // If fails, add back to queue
        this.queue.push(request);
      }
    }

    await this.saveQueue();
  }

  // ... rest of implementation
}
```

**Commits for Week 5**:
1. `feat: Add OfflineManager for mobile platforms`
2. `feat: Add network detection and queue management`
3. `feat: Add background sync for mobile`
4. `test: Add offline support tests`

---

## 📤 **Phase 6: File Upload Adapters** (Week 6)

### **Branch**: `feature/file-upload`

Platform-specific file upload implementations for each platform.

**Commits for Week 6**:
1. `feat: Add FileUploadAdapter interface`
2. `feat: Implement file upload for each platform`
3. `test: Add file upload tests`

---

## 🔒 **Phase 7: Platform Security** (Week 7)

### **Branch**: `feature/platform-security`

Apply appropriate security features per platform.

**Commits for Week 7**:
1. `feat: Add platform-specific security implementations`
2. `feat: Add certificate pinning for mobile`
3. `feat: Add CSP for web/Electron`

---

## 🎁 **Phase 8: Dynamic Feature Loader** (Week 8)

### **Branch**: `feature/dynamic-loader`

### **Step 8.1: Feature Analyzer**
**File**: `src/core/FeatureAnalyzer.ts`

```typescript
export interface FeatureFlags {
  auth: boolean;
  cache: boolean;
  websocket: boolean;
  plugins: boolean;
  devtools: boolean;
  ssr: boolean;
  offline: boolean;
  upload: boolean;
}

export class FeatureAnalyzer {
  static analyze(config: MinderConfig): FeatureFlags {
    const platform = PlatformDetector.detect();
    const capabilities = PlatformCapabilityDetector.getCapabilities(platform);

    return {
      auth: !!config.auth && capabilities.auth.supported,
      cache: !!config.cache && capabilities.cache.persistent,
      websocket: !!config.websocket && capabilities.websockets.native,
      plugins: !!(config.plugins && config.plugins.length > 0),
      devtools: config.debug?.devTools !== false && capabilities.devTools.supported,
      ssr: capabilities.ssr && PlatformDetector.isServer(),
      offline: capabilities.offline.supported,
      upload: capabilities.fileUpload.supported
    };
  }
}
```

### **Step 8.2: Dynamic Feature Loader**
**File**: `src/core/FeatureLoader.ts`

```typescript
export class FeatureLoader {
  private static loadedFeatures = new Set<string>();

  static async loadFeatures(flags: FeatureFlags): Promise<void> {
    const promises: Promise<any>[] = [];

    if (flags.auth && !this.loadedFeatures.has('auth')) {
      promises.push(
        import('../auth/index.js').then(() => {
          this.loadedFeatures.add('auth');
        })
      );
    }

    if (flags.cache && !this.loadedFeatures.has('cache')) {
      promises.push(
        import('../cache/index.js').then(() => {
          this.loadedFeatures.add('cache');
        })
      );
    }

    if (flags.websocket && !this.loadedFeatures.has('websocket')) {
      promises.push(
        import('../websocket/index.js').then(() => {
          this.loadedFeatures.add('websocket');
        })
      );
    }

    if (flags.offline && !this.loadedFeatures.has('offline')) {
      promises.push(
        import('../platform/offline/index.js').then(() => {
          this.loadedFeatures.add('offline');
        })
      );
    }

    if (flags.ssr && !this.loadedFeatures.has('ssr')) {
      promises.push(
        import('../platform/ssr/index.js').then(() => {
          this.loadedFeatures.add('ssr');
        })
      );
    }

    await Promise.all(promises);
  }
}
```

**Commits for Week 8**:
1. `feat: Add FeatureAnalyzer for config-based detection`
2. `feat: Add FeatureLoader with lazy imports`
3. `refactor: Integrate dynamic loading into MinderDataProvider`
4. `test: Add feature loading tests`

---

## 🏗️ **Phase 9: Build Configuration** (Week 9)

### **Branch**: `feature/build-config`

### **Step 9.1: Update tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig([
  // Universal bundle (works everywhere)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist'
  },
  
  // Web-specific bundle (CSR)
  {
    entry: ['src/platform/web.ts'],
    format: ['esm'],
    dts: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist/web',
    external: ['react', 'react-dom']
  },
  
  // Next.js bundle (SSR/SSG)
  {
    entry: ['src/platform/nextjs.ts'],
    format: ['esm'],
    dts: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist/nextjs',
    external: ['react', 'react-dom', 'next']
  },
  
  // React Native bundle
  {
    entry: ['src/platform/native.ts'],
    format: ['esm'],
    dts: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist/native',
    external: ['react', 'react-native', '@react-native-async-storage/async-storage']
  },
  
  // Expo bundle
  {
    entry: ['src/platform/expo.ts'],
    format: ['esm'],
    dts: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist/expo',
    external: ['react', 'react-native', 'expo', 'expo-secure-store']
  },
  
  // Electron bundle
  {
    entry: ['src/platform/electron.ts'],
    format: ['esm'],
    dts: true,
    splitting: true,
    treeshake: true,
    outDir: 'dist/electron',
    external: ['react', 'react-dom', 'electron', 'electron-store']
  }
]);
```

### **Step 9.2: Update package.json**

```json
{
  "name": "minder-data-provider",
  "version": "2.1.0",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./web": {
      "import": "./dist/web/web.js",
      "types": "./dist/web/web.d.ts"
    },
    "./nextjs": {
      "import": "./dist/nextjs/nextjs.js",
      "types": "./dist/nextjs/nextjs.d.ts"
    },
    "./native": {
      "import": "./dist/native/native.js",
      "types": "./dist/native/native.d.ts"
    },
    "./expo": {
      "import": "./dist/expo/expo.js",
      "types": "./dist/expo/expo.d.ts"
    },
    "./electron": {
      "import": "./dist/electron/electron.js",
      "types": "./dist/electron/electron.d.ts"
    }
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "@react-native-async-storage/async-storage": "^1.0.0",
    "expo-secure-store": "^12.0.0",
    "electron-store": "^8.0.0",
    "@react-native-community/netinfo": "^11.0.0"
  },
  "peerDependenciesMeta": {
    "@react-native-async-storage/async-storage": { "optional": true },
    "expo-secure-store": { "optional": true },
    "electron-store": { "optional": true },
    "@react-native-community/netinfo": { "optional": true }
  }
}
```

**Commits for Week 9**:
1. `refactor: Update tsup.config for platform-specific bundles`
2. `refactor: Update package.json exports for all platforms`
3. `test: Validate bundle sizes for each platform`

---

## 📚 **Phase 10: Documentation & Demos** (Week 10)

### **Branch**: `docs/platform-guide`

### **Deliverables**:
1. **PLATFORM_GUIDE.md** - Comprehensive guide for each platform
2. **Demo Apps**:
   - `demo-web/` - React web app
   - `demo-nextjs/` - Next.js with SSR/SSG (existing)
   - `demo-native/` - React Native app
   - `demo-expo/` - Expo app
   - `demo-electron/` - Electron app

**Commits for Week 10**:
1. `docs: Create PLATFORM_GUIDE.md`
2. `feat: Add React Native demo app`
3. `feat: Add Expo demo app`
4. `feat: Add Electron demo app`
5. `docs: Update README with platform support`
6. `chore: Bump version to 2.1.0`

---

## 📊 **Expected Bundle Sizes**

| Platform | Bundle Size (gzipped) | Features Included |
|----------|----------------------|-------------------|
| **Web (CRUD only)** | 15KB | CRUD, Cache |
| **Web (Full)** | 45KB | All features |
| **Next.js (SSR)** | 55KB | All + SSR/SSG |
| **React Native** | 40KB | All + Offline |
| **Expo** | 42KB | All + Expo integrations |
| **Electron** | 48KB | All + IPC |
| **Universal** | 65KB | All platforms |

---

## ✅ **Success Criteria**

- [ ] All platforms auto-detected correctly
- [ ] Platform-specific features work (SSR, offline, etc.)
- [ ] Bundle sizes meet targets
- [ ] Same config works across all platforms
- [ ] Zero breaking changes for existing users
- [ ] Comprehensive tests (>95% coverage)
- [ ] Demo app for each platform
- [ ] Migration guide and documentation

---

## 🚀 **Ready to Start!**

This plan ensures each platform gets:
- ✅ Native features and best practices
- ✅ Optimal bundle size
- ✅ Platform-specific optimizations
- ✅ Zero configuration needed
- ✅ Unified simple API

**Start with Phase 1 (Platform Detection)?** 🎯
