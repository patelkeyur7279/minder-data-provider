# 🚀 Minder Data Provider - Improvement Plan for 2.0.3

**Date:** 11 November 2025  
**Current Version:** 2.0.3  
**Target:** 2.0.3 Stable Release  
**Strategy:** Feature branches with comprehensive testing

---

## 📋 Requirements Analysis

### 1. **Single Configuration System** ✅

**Current State:**

- ❌ Two config systems: `createMinderConfig` + `configureMinder`
- ❌ Confusing for users
- ❌ Duplicate code

**Target:**

- ✅ One config function: `configureMinder()`
- ✅ Simple, intuitive API
- ✅ Backward compatible

**Current Issues Found:**

```typescript
// src/config/index.ts has TWO systems:
export function createMinderConfig(simple: SimpleConfig): MinderConfig {}
export function configureMinder(config: UnifiedMinderConfig): MinderConfig {}
```

**Solution:**

- Keep only `configureMinder()`
- Deprecate `createMinderConfig` with migration guide
- Update all internal usage

---

### 2. **Dynamic Dependencies** ✅

**Current State:**

```json
"dependencies": {
  "@reduxjs/toolkit": "2.9.2",      // ❌ Always loaded
  "@tanstack/react-query": "5.90.6", // ❌ Always loaded
  "axios": "1.13.1"                  // ❌ Always loaded
}
```

**Target:**

- ✅ Lazy load TanStack Query only when cache features used
- ✅ Lazy load Redux Toolkit only when state management used
- ✅ Lazy load Axios only when HTTP features used

**Implementation:**

```typescript
// Dynamic imports:
const { useQuery } = await import("@tanstack/react-query");
const { configureStore } = await import("@reduxjs/toolkit");
const axios = await import("axios");
```

**Bundle Size Impact:**

- Current main bundle: 160 KB
- Target after optimization: < 50 KB (core only)
- Additional features loaded on demand

---

### 3. **Single Hook for Everything** ✅

**Current State:**

- ✅ `useMinder()` exists
- ❌ Also have: `useAuth()`, `useCache()`, `useWebSocket()`, etc.
- ❌ Confusing which to use

**Target:**

```typescript
// ONE hook for EVERYTHING:
const {
  data,
  loading,
  error, // Data fetching
  operations, // CRUD operations
  auth, // Authentication
  cache, // Cache control
  websocket, // WebSocket
  upload, // File upload
} = useMinder("users");
```

**Current Analysis:**

```
src/hooks/
├── useMinder.ts          ✅ Main hook
├── useAuth.ts            ❌ Remove, integrate into useMinder
├── useCache.ts           ❌ Remove, integrate into useMinder
├── useWebSocket.ts       ❌ Remove, integrate into useMinder
├── useMediaUpload.ts     ❌ Remove, integrate into useMinder
└── index.ts              ⚠️ Update exports
```

---

### 4. **Platform Capabilities** ✅

**Current State:**

- ✅ Platform detection working
- ✅ Platform adapters exist
- ⚠️ Need to verify all platforms work

**Platforms to Test:**

1. **Web (React + Vite)** - ✅ Verified working
2. **Next.js (SSR/SSG)** - ⚠️ Needs testing
3. **React Native** - ⚠️ Needs testing
4. **Expo** - ⚠️ Needs testing
5. **Electron** - ⚠️ Needs testing
6. **Node.js** - ✅ Verified working

**Test Plan:**

- Create test app for each platform
- Verify all features work
- Document platform-specific quirks
- Ensure no limitations

---

### 5. **Configurable Everything** ✅

**Current State:**

```typescript
interface MinderConfig {
  auth?: AuthConfig; // ✅ Configurable
  cache?: CacheConfig; // ✅ Configurable
  websocket?: WebSocketConfig; // ✅ Configurable
  performance?: PerformanceConfig; // ✅ Configurable
  security?: SecurityConfig; // ✅ Configurable
  debug?: DebugConfig; // ✅ Configurable
}
```

**Target:**

- ✅ Every feature fully configurable
- ✅ Sensible defaults for quick start
- ✅ Deep customization when needed

**Configuration Levels:**

```typescript
// Level 1: Quick start (defaults)
configureMinder({
  apiUrl: "https://api.example.com",
});

// Level 2: Feature toggles
configureMinder({
  apiUrl: "https://api.example.com",
  auth: true,
  cache: true,
  websocket: true,
});

// Level 3: Deep customization
configureMinder({
  apiUrl: "https://api.example.com",
  auth: {
    storage: StorageType.COOKIE,
    tokenKey: "custom_token",
    refreshUrl: "/auth/refresh",
    onAuthError: (error) => {
      /* custom handler */
    },
  },
  cache: {
    staleTime: 300000,
    gcTime: 600000,
    onCacheHit: (key) => {
      /* analytics */
    },
  },
});
```

---

### 6. **Performance + Security + Reliability** ✅

**Performance Metrics:**

- [ ] Bundle size < 50 KB (core)
- [ ] First load < 100ms
- [ ] Time to interactive < 200ms
- [ ] Cache hit rate > 80%
- [ ] Request deduplication working

**Security Checklist:**

- [ ] XSS protection enabled
- [ ] CSRF protection working
- [ ] Secure token storage
- [ ] Input validation
- [ ] Rate limiting functional

**Reliability Tests:**

- [ ] Error handling comprehensive
- [ ] Retry logic working
- [ ] Offline support functional
- [ ] Network recovery automatic
- [ ] Memory leaks prevented

---

## 🎯 Implementation Plan

### Phase 1: Analysis & Planning (Current)

**Branch:** `improvements-for-2.0.3` (current)

**Tasks:**

- [x] Analyze current codebase
- [x] Test actual package functionality
- [x] Identify issues and requirements
- [ ] Create detailed implementation plan
- [ ] Set up branch strategy

**Deliverables:**

- This document
- END_USER_VERIFICATION.md
- RELEASE_2.0.3_ANALYSIS.md

---

### Phase 2: Single Configuration System

**Branch:** `feature/unified-config`
**Based on:** `improvements-for-2.0.3`

**Tasks:**

1. Remove `createMinderConfig` function
2. Keep only `configureMinder()`
3. Update all internal references
4. Add migration guide
5. Update documentation
6. Test configuration in all platforms

**Files to Modify:**

```
src/config/index.ts           - Remove createMinderConfig
src/config/presets.ts         - Integrate into configureMinder
docs/CONFIG_GUIDE.md          - Update examples
docs/MIGRATION_GUIDE.md       - Add migration section
README.md                     - Update quick start
examples/                     - Update all examples
```

**Testing:**

```bash
# Test 1: Basic config
const config = configureMinder({ apiUrl: 'https://api.example.com' });

# Test 2: With features
const config = configureMinder({
  apiUrl: 'https://api.example.com',
  auth: true,
  cache: true
});

# Test 3: Advanced config
const config = configureMinder({
  apiUrl: 'https://api.example.com',
  auth: { storage: StorageType.COOKIE }
});
```

**Success Criteria:**

- [ ] Only one config function exists
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Example projects working
- [ ] No breaking changes for users using configureMinder

---

### Phase 3: Dynamic Dependencies

**Branch:** `feature/dynamic-deps`
**Based on:** `feature/unified-config`

**Tasks:**

1. Make TanStack Query dynamic
2. Make Redux Toolkit dynamic
3. Make Axios dynamic
4. Update FeatureLoader
5. Test bundle sizes
6. Verify tree-shaking works

**Implementation Strategy:**

```typescript
// src/core/FeatureLoader.ts
export class FeatureLoader {
  private async loadQueryClient() {
    if (!this.queryClient) {
      const { QueryClient } = await import("@tanstack/react-query");
      this.queryClient = new QueryClient();
    }
    return this.queryClient;
  }

  private async loadRedux() {
    if (!this.store) {
      const { configureStore } = await import("@reduxjs/toolkit");
      this.store = configureStore({
        /* config */
      });
    }
    return this.store;
  }

  private async loadHttpClient() {
    if (!this.axios) {
      const axios = await import("axios");
      this.axios = axios.default;
    }
    return this.axios;
  }
}
```

**Bundle Analysis:**

```bash
# Before
dist/index.js: 160 KB

# Target After
dist/index.js: < 50 KB (core)
dist/feature-query.js: 30 KB (lazy loaded)
dist/feature-redux.js: 40 KB (lazy loaded)
dist/feature-http.js: 15 KB (lazy loaded)
```

**Testing:**

- [ ] Minimal config loads only core
- [ ] Cache feature loads TanStack Query
- [ ] State management loads Redux
- [ ] HTTP requests load Axios
- [ ] Bundle size reduced by 70%+

**Success Criteria:**

- [ ] Core bundle < 50 KB
- [ ] Features load on demand
- [ ] No performance regression
- [ ] All tests pass
- [ ] Tree-shaking verified

---

### Phase 4: Unified Hook System

**Branch:** `feature/unified-hook`
**Based on:** `feature/dynamic-deps`

**Tasks:**

1. Enhance `useMinder()` to include all features
2. Deprecate individual hooks (useAuth, useCache, etc.)
3. Update documentation
4. Create comprehensive examples
5. Test all feature combinations

**Enhanced useMinder API:**

```typescript
interface UseMinderReturn<T> {
  // Data fetching
  data: T[];
  loading: boolean;
  error: Error | null;

  // CRUD operations
  operations: {
    create: (data: Partial<T>) => Promise<T>;
    update: (id: string, data: Partial<T>) => Promise<T>;
    delete: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
  };

  // Authentication
  auth: {
    login: (credentials: any) => Promise<void>;
    logout: () => Promise<void>;
    user: User | null;
    isAuthenticated: boolean;
  };

  // Cache control
  cache: {
    invalidate: () => void;
    prefetch: (id: string) => Promise<void>;
    clear: () => void;
  };

  // WebSocket
  websocket: {
    connect: () => void;
    disconnect: () => void;
    send: (message: any) => void;
    connected: boolean;
  };

  // File upload
  upload: {
    uploadFile: (file: File) => Promise<MediaUploadResult>;
    progress: number;
    uploading: boolean;
  };
}
```

**Usage Examples:**

```typescript
// Example 1: Simple data fetching
const { data, loading } = useMinder("users");

// Example 2: CRUD operations
const { operations } = useMinder("users");
await operations.create({ name: "John" });

// Example 3: Authentication
const { auth } = useMinder("auth");
await auth.login({ email, password });

// Example 4: Real-time updates
const { websocket } = useMinder("messages");
websocket.connect();

// Example 5: File upload
const { upload } = useMinder("media");
await upload.uploadFile(file);

// Example 6: Everything together
const { data, operations, auth, websocket } = useMinder("dashboard");
```

**Files to Modify:**

```
src/hooks/useMinder.ts        - Enhance with all features
src/hooks/useAuth.ts          - Deprecate
src/hooks/useCache.ts         - Deprecate
src/hooks/useWebSocket.ts     - Deprecate
src/hooks/useMediaUpload.ts   - Deprecate
src/index.ts                  - Update exports
```

**Testing:**

- [ ] All features accessible via useMinder
- [ ] Backward compatibility maintained
- [ ] Performance not degraded
- [ ] Type safety preserved
- [ ] All examples updated

**Success Criteria:**

- [ ] One hook for all features
- [ ] Clean, intuitive API
- [ ] Full TypeScript support
- [ ] All tests pass
- [ ] Documentation complete

---

### Phase 5: Platform Verification

**Branch:** `feature/platform-testing`
**Based on:** `feature/unified-hook`

**Tasks:**

1. Create test apps for each platform
2. Test all features on each platform
3. Document platform-specific setup
4. Fix platform-specific issues
5. Update platform guides

**Test Matrix:**

| Platform | Data Fetch | CRUD | Auth | Cache | WebSocket | Upload |
| -------- | ---------- | ---- | ---- | ----- | --------- | ------ |
| Web      | ⚠️         | ⚠️   | ⚠️   | ⚠️    | ⚠️        | ⚠️     |
| Next.js  | ⚠️         | ⚠️   | ⚠️   | ⚠️    | ⚠️        | ⚠️     |
| RN       | ⚠️         | ⚠️   | ⚠️   | ⚠️    | ⚠️        | ⚠️     |
| Expo     | ⚠️         | ⚠️   | ⚠️   | ⚠️    | ⚠️        | ⚠️     |
| Electron | ⚠️         | ⚠️   | ⚠️   | ⚠️    | ⚠️        | ⚠️     |
| Node.js  | ✅         | ⚠️   | ⚠️   | ⚠️    | ⚠️        | ⚠️     |

**Test Apps to Create:**

```
examples/platform-tests/
├── web-vite/           - React + Vite app
├── nextjs-app/         - Next.js 14 app
├── react-native/       - React Native app
├── expo-app/           - Expo app
├── electron-app/       - Electron app
└── node-server/        - Node.js API server
```

**Success Criteria:**

- [ ] All platforms tested
- [ ] No platform limitations
- [ ] Platform-specific docs created
- [ ] All features work everywhere
- [ ] Performance benchmarks collected

---

### Phase 6: Complete Configurability

**Branch:** `feature/configurable-all`
**Based on:** `feature/platform-testing`

**Tasks:**

1. Audit all hardcoded values
2. Add config options for everything
3. Update configuration interface
4. Add validation and defaults
5. Test all configuration combinations

**Configuration Audit:**

```typescript
// Current config interface
interface MinderConfig {
  // Core
  apiBaseUrl: string;              ✅ Configurable
  routes: Record<string, ApiRoute>; ✅ Configurable

  // Features
  auth?: AuthConfig;               ✅ Configurable
  cache?: CacheConfig;             ✅ Configurable
  websocket?: WebSocketConfig;     ✅ Configurable

  // Advanced
  performance?: PerformanceConfig; ✅ Configurable
  security?: SecurityConfig;       ✅ Configurable
  debug?: DebugConfig;             ✅ Configurable

  // Platform
  platform?: Platform;             ⚠️ Auto-detected, allow override?

  // Lifecycle hooks
  onInit?: () => void;             ❌ Missing
  onError?: (error: Error) => void; ✅ Exists
  onRequest?: (config: any) => void; ❌ Missing
  onResponse?: (response: any) => void; ❌ Missing
}
```

**New Configuration Options:**

```typescript
interface EnhancedMinderConfig extends MinderConfig {
  // Lifecycle hooks
  hooks?: {
    onInit?: () => void;
    onDestroy?: () => void;
    onRequest?: (config: RequestConfig) => RequestConfig;
    onResponse?: (response: Response) => Response;
    onError?: (error: Error) => Error;
    onRetry?: (attempt: number) => boolean;
  };

  // Advanced networking
  networking?: {
    adapter?: NetworkAdapter;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    baseHeaders?: Record<string, string>;
  };

  // Custom plugins
  plugins?: Plugin[];

  // Developer tools
  devtools?: {
    enabled?: boolean;
    position?: "top" | "bottom" | "left" | "right";
  };
}
```

**Success Criteria:**

- [ ] Every feature configurable
- [ ] No hardcoded values
- [ ] Validation for all configs
- [ ] Sensible defaults
- [ ] Full TypeScript support

---

### Phase 7: Comprehensive Testing

**Branch:** `feature/testing-suite`
**Based on:** `feature/configurable-all`

**Tasks:**

1. Create performance test suite
2. Create security test suite
3. Create reliability test suite
4. Create integration test suite
5. Set up CI/CD testing
6. Document test coverage

**Test Suites:**

#### A. Performance Tests

```typescript
describe("Performance", () => {
  test("Bundle size < 50 KB", () => {
    expect(getBundleSize("dist/index.js")).toBeLessThan(50 * 1024);
  });

  test("First load < 100ms", async () => {
    const start = Date.now();
    await import("minder-data-provider");
    expect(Date.now() - start).toBeLessThan(100);
  });

  test("Request deduplication works", async () => {
    const requests = await Promise.all([
      minder("users"),
      minder("users"),
      minder("users"),
    ]);
    expect(networkCalls).toBe(1); // Only one actual request
  });
});
```

#### B. Security Tests

```typescript
describe("Security", () => {
  test("XSS protection enabled", () => {
    const malicious = '<script>alert("xss")</script>';
    expect(sanitize(malicious)).not.toContain("<script>");
  });

  test("CSRF token generated", () => {
    const token = generateCSRFToken();
    expect(token).toHaveLength(32);
    expect(validateCSRFToken(token)).toBe(true);
  });

  test("Secure token storage", () => {
    authManager.setToken("secret-token");
    expect(localStorage.getItem("token")).toBeNull(); // Not in localStorage
    expect(document.cookie).toContain("token"); // In httpOnly cookie
  });
});
```

#### C. Reliability Tests

```typescript
describe("Reliability", () => {
  test("Handles network errors gracefully", async () => {
    mockNetworkError();
    const { error } = await minder("users");
    expect(error).toBeInstanceOf(MinderNetworkError);
  });

  test("Retry logic works", async () => {
    let attempts = 0;
    mockAPI({ onRequest: () => attempts++ });
    await minder("users");
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  test("Offline support functional", async () => {
    const { data } = await minder("users");
    goOffline();
    const { data: cachedData } = await minder("users");
    expect(cachedData).toEqual(data);
  });
});
```

**Test Coverage Goals:**

- Overall: > 80%
- Core modules: > 90%
- Critical paths: 100%

**Success Criteria:**

- [ ] All tests pass
- [ ] Coverage > 80%
- [ ] Performance benchmarks met
- [ ] Security verified
- [ ] Reliability confirmed

---

## 🔀 Branch Strategy

### Main Branches

```
main (production)
  └── improvements-for-2.0.3 (integration)
       ├── feature/unified-config
       ├── feature/dynamic-deps
       ├── feature/unified-hook
       ├── feature/platform-testing
       ├── feature/configurable-all
       └── feature/testing-suite
```

### Workflow

1. Create feature branch from `improvements-for-2.0.3`
2. Implement and test thoroughly
3. Commit when all tests pass
4. Create next feature branch from current
5. Repeat until all features complete
6. Final integration testing
7. Merge to main

### Commit Guidelines

```
feat: Add unified configuration system
test: Add comprehensive config tests
docs: Update configuration guide
perf: Optimize bundle size with dynamic imports
fix: Resolve platform-specific issues
```

---

## 📊 Success Metrics

### Bundle Size

- [x] Current: 160 KB
- [ ] Target: < 50 KB (core)
- [ ] With features: < 150 KB (loaded on demand)

### Performance

- [ ] First load: < 100ms
- [ ] Time to interactive: < 200ms
- [ ] Cache hit rate: > 80%

### Code Quality

- [ ] Test coverage: > 80%
- [ ] Zero TypeScript errors
- [ ] Zero ESLint errors
- [ ] All examples working

### Developer Experience

- [ ] One config function
- [ ] One hook for all features
- [ ] Clear documentation
- [ ] Working examples for all platforms

---

## 📅 Timeline

### Week 1: Configuration & Dependencies

- Day 1-2: Unified config system
- Day 3-5: Dynamic dependencies
- Day 6-7: Testing and documentation

### Week 2: Hook System & Platform Testing

- Day 8-10: Unified hook system
- Day 11-14: Platform testing

### Week 3: Configurability & Testing

- Day 15-17: Complete configurability
- Day 18-21: Comprehensive testing

### Week 4: Integration & Release

- Day 22-24: Integration testing
- Day 25-26: Documentation review
- Day 27-28: Release preparation
- Day 29-30: Release and monitoring

---

## 🎯 Next Steps

1. **Review this plan** - Confirm approach is correct
2. **Set up branches** - Create feature branch structure
3. **Start Phase 2** - Begin with unified config system
4. **Test thoroughly** - Each phase before moving to next
5. **Document progress** - Update this plan as we go

---

**Status:** 📋 Plan Complete - Ready for Implementation
**Current:** Phase 1 - Analysis & Planning ✅
**Next:** Phase 2 - Unified Configuration System
