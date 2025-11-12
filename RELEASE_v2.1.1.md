# v2.1.1 Release Summary - Critical Bug Fixes

**Release Date:** December 2024  
**Version:** 2.1.1  
**Previous Version:** 2.1.0  
**Total Bugs Fixed:** 5 critical issues

---

## 🎯 Executive Summary

After publishing v2.1.0 to npm, users reported runtime issues. A comprehensive audit revealed **5 critical bugs** affecting end users. All bugs have been fixed, tested, and verified.

### Quick Stats

- **Tests:** 1,385 passing (15 new tests added)
- **Build:** ✅ Successful (99 files: ESM + CJS + DTS)
- **TypeScript:** ✅ 0 errors
- **Breaking Changes:** None
- **Migration Required:** None - drop-in replacement

---

## 🐛 Critical Bugs Fixed

### **Bug #1: CRUD Operations Params Not Working**

**Issue:** Dynamic route parameters were ignored  
**Severity:** HIGH - Broke all dynamic routes  
**Affected Users:** Anyone using routes with `:id`, `:postId`, etc.

**Before:**

```typescript
operations.create({ name: "Test" }, { params: { id: 123 } });
// ❌ Params ignored, API call fails: POST /api/posts (404)
```

**After:**

```typescript
operations.create({ name: "Test" }, { params: { id: 123 } });
// ✅ Params work: POST /api/posts/123/comments
```

**Files Changed:**

- `src/hooks/useMinder.ts` (lines 883-936)

---

### **Bug #2: DevTools Showing in Production**

**Issue:** React Query DevTools leaked into production builds  
**Severity:** HIGH - Performance impact, unprofessional UX  
**Affected Users:** All users with `debug.enabled = false`

**Before:**

```typescript
<MinderDataProvider config={{ debug: { enabled: false } }}>
  {/* ❌ DevTools still visible in production */}
</MinderDataProvider>
```

**After:**

```typescript
<MinderDataProvider config={{ debug: { enabled: false } }}>
  {/* ✅ DevTools hidden when debug.enabled = false */}
</MinderDataProvider>
```

**Files Changed:**

- `src/core/MinderDataProvider.tsx` (lines 258-268)

---

### **Bug #3: TypeScript Types Incorrect**

**Issue:** CRUD operations missing `params` option in type definitions  
**Severity:** MEDIUM - Compile errors for TypeScript users  
**Affected Users:** All TypeScript users

**Before:**

```typescript
operations.create({ name: "Test" }, { params: { id: 123 } });
// ❌ TypeScript error: Argument of type '{ params: ... }' is not assignable
```

**After:**

```typescript
operations.create({ name: "Test" }, { params: { id: 123 } });
// ✅ Full IDE autocomplete and type checking
```

**Files Changed:**

- `src/hooks/useMinder.ts` (lines 346-353)

---

### **Bug #4: WebSocket Memory Leak**

**Issue:** `websocket.subscribe()` didn't return cleanup function  
**Severity:** HIGH - Memory leaks in long-running apps  
**Affected Users:** Anyone using WebSocket subscriptions

**Before:**

```typescript
useEffect(() => {
  const callback = (data) => console.log(data);
  websocket.subscribe("user:updated", callback);
  // ❌ No cleanup - memory leak
}, []);
```

**After:**

```typescript
useEffect(() => {
  const callback = (data) => console.log(data);
  const unsubscribe = websocket.subscribe("user:updated", callback);
  return () => unsubscribe(); // ✅ Proper cleanup
}, []);
```

**Files Changed:**

- `src/hooks/useMinder.ts` (lines 1047-1066, 385-389)

---

### **Bug #5: JWT Parsing Crashes on Malformed Tokens** ⚠️ **NEW**

**Issue:** JWT decoding crashes if token has < 3 parts  
**Severity:** CRITICAL - Application crash, poor UX  
**Affected Users:** Anyone with corrupted tokens in storage

**Problem:**

```typescript
// If localStorage has corrupted token like "abc"
const parts = token.split("."); // ['abc']
const payload = JSON.parse(atob(parts[1])); // ❌ CRASH: parts[1] is undefined
```

**Fix:**

```typescript
// Validate JWT has exactly 3 parts
const parts = token.split(".");
if (parts.length !== 3 || !parts[1]) {
  return null; // ✅ Graceful handling
}
const payload = JSON.parse(
  atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
);
```

**Files Changed:**

- `src/hooks/useMinder.ts` (line 1003)
- `src/hooks/index.ts` (line 200)
- `src/core/AuthManager.ts` (line 120)
- `src/auth/SecureAuthManager.ts` (line 240)

**Test Coverage:**

- 15 new tests covering all edge cases
- Malformed tokens: single part, empty string, too many parts, invalid base64, etc.
- All tests passing ✅

---

## 📊 Testing

### Test Summary

```
Test Suites: 43 passed, 43 total
Tests:       1,385 passed, 1,385 total
Snapshots:   0 total
Time:        ~4s
```

### New Tests Added

**`tests/critical-bug-fixes.test.tsx`** (16 tests)

- Bug #1: CRUD params working
- Bug #2: DevTools config respected
- Bug #3: TypeScript types correct
- Bug #4: WebSocket cleanup functions
- Integration test for all fixes

**`tests/bug5-jwt-parsing.test.ts`** (15 tests)

- Valid JWT parsing
- Malformed tokens (9 variations)
- Base64url encoding support
- Expired tokens handling
- Invalid JSON/base64 handling

---

## 🔨 Build Verification

```bash
npm run build
```

**Output:**

- ✅ ESM: 17 modules (188 KB)
- ✅ CJS: 17 modules (195 KB)
- ✅ DTS: 65 type definition files
- ✅ Total: 99 files generated
- ✅ No TypeScript errors
- ✅ Build time: ~6.5s

---

## 📦 Package Info

**Package:** `minder-data-provider`  
**Version:** 2.1.1  
**Size:** ~195 KB (CJS), ~188 KB (ESM)  
**Peer Dependencies:**

- React: ^18.0.0 || ^19.0.0
- @tanstack/react-query: ^5.90.6
- @reduxjs/toolkit: ^2.9.2
- axios: ^1.13.1

---

## 🚀 Upgrade Guide

### For v2.1.0 Users

**No code changes required!** This is a drop-in replacement.

```bash
npm install minder-data-provider@2.1.1
# or
yarn add minder-data-provider@2.1.1
# or
pnpm add minder-data-provider@2.1.1
```

### What You Get

1. **CRUD params now work** - Dynamic routes functional
2. **No DevTools in production** - Respects `debug.enabled` flag
3. **Correct TypeScript types** - No more compile errors
4. **No memory leaks** - WebSocket cleanup functions returned
5. **No JWT crashes** - Graceful handling of malformed tokens

---

## 🎯 Impact Analysis

### Before v2.1.1

- ❌ Dynamic routes broken (params ignored)
- ❌ DevTools leaking into production
- ❌ TypeScript compile errors
- ❌ Memory leaks with WebSockets
- ❌ Application crashes on corrupted tokens

### After v2.1.1

- ✅ All routes working (including dynamic)
- ✅ Clean production builds
- ✅ Perfect TypeScript support
- ✅ Proper resource cleanup
- ✅ Robust error handling

---

## 📝 Changelog

### Added

- Comprehensive JWT token validation
- 31 new test cases covering all bugs
- Audit documentation (`CRITICAL_BUGS_AUDIT.md`)

### Fixed

- CRUD operations now accept and pass `params` option
- DevTools respect `debug.enabled` configuration
- TypeScript interfaces include `params` in operation types
- WebSocket `subscribe()` returns cleanup function
- JWT parsing validates token format before decoding

### Changed

- None (backward compatible)

### Breaking Changes

- None

---

## 🔍 Audit Process

1. **User Feedback Analysis** - Identified 4 critical bugs from real usage
2. **Systematic Code Review** - Comprehensive audit of entire codebase
3. **Additional Bug Discovery** - Found JWT parsing vulnerability (Bug #5)
4. **Test Development** - Created 31 comprehensive test cases
5. **Verification** - All 1,385 tests passing
6. **Documentation** - Complete audit report and release notes

---

## ✅ Pre-Release Checklist

- [x] All 5 critical bugs fixed
- [x] 31 new tests added (all passing)
- [x] 1,385 existing tests still passing
- [x] TypeScript compilation successful (0 errors)
- [x] Package builds successfully (99 files)
- [x] Documentation updated
- [x] Audit report created
- [x] No breaking changes
- [x] Backward compatible

---

## 📚 Related Documents

- `CRITICAL_BUGS_AUDIT.md` - Detailed audit findings
- `CHANGELOG.md` - Version history
- `tests/critical-bug-fixes.test.tsx` - Bug fix tests
- `tests/bug5-jwt-parsing.test.ts` - JWT parsing tests

---

## 🙏 Acknowledgments

Special thanks to early adopters who reported these issues and helped make the library more robust for the community.

---

## 📞 Support

- **Issues:** https://github.com/yourusername/minder-data-provider/issues
- **Discussions:** https://github.com/yourusername/minder-data-provider/discussions
- **Npm:** https://www.npmjs.com/package/minder-data-provider

---

**Status:** ✅ Ready for Release  
**Confidence Level:** HIGH (all tests passing, comprehensive audit completed)
