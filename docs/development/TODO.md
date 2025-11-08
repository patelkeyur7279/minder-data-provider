# TODO List - Debug Logging Implementation

## Priority: HIGH - Debug Feature Enhancement

### 🔍 Comprehensive Debug Logging System

**Current State:**
- ✅ Basic DebugManager infrastructure exists
- ✅ Logger utility with log levels (DEBUG, INFO, WARN, ERROR)
- ❌ No automatic API request/response logging
- ❌ Network logs option (`networkLogs`) exists in presets but not implemented
- ❌ Errors are handled internally but not automatically logged to console

**Required Implementation:**

#### 1. API Request/Response Logging
- [ ] Add axios request interceptor in `ApiClient.ts` to log outgoing requests
  - Log: HTTP method, URL, headers, request body
  - Format: `🚀 [API REQUEST] GET /api/users`
  - Include timestamp and request ID for tracing
  
- [ ] Add axios response interceptor in `ApiClient.ts` to log responses
  - Log: Status code, response data, duration
  - Format: `✅ [API RESPONSE] 200 GET /api/users (123ms)`
  - Include response size and headers
  
- [ ] Implement conditional logging based on `debug.enabled` config
  - Only log when debug mode is active
  - Respect `debug.logLevel` setting
  - Add `debug.networkLogs` boolean flag to control API logging

#### 2. Error Logging Enhancement
- [ ] Auto-log all errors to console when debug enabled
  - Axios errors with full response details
  - Network errors with connection info
  - Validation errors with field details
  - Add error codes and stack traces
  
- [ ] Add error interceptor in `ApiClient.ts`
  - Log to console: `❌ [API ERROR] 404 GET /api/users - Not Found`
  - Include error details, status, response data
  - Add retry attempt information if applicable

#### 3. Cache Logging
- [ ] Log cache hits/misses in `CacheManager.ts`
  - Format: `📦 [CACHE HIT] /api/users`
  - Format: `📭 [CACHE MISS] /api/products`
  - Include cache key and TTL information

#### 4. Authentication Logging
- [ ] Log auth events in `AuthManager.ts`
  - Login: `🔐 [AUTH] User logged in`
  - Logout: `🔓 [AUTH] User logged out`
  - Token refresh: `🔄 [AUTH] Token refreshed`
  - Auth errors: `⚠️ [AUTH] Authentication failed - 401`

#### 5. WebSocket Logging
- [ ] Add WebSocket event logging in `WebSocketManager.ts`
  - Connection: `🔌 [WS] Connected to ws://api.example.com`
  - Disconnect: `🔌 [WS] Disconnected`
  - Messages: `📨 [WS] Message received: {type: 'update'}`
  - Errors: `❌ [WS] Connection error`

#### 6. Performance Monitoring
- [ ] Integrate PerformanceMonitor with debug logging
  - Log slow requests (> threshold): `⚠️ [PERF] Slow request: GET /api/users (2341ms)`
  - Add performance metrics summary
  - Track and log memory usage if available

#### 7. Network Adapter Logging
- [ ] Add logging to `WebNetworkAdapter.ts`, `NativeNetworkAdapter.ts`
  - Log adapter selection: `🌐 [ADAPTER] Using WebNetworkAdapter`
  - Log request initiation and completion
  - Log retry attempts with backoff delays

#### 8. Configuration
- [ ] Update `types.ts` to include new debug options:
  ```typescript
  debug?: {
    enabled?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    networkLogs?: boolean;      // NEW
    cacheLog?: boolean;          // NEW
    performanceLogs?: boolean;   // NEW
    errorLogs?: boolean;         // NEW
    authLogs?: boolean;          // NEW
    websocketLogs?: boolean;     // NEW
  }
  ```

- [ ] Update presets in `presets.ts` to enable these options:
  - **Advanced preset**: networkLogs, performanceLogs
  - **Enterprise preset**: ALL logging options enabled

#### 9. Documentation Updates
- [ ] Update `docs/CONFIG_GUIDE.md` with debug logging options
- [ ] Add examples of console output in different debug modes
- [ ] Document how to filter logs by type
- [ ] Add troubleshooting guide using debug logs

#### 10. Testing
- [ ] Add tests for debug logging functionality
- [ ] Test log output in different environments (dev/staging/prod)
- [ ] Verify logs are suppressed when debug disabled
- [ ] Test log level filtering works correctly

---

## Implementation Notes

### Files to Modify:
1. `src/core/ApiClient.ts` - Add request/response interceptor logging
2. `src/core/CacheManager.ts` - Add cache logging
3. `src/core/AuthManager.ts` - Add auth event logging
4. `src/core/WebSocketManager.ts` - Add WebSocket logging
5. `src/platform/adapters/network/*.ts` - Add network adapter logging
6. `src/debug/DebugManager.ts` - Enhance with new log types
7. `src/core/types.ts` - Add new debug config options
8. `src/config/presets.ts` - Update preset configs
9. `docs/CONFIG_GUIDE.md` - Document new debug features
10. `docs/examples/config.production-ready.ts` - Add debug examples

### Example Output (when debug enabled):
```
[Minder] [DEBUG] Minder Data Provider initialized with debug mode
🚀 [API REQUEST] GET https://api.example.com/users
  Headers: { Authorization: 'Bearer xxx', Content-Type: 'application/json' }
📭 [CACHE MISS] GET:/users
✅ [API RESPONSE] 200 GET /users (156ms)
  Data: { users: [...], total: 42 }
  Size: 2.3 KB
📦 [CACHE SET] GET:/users (TTL: 5m)
```

### Priority Order:
1. **Phase 1**: API Request/Response Logging (Most Important)
2. **Phase 2**: Error Logging Enhancement
3. **Phase 3**: Cache, Auth, WebSocket Logging
4. **Phase 4**: Performance Monitoring Integration
5. **Phase 5**: Documentation & Testing

---

## 🐛 Configuration Issues

### Enum Types Not Working in User Configuration

**Current Problem:**
- TypeScript enums are exported from the package
- End users cannot use enums in their configuration files
- Users must provide string literals instead of enum values
- This defeats the purpose of having enums for type safety

**Example of Current Issue:**
```typescript
// ❌ This doesn't work for end users:
import { createMinderConfig, LogLevel } from 'minder-data-provider';

const config = createMinderConfig({
  debug: {
    logLevel: LogLevel.DEBUG  // ❌ LogLevel is undefined for users
  }
});

// ✅ Users must do this instead:
const config = createMinderConfig({
  debug: {
    logLevel: 'debug'  // String literal required
  }
});
```

**Affected Enums:**
- [ ] `LogLevel` - from Logger utility (DEBUG, INFO, WARN, ERROR, SILENT)
- [ ] `ApiMethod` - HTTP methods (GET, POST, PUT, PATCH, DELETE)
- [ ] `HttpMethod` - Network adapter methods
- [ ] Any other enums exported from the package

**Root Cause:**
- Enums not properly exported in package entry points
- TypeScript compilation might be stripping enum runtime values
- Bundle configuration may not preserve enums
- Missing from `index.ts` exports or platform-specific exports

**Required Investigation:**
- [ ] Check `src/index.ts` - verify all enums are exported
- [ ] Check `tsconfig.json` - ensure `preserveConstEnums` is set
- [ ] Check `tsup.config.ts` - verify enum handling in bundling
- [ ] Check `package.json` exports field - ensure enums are accessible
- [ ] Test import in external project to reproduce issue

**Required Fixes:**
- [ ] Export all enums from main entry point (`src/index.ts`)
- [ ] Export enums from platform-specific entries (web, node, react-native, etc.)
- [ ] Update `tsconfig.json` if needed:
  ```json
  {
    "compilerOptions": {
      "preserveConstEnums": true,
      "isolatedModules": false
    }
  }
  ```
- [ ] Update `tsup.config.ts` to preserve enums in output
- [ ] Add runtime enum fallbacks if needed
- [ ] Update type definitions to ensure enums are available

**Documentation Updates:**
- [ ] Update `docs/CONFIG_GUIDE.md` with enum usage examples
- [ ] Update `docs/examples/config.production-ready.ts` to use enums
- [ ] Add troubleshooting section for enum imports
- [ ] Document both enum and string literal approaches

**Testing:**
- [ ] Create test project that imports package
- [ ] Verify enum imports work: `import { LogLevel } from 'minder-data-provider'`
- [ ] Verify enum values are available at runtime
- [ ] Test in all platforms (web, node, react-native, nextjs)
- [ ] Add integration test for enum usage

**Priority:** HIGH - This impacts developer experience and type safety

---

## 📦 Build & Bundle Issues

### 1. TypeScript Configuration - Missing Enum Preservation

**Problem:**
- tsconfig.json missing `preserveConstEnums` option
- Enums might be compiled away, making them unavailable to end users
- No control over enum output format

**Fix Required:**
- [ ] Add to `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "preserveConstEnums": true
    }
  }
  ```

### 2. Tree-Shaking Not Optimal

**Current State:**
- Bundle splitting disabled: `splitting: false` in tsup.config.ts
- All code in single bundles per platform
- Users import entire modules even when using small features

**Potential Improvements:**
- [ ] Enable code splitting: `splitting: true`
- [ ] Verify tree-shaking works correctly
- [ ] Test bundle sizes with partial imports
- [ ] Document recommended import patterns

### 3. Source Maps in Production Build

**Issue:**
- `sourcemap: true` generates source maps in production
- Increases bundle size significantly
- Security risk: exposes source code

**Fix Required:**
- [ ] Conditional source maps based on environment:
  ```typescript
  sourcemap: process.env.NODE_ENV !== 'production'
  ```

---

## 🧪 Test Coverage Issues

### Low Test Coverage (36% vs 70% threshold)

**Current Status:**
- Statements: 36.09% (Target: 70%)
- Branches: 30.61% (Target: 70%)
- Functions: 30.74% (Target: 70%)
- Lines: 37.01% (Target: 70%)

**Untested Areas:**
- [ ] Platform adapters (NativeNetworkAdapter, ElectronStorageAdapter, etc.)
- [ ] Security features (XSS sanitization, CSRF validation in real scenarios)
- [ ] SSR/hydration functionality
- [ ] DevTools component
- [ ] Error boundary edge cases
- [ ] Dynamic feature loading
- [ ] Platform detection logic
- [ ] Upload adapters for different platforms
- [ ] Offline sync mechanisms

**Required Actions:**
- [ ] Add integration tests for platform-specific code
- [ ] Add end-to-end tests for common workflows
- [ ] Test error scenarios and edge cases
- [ ] Test SSR hydration in Next.js environment
- [ ] Add visual regression tests for DevTools UI

---

## ♿ Accessibility (a11y) Issues

### Missing Accessibility in Core Components

**Analysis:**
- ✅ Example components have good a11y (ProductList, ShoppingCart, etc.)
- ❌ Core library components missing accessibility features

**Components Needing a11y:**

1. **MinderErrorBoundary.tsx**
   - [ ] Add ARIA live region for error announcements
   - [ ] Add role="alert" for error messages
   - [ ] Keyboard navigation for retry button
   - [ ] Focus management after error

2. **DevTools.tsx**
   - [ ] Add ARIA labels to tabs
   - [ ] Keyboard navigation between panels
   - [ ] Add aria-expanded for collapsible sections
   - [ ] Screen reader announcements for data updates
   - [ ] Focus trap when panel is open

**Required Actions:**
- [ ] Audit all UI components for WCAG 2.1 compliance
- [ ] Add keyboard navigation support
- [ ] Add ARIA labels and roles
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)
- [ ] Add focus management
- [ ] Document accessibility features in docs

---

## 🔒 Security Improvements

### 1. CSP (Content Security Policy) Not Enforced

**Current State:**
- CSP headers defined but not automatically applied
- Users must manually configure CSP
- No CSP validation in development

**Required:**
- [ ] Add CSP header injection middleware
- [ ] Warn developers in dev mode if CSP is misconfigured
- [ ] Document CSP configuration for different platforms
- [ ] Add CSP presets (strict, moderate, lenient)

### 2. Token Storage Security

**Issue:**
- localStorage still available as option (deprecated but not removed)
- XSS vulnerability if users choose localStorage

**Actions:**
- [ ] Remove localStorage option entirely in v3.0
- [ ] Add migration helper to move tokens to cookies
- [ ] Warn in console when localStorage is used
- [ ] Document cookie-based auth setup

### 3. HTTPS Enforcement Missing

**Problem:**
- No automatic HTTPS enforcement
- Tokens could be sent over HTTP in misconfigured apps

**Fix:**
- [ ] Add `requireHTTPS` config option
- [ ] Throw error if API URL uses HTTP in production
- [ ] Add HSTS header support
- [ ] Document HTTPS requirements

---

## 🌍 Environment Detection Issues

### SSR Detection Could Be More Robust

**Current Implementation:**
```typescript
typeof window !== 'undefined' || !config.ssr?.enabled
```

**Problems:**
- [ ] Doesn't handle Edge runtimes (Vercel, Cloudflare Workers)
- [ ] No detection for Deno/Bun environments
- [ ] Could fail in React Server Components

**Improvements Needed:**
- [ ] Detect Edge runtime: `typeof EdgeRuntime !== 'undefined'`
- [ ] Detect Deno: `typeof Deno !== 'undefined'`
- [ ] Detect Bun: `typeof Bun !== 'undefined'`
- [ ] Add environment utils module
- [ ] Test in all modern runtime environments

---

## 📝 Type Safety Issues

### Excessive Use of `any` Types

**Found 50+ instances of `any` in codebase:**

**High Priority Fixes:**
1. `src/debug/DebugManager.ts:12` - `private logs: any[]`
   - [ ] Replace with proper `LogEntry[]` type

2. `src/query/QueryBuilder.ts` - Multiple `any` for filter values
   - [ ] Create generic type for query values

3. `src/models/BaseModel.ts` - `fromJSON(data: any)`, `toJSON(): any`
   - [ ] Use `unknown` and add type guards

4. `src/hooks/index.ts` - Redux state as `any`
   - [ ] Create proper Redux state types

5. `src/core/types.ts` - `dynamic: any`
   - [ ] Type this properly or document why it must be any

**Medium Priority:**
- [ ] Replace `data?: any` in hooks with generic types
- [ ] Add strict null checks
- [ ] Enable `noImplicitAny` in tsconfig.json (currently commented out)

---

## 🚀 Performance Optimizations

### 1. Bundle Size Still Large (555KB)

**Analysis:**
- Main bundle: 555.7 KB
- Could be reduced with better tree-shaking
- Some dependencies might be bundled unnecessarily

**Optimization Opportunities:**
- [ ] Analyze bundle with `npm run analyze-bundle`
- [ ] Check if axios could be lazy-loaded
- [ ] Split platform adapters into separate chunks
- [ ] Use dynamic imports for heavy features
- [ ] Consider replacing DOMPurify with lighter alternative

### 2. Memory Leaks in WebSocket Manager

**Potential Issue:**
- Event listeners added but might not be cleaned up
- Reconnection timers might leak

**Required:**
- [ ] Audit all addEventListener calls for cleanup
- [ ] Clear all timers in disconnect()
- [ ] Add memory leak tests
- [ ] Test long-running applications

### 3. Cache Invalidation Strategy

**Current Problem:**
- Cache keys might collide
- No cache versioning
- Stale data not automatically invalidated

**Improvements:**
- [ ] Add cache versioning
- [ ] Implement cache tags for grouped invalidation
- [ ] Add stale-while-revalidate pattern
- [ ] Document cache invalidation patterns

---

## 📚 Documentation Gaps

### Missing Documentation

1. **API Reference Issues:**
   - [ ] Many interfaces missing JSDoc comments
   - [ ] No examples for advanced features
   - [ ] Missing migration guides for breaking changes

2. **Platform-Specific Guides:**
   - [ ] No Electron-specific guide
   - [ ] Expo setup incomplete
   - [ ] React Native Web not documented

3. **Architecture Documentation:**
   - [ ] No architecture decision records (ADRs)
   - [ ] Missing state flow diagrams
   - [ ] No contribution guidelines for core features

4. **Performance Guide:**
   - [ ] Bundle size optimization guide incomplete
   - [ ] No benchmark comparisons
   - [ ] Missing best practices for large apps

5. **CRITICAL MISSING: Dynamic Import & Context Configuration** ⚠️
   - [ ] No documentation explaining `dynamic` field is **REQUIRED**
   - [ ] No explanation of WHY `dynamic` is needed (Next.js dynamic imports)
   - [ ] No clear examples showing how to use `dynamic()`
   - [ ] Missing Context API configuration guide
   - [ ] No warning when `dynamic` is missing in config
   
   **Problem:** Users don't understand that:
   ```typescript
   // ❌ WRONG - Will fail in Next.js
   const config = createMinderConfig({
     apiUrl: 'https://api.example.com',
     routes: { ... }
     // Missing dynamic!
   });
   
   // ✅ CORRECT - Required for Next.js
   import dynamic from 'next/dynamic';
   
   const config = createMinderConfig({
     apiUrl: 'https://api.example.com',
     routes: { ... },
     dynamic: dynamic  // Required!
   });
   ```
   
   **Why `dynamic` is Required:**
   - Next.js needs it for lazy loading React Query DevTools
   - Without it, SSR breaks when importing client-only components
   - Prevents "Cannot read properties of null" errors
   - Enables code-splitting for DevTools (keeps bundle small)
   
   **Actions:**
   - [ ] Add `docs/DYNAMIC_IMPORTS.md` - Explain dynamic import pattern
   - [ ] Add validation: throw error if `dynamic` missing in Next.js apps
   - [ ] Update all example configs to show `dynamic` field
   - [ ] Add to CONFIG_GUIDE.md with clear explanation
   - [ ] Add TypeScript error if `dynamic` is missing
   - [ ] Document alternative for non-Next.js apps (React, Node, etc.)

**Required:**
- [ ] Complete JSDoc for all public APIs
- [ ] Add runnable examples for each platform
- [ ] Create architecture documentation
- [ ] Add performance benchmarks
- [ ] **PRIORITY: Document dynamic import requirement**

---

## 🔧 Developer Experience

### 1. Error Messages Not Helpful

**Examples:**
- "Network error" - Doesn't say which endpoint failed
- "Invalid config" - Doesn't say what's invalid
- "Authentication failed" - No hint on how to fix

**Improvements:**
- [ ] Add actionable error messages with suggestions
- [ ] Include URL/route in network errors
- [ ] Show config path in validation errors
- [ ] Add error codes documentation

### 2. TypeScript Autocomplete Could Be Better

**Issues:**
- Generic types not always inferred correctly
- Route names not autocompleted from config
- Model types require manual specification

**Possible Improvements:**
- [ ] Use template literal types for route names
- [ ] Improve type inference in hooks
- [ ] Add utility types for common patterns
- [ ] Create VS Code snippets

### 3. Hot Module Replacement Issues

**Problem:**
- Config changes require full page reload
- State lost on HMR in development

**Fix:**
- [ ] Add HMR support for config changes
- [ ] Preserve state during development
- [ ] Add warning when HMR fails

---

## 🔄 Migration & Backward Compatibility

### Deprecated Features Still Present

**Found deprecated code:**
1. `src/index.ts:48` - Legacy exports comment
2. `src/config/presets.ts:9` - localStorage deprecation warning
3. `src/platforms/web.ts:39` - Legacy support code

**Actions:**
- [ ] Document all deprecated features
- [ ] Add console warnings for deprecated usage
- [ ] Create migration CLI tool
- [ ] Set removal timeline (v3.0)

### Breaking Changes Not Documented

**Potential Breaking Changes:**
- Auth storage change (localStorage → cookie)
- Route configuration structure changed
- Some method signatures updated

**Required:**
- [ ] Complete CHANGELOG.md for v2.0
- [ ] Add BREAKING_CHANGES.md
- [ ] Create automated migration tool
- [ ] Add codemod for common patterns

---

## 📂 File Organization Issues

### Root Folder Clutter - Violating Own Structure

**Problem:** 
Creating documentation files in root folder instead of using established `docs/` structure:
- ✅ `docs/` folder exists with proper structure
- ❌ Still creating `TODO.md`, `GIT_NPM_SETUP.md`, etc. in root
- ❌ Inconsistent with project organization

**Files That Should Be Moved:**

1. **Root → `docs/development/`**
   - [ ] Move `TODO.md` → `docs/development/TODO.md`
   - [ ] Move `GIT_NPM_SETUP.md` → `docs/development/GIT_NPM_SETUP.md`
   - [ ] Move `GIT_NPM_CONNECTION_SUMMARY.md` → `docs/development/GIT_NPM_CONNECTION.md`
   - [ ] Move `QUICK_RELEASE.md` → `docs/development/RELEASE_GUIDE.md`
   - [ ] Move `PLATFORMS_RUNNING.md` → `docs/PLATFORM_STATUS.md`
   - [ ] Move `TEST_RESULTS_SUMMARY.md` → `docs/development/TEST_RESULTS.md`
   - [ ] Move `BUNDLE_ANALYSIS.json` → `docs/development/bundle-analysis.json`

2. **Root → `docs/` (user-facing)**
   - [ ] Keep `README.md` in root (required for npm/GitHub)
   - [ ] Keep `LICENSE` in root (required)
   - [ ] Keep `CHANGELOG.md` in root (standard practice)
   - [ ] Keep `CONTRIBUTING.md` in root (GitHub standard)
   - [ ] Keep `SECURITY.md` in root (GitHub security)
   - [ ] Move `TODO.md` content to GitHub Issues instead

3. **Update `.npmignore`**
   - [ ] Ensure `docs/development/` is excluded from npm package
   - [ ] Keep only user-facing docs in published package

**Correct Structure Should Be:**
```
/
├── README.md                    ✅ (npm/GitHub required)
├── LICENSE                      ✅ (required)
├── CHANGELOG.md                 ✅ (standard)
├── CONTRIBUTING.md              ✅ (GitHub standard)
├── SECURITY.md                  ✅ (GitHub standard)
├── package.json                 ✅
├── tsconfig.json               ✅
├── tsup.config.ts              ✅
│
├── docs/                        📚 User Documentation
│   ├── API_REFERENCE.md
│   ├── CONFIG_GUIDE.md
│   ├── MIGRATION_GUIDE.md
│   ├── PERFORMANCE_GUIDE.md
│   ├── PLATFORM_STATUS.md       ⬅️ Move from PLATFORMS_RUNNING.md
│   │
│   ├── development/             🔧 Developer Documentation
│   │   ├── TODO.md              ⬅️ Move from root
│   │   ├── GIT_NPM_SETUP.md     ⬅️ Move from root
│   │   ├── RELEASE_GUIDE.md     ⬅️ Move from root
│   │   ├── TEST_RESULTS.md      ⬅️ Move from root
│   │   └── bundle-analysis.json ⬅️ Move from root
│   │
│   └── examples/
│
├── src/                         💻 Source Code
├── tests/                       🧪 Tests
└── examples/                    📦 Example Apps
```

**Actions:**
- [ ] Create `docs/development/` folder if not exists
- [ ] Move all development docs from root to `docs/development/`
- [ ] Update all internal references to new paths
- [ ] Update CI/CD workflows to use new paths
- [ ] Add note to CONTRIBUTING.md about file organization
- [ ] Consider converting TODO.md to GitHub Issues/Projects

---

**Created:** November 8, 2025  
**Updated:** November 8, 2025  
**Status:** Pending Implementation  

**Estimated Total Effort:** 
- Debug Logging: 4-6 hours
- Enum Fix: 2-3 hours
- Test Coverage: 20-30 hours
- Accessibility: 10-15 hours
- Security Improvements: 8-12 hours
- Type Safety: 6-8 hours
- Documentation (including dynamic/context): 18-25 hours
- File Organization: 1-2 hours
- **Total: 73-103 hours**

**Priority Order:**
1. **P0 (Critical):** 
   - Enum exports fix
   - **Dynamic import documentation** (Users getting errors NOW)
   - Debug logging implementation
   - Security (token storage)

2. **P1 (High):** 
   - File organization (Fix our own mess)
   - Test coverage improvements
   - Type safety (`any` removal)
   - Better error messages

3. **P2 (Medium):** 
   - Accessibility features
   - Complete documentation
   - Performance optimization

4. **P3 (Low):** 
   - Developer experience improvements
   - Migration tools

**Impact:** High - Essential for production readiness, developer experience, and long-term maintainability

---

## 📝 Notes

**Lessons Learned:**
- ❌ Don't create files in root when `docs/` structure exists
- ❌ Don't ignore established project organization
- ✅ Follow consistent folder structure
- ✅ Keep root minimal and clean
- ✅ Development docs separate from user docs
