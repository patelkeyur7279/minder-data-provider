# 🚀 useMinder() Enhancement Plan - v2.1.0

**Date:** November 12, 2025  
**Target Version:** 2.1.0  
**Goal:** Make `useMinder()` fully functional with OR without `MinderDataProvider`

---

## 📋 Issues to Fix

### ✅ Issues Identified

1. ✅ **Requires MinderDataProvider for Full Functionality**
2. ✅ **Route Must Exist in Global Config** (Needs proper error handling)
3. ✅ **No Parameter Replacement Without Provider**
4. ✅ **Upload Progress is Per-Hook Instance**
5. ✅ **Auth State is Global BUT Methods Require Context**
6. ✅ **Cannot Customize Query Key**
7. ✅ **No Retry Configuration Per-Hook**
8. ✅ **No Manual Cache Control**
9. ✅ **No Request Cancellation API**
10. ✅ **No Conditional Fetching Based on Data**
11. ✅ **No Built-in Infinite Scroll/Pagination**

---

## 🔧 Implementation Plan

### **Phase 1: Core Functionality Improvements** (High Priority)

#### 1.1 Better Route Error Handling

**Current Behavior:**

```typescript
const { data } = useMinder("nonexistent");
// ❌ Error: "Route 'nonexistent' not found in configuration"
```

**New Behavior:**

```typescript
const { data } = useMinder("nonexistent");
// ✅ Error with helpful context:
// "Route 'nonexistent' not found. Did you mean 'users' or 'posts'?
//  Available routes: users, posts, comments
//
//  Add to config:
//  routes: {
//    nonexistent: { url: '/nonexistent', method: 'GET' }
//  }"
```

**Implementation:**

```typescript
// src/hooks/useMinder.ts

function getRouteSuggestions(
  requestedRoute: string,
  availableRoutes: string[]
): string[] {
  // Levenshtein distance for typo detection
  return availableRoutes
    .filter((route) => {
      const distance = levenshteinDistance(requestedRoute, route);
      return distance <= 3; // Allow 3 character difference
    })
    .sort();
}

function validateRoute(route: string, config: MinderConfig): void {
  if (!config.routes?.[route]) {
    const available = Object.keys(config.routes || {});
    const suggestions = getRouteSuggestions(route, available);

    const error = new Error(
      `Route '${route}' not found in configuration.\n\n` +
        (suggestions.length > 0
          ? `Did you mean: ${suggestions.join(", ")}?\n\n`
          : "") +
        `Available routes: ${available.join(", ") || "none configured"}\n\n` +
        `To fix this, add to your config:\n` +
        `routes: {\n` +
        `  ${route}: { url: '/${route}', method: 'GET' }\n` +
        `}`
    );
    error.name = "RouteNotFoundError";
    throw error;
  }
}
```

---

#### 1.2 Parameter Replacement Without Provider

**Current Behavior:**

```typescript
// Without provider
const { data } = useMinder("userById", { params: { id: 123 } });
// ❌ Calls: /users/:id (params not replaced)
```

**New Behavior:**

```typescript
// Works with OR without provider!
const { data } = useMinder("userById", { params: { id: 123 } });
// ✅ Calls: /users/123 (params replaced)
```

**Implementation:**

```typescript
// src/hooks/useMinder.ts

function replaceUrlParams(
  url: string,
  params?: Record<string, unknown>
): string {
  if (!params) return url;

  let finalUrl = url;
  Object.entries(params).forEach(([key, value]) => {
    finalUrl = finalUrl.replace(`:${key}`, String(value));
  });

  return finalUrl;
}

// In queryFn:
if (context?.apiClient) {
  // Use ApiClient (existing behavior)
  const data = await context.apiClient.request(
    route,
    undefined,
    options.params
  );
} else {
  // NEW: Use global config with parameter replacement
  const globalConfig = getGlobalMinderConfig();
  const routeConfig = globalConfig.routes?.[route];

  if (routeConfig) {
    const url = replaceUrlParams(routeConfig.url, options.params);
    result = await minder<TData>(url, null, {
      ...options,
      method: HttpMethod.GET,
    });
  } else {
    // Treat as direct URL
    result = await minder<TData>(route, null, {
      ...options,
      method: HttpMethod.GET,
    });
  }
}
```

---

#### 1.3 Shared Upload Progress

**Current Behavior:**

```typescript
// ComponentA
const { upload } = useMinder("media");
upload.uploadFile(file); // progress = 50%

// ComponentB
const { upload } = useMinder("media");
console.log(upload.progress); // ❌ progress = 0% (different instance)
```

**New Behavior:**

```typescript
// ComponentA
const { upload } = useMinder("media");
upload.uploadFile(file); // progress = 50%

// ComponentB
const { upload } = useMinder("media");
console.log(upload.progress); // ✅ progress = 50% (shared state!)
```

**Implementation:**

```typescript
// src/hooks/useSharedUploadProgress.ts

import { create } from "zustand";

interface UploadProgressState {
  uploads: Record<
    string,
    { loaded: number; total: number; percentage: number }
  >;
  setProgress: (
    uploadId: string,
    progress: { loaded: number; total: number; percentage: number }
  ) => void;
  getProgress: (uploadId: string) => {
    loaded: number;
    total: number;
    percentage: number;
  };
  clearProgress: (uploadId: string) => void;
}

export const useUploadProgressStore = create<UploadProgressState>(
  (set, get) => ({
    uploads: {},

    setProgress: (uploadId, progress) =>
      set((state) => ({
        uploads: { ...state.uploads, [uploadId]: progress },
      })),

    getProgress: (uploadId) =>
      get().uploads[uploadId] || { loaded: 0, total: 0, percentage: 0 },

    clearProgress: (uploadId) =>
      set((state) => {
        const { [uploadId]: _, ...rest } = state.uploads;
        return { uploads: rest };
      }),
  })
);

// In useMinder.ts:
import { useUploadProgressStore } from "./useSharedUploadProgress.js";

export function useMinder<TData = any>(route: string, options = {}) {
  const uploadId = `${route}-upload`;
  const uploadProgress = useUploadProgressStore((state) =>
    state.getProgress(uploadId)
  );
  const setUploadProgress = useUploadProgressStore(
    (state) => state.setProgress
  );

  const uploadMethods = {
    uploadFile: async (file: File) => {
      // Update shared state
      const onProgress = (progress) => setUploadProgress(uploadId, progress);
      return await apiClient.uploadFile(route, file, onProgress);
    },
    progress: uploadProgress,
    isUploading:
      uploadProgress.percentage > 0 && uploadProgress.percentage < 100,
  };

  // ...
}
```

---

#### 1.4 Global Auth Manager (Works Without Context)

**Current Behavior:**

```typescript
// Without provider
const { auth } = useMinder("users");
auth.setToken("token"); // ❌ Does nothing (silent failure)
auth.isAuthenticated(); // ❌ Returns false even with token
```

**New Behavior:**

```typescript
// Works everywhere!
const { auth } = useMinder("users");
auth.setToken("token"); // ✅ Stores in localStorage/memory
auth.isAuthenticated(); // ✅ Returns true
```

**Implementation:**

```typescript
// src/auth/globalAuthManager.ts

class GlobalAuthManager {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private storage: "localStorage" | "sessionStorage" | "memory" =
    "localStorage";

  constructor() {
    // Try to restore token from storage
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("minder_auth_token");
      this.refreshToken = localStorage.getItem("minder_refresh_token");
    }
  }

  async setToken(token: string): Promise<void> {
    this.token = token;
    if (typeof window !== "undefined" && this.storage === "localStorage") {
      localStorage.setItem("minder_auth_token", token);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async clearAuth(): Promise<void> {
    this.token = null;
    this.refreshToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("minder_auth_token");
      localStorage.removeItem("minder_refresh_token");
    }
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // ... other methods
}

export const globalAuthManager = new GlobalAuthManager();

// In useMinder.ts:
import { globalAuthManager } from "../auth/globalAuthManager.js";

const authMethods = {
  setToken: async (token: string) => {
    if (context?.authManager) {
      await context.authManager.setToken(token);
    } else {
      // ✅ NEW: Use global auth manager
      await globalAuthManager.setToken(token);
    }
  },
  getToken: () => {
    return context?.authManager
      ? context.authManager.getToken()
      : globalAuthManager.getToken(); // ✅ Fallback to global
  },
  isAuthenticated: () => {
    return context?.authManager
      ? context.authManager.isAuthenticated()
      : globalAuthManager.isAuthenticated(); // ✅ Fallback to global
  },
  // ... other methods
};
```

---

### **Phase 2: Query Control Enhancements** (Medium Priority)

#### 2.1 Custom Query Key

**New Feature:**

```typescript
const { data } = useMinder("users", {
  // ✅ NEW: Custom query key generator
  queryKey: (route, params) => [
    "users",
    "paginated",
    params.page,
    params.limit,
  ],
  params: { page: 1, limit: 10 },
});
// Query key: ['users', 'paginated', 1, 10]
```

**Implementation:**

```typescript
export interface UseMinderOptions<TData = any> extends MinderOptions<TData> {
  // ... existing options

  /**
   * Custom query key generator
   * @default (route, params) => [route, params]
   */
  queryKey?: (route: string, params?: Record<string, unknown>) => unknown[];
}

// In useMinder.ts:
const queryKey = useMemo(() => {
  if (options.queryKey) {
    return options.queryKey(route, options.params);
  }
  return [route, options.params];
}, [route, JSON.stringify(options.params), options.queryKey]);
```

---

#### 2.2 Per-Hook Retry Configuration

**Current Behavior:**

```typescript
const { data } = useMinder("users", {
  retryConfig: { maxRetries: 5 }, // ❌ Ignored!
});
```

**New Behavior:**

```typescript
const { data } = useMinder("users", {
  retryConfig: {
    maxRetries: 5,
    retryableStatusCodes: [408, 429, 503],
    backoff: "exponential",
  }, // ✅ Actually works!
});
```

**Implementation:**

```typescript
// In useMinder.ts:
const query = useQuery({
  queryKey,
  queryFn: async () => {
    /* ... */
  },
  enabled: isQueryEnabled,
  staleTime: options.cacheTTL || 5 * 60 * 1000,
  refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
  refetchOnReconnect: options.refetchOnReconnect ?? true,
  refetchInterval: options.refetchInterval || false,

  // ✅ NEW: Use retryConfig if provided
  retry: options.retryConfig?.maxRetries ?? retryConfig.retry,
  retryDelay: (attemptIndex) => {
    if (options.retryConfig?.backoff === "linear") {
      return (options.retryConfig.baseDelay || 1000) * attemptIndex;
    }
    // Exponential backoff (default)
    return Math.min(1000 * Math.pow(2, attemptIndex), 30000);
  },

  ...options.queryOptions,
});
```

---

#### 2.3 Manual Cache Control

**New Feature:**

```typescript
const { data } = useMinder("users", {
  cache: false, // ✅ Disables caching completely
  cacheTime: 0, // ✅ Immediate garbage collection
});

const { data } = useMinder("posts", {
  staleTime: 60000, // 1 minute stale time
  gcTime: 300000, // 5 minutes garbage collection time
});
```

**Implementation:**

```typescript
export interface UseMinderOptions<TData = any> extends MinderOptions<TData> {
  // ... existing options

  /**
   * Enable/disable caching
   * @default true
   */
  cache?: boolean;

  /**
   * Cache time (garbage collection time)
   * @default 5 * 60 * 1000 (5 minutes)
   */
  cacheTime?: number;

  /**
   * Stale time (how long data is considered fresh)
   * @default 5 * 60 * 1000 (5 minutes)
   * @alias cacheTTL
   */
  staleTime?: number;

  /**
   * Garbage collection time (when unused cache is removed)
   * @default 10 * 60 * 1000 (10 minutes)
   */
  gcTime?: number;
}

// In useMinder.ts:
const query = useQuery({
  queryKey,
  queryFn: async () => {
    /* ... */
  },
  enabled: isQueryEnabled && options.cache !== false,

  // ✅ NEW: Respect cache options
  staleTime: options.staleTime || options.cacheTTL || 5 * 60 * 1000,
  gcTime: options.gcTime || options.cacheTime || 10 * 60 * 1000,

  ...options.queryOptions,
});
```

---

#### 2.4 Request Cancellation API

**New Feature:**

```typescript
const { data, cancel, isCancelled } = useMinder("users");

// User navigates away or changes search
cancel(); // ✅ Cancels in-flight request
```

**Implementation:**

```typescript
export interface UseMinderReturn<TData = any> {
  // ... existing returns

  /**
   * Cancel the current request
   */
  cancel: () => void;

  /**
   * Whether the last request was cancelled
   */
  isCancelled: boolean;
}

// In useMinder.ts:
const queryClient = useQueryClient();

const cancel = useCallback(() => {
  queryClient.cancelQueries({ queryKey });
}, [queryClient, queryKey]);

const isCancelled = query.fetchStatus === "idle" && query.status === "pending";

return {
  // ... existing returns
  cancel,
  isCancelled,
};
```

---

#### 2.5 Conditional Fetching with Data Dependencies

**Current Issue:**

```typescript
const { data: user } = useMinder("currentUser");
const { data: posts } = useMinder("userPosts", {
  enabled: !!user?.id,
  params: { userId: user?.id }, // ⚠️ Params change causes refetch even when disabled
});
```

**Fix:**

```typescript
const { data: user } = useMinder("currentUser");
const { data: posts } = useMinder("userPosts", {
  enabled: !!user?.id,
  params: { userId: user?.id }, // ✅ Won't refetch if enabled = false
  keepPreviousData: true, // ✅ Smooth transitions
});
```

**Implementation:**

```typescript
// In useMinder.ts:
const queryKey = useMemo(() => {
  // ✅ Only include params in key if query is enabled
  if (options.enabled === false) {
    return [route]; // Don't include params
  }
  return options.queryKey
    ? options.queryKey(route, options.params)
    : [route, options.params];
}, [
  route,
  options.enabled !== false ? JSON.stringify(options.params) : null,
  options.queryKey,
]);
```

---

### **Phase 3: Pagination & Infinite Scroll** (Medium Priority)

#### 3.1 Infinite Scroll Support

**New Feature:**

```typescript
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  fetchPreviousPage,
  hasPreviousPage,
} = useMinder("posts", {
  infinite: true,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  getPreviousPageParam: (firstPage) => firstPage.prevCursor,
});

// Infinite scroll
<InfiniteScroll
  loadMore={fetchNextPage}
  hasMore={hasNextPage}
  isLoading={isFetchingNextPage}>
  {data.pages.map((page) => page.items.map((item) => <Item key={item.id} />))}
</InfiniteScroll>;
```

**Implementation:**

```typescript
import { useInfiniteQuery } from "@tanstack/react-query";

export interface UseMinderOptions<TData = any> extends MinderOptions<TData> {
  // ... existing options

  /**
   * Enable infinite scroll
   * @default false
   */
  infinite?: boolean;

  /**
   * Get next page parameter
   */
  getNextPageParam?: (lastPage: TData) => unknown;

  /**
   * Get previous page parameter
   */
  getPreviousPageParam?: (firstPage: TData) => unknown;

  /**
   * Initial page parameter
   */
  initialPageParam?: unknown;
}

export interface UseMinderReturn<TData = any> {
  // ... existing returns

  /**
   * Infinite scroll methods (only when infinite: true)
   */
  fetchNextPage?: () => Promise<void>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchPreviousPage?: () => Promise<void>;
  hasPreviousPage?: boolean;
  isFetchingPreviousPage?: boolean;
}

// In useMinder.ts:
export function useMinder<TData = any>(route: string, options = {}) {
  const queryClient = useQueryClient();

  // Check if infinite scroll is enabled
  if (options.infinite) {
    // Use useInfiniteQuery instead
    const infiniteQuery = useInfiniteQuery({
      queryKey,
      queryFn: async ({ pageParam }) => {
        // Pass pageParam to API
        const result = await minder<TData>(route, null, {
          ...options,
          params: { ...options.params, cursor: pageParam },
        });
        return result;
      },
      getNextPageParam: options.getNextPageParam,
      getPreviousPageParam: options.getPreviousPageParam,
      initialPageParam: options.initialPageParam || null,
      enabled: isQueryEnabled,
      staleTime: options.staleTime || options.cacheTTL || 5 * 60 * 1000,
      ...options.queryOptions,
    });

    return {
      data: infiniteQuery.data,
      loading: infiniteQuery.isLoading,
      error: infiniteQuery.error,
      fetchNextPage: infiniteQuery.fetchNextPage,
      hasNextPage: infiniteQuery.hasNextPage,
      isFetchingNextPage: infiniteQuery.isFetchingNextPage,
      fetchPreviousPage: infiniteQuery.fetchPreviousPage,
      hasPreviousPage: infiniteQuery.hasPreviousPage,
      isFetchingPreviousPage: infiniteQuery.isFetchingPreviousPage,
      // ... other returns
    };
  }

  // Regular query (existing code)
  const query = useQuery({
    /* ... */
  });
  // ...
}
```

---

## 📦 Breaking Changes

### None! All changes are backward compatible.

- Existing code continues to work
- New features are opt-in
- Default behavior unchanged

---

## 🧪 Testing Plan

### Unit Tests

```typescript
// tests/useMinder-enhancements.test.ts

describe("useMinder Enhancements", () => {
  describe("Route Error Handling", () => {
    it("should provide helpful error for non-existent route", () => {
      const { result } = renderHook(() => useMinder("nonexistent"));
      expect(result.error).toContain("Did you mean");
      expect(result.error).toContain("Available routes");
    });
  });

  describe("Parameter Replacement Without Provider", () => {
    it("should replace URL params without provider", async () => {
      const { result } = renderHook(() =>
        useMinder("userById", { params: { id: 123 } })
      );
      await waitFor(() => expect(result.current.data).toBeDefined());
      // Verify request was made to /users/123
    });
  });

  describe("Shared Upload Progress", () => {
    it("should share progress across components", () => {
      const { result: result1 } = renderHook(() => useMinder("media"));
      const { result: result2 } = renderHook(() => useMinder("media"));

      act(() => {
        result1.current.upload.uploadFile(mockFile);
      });

      expect(result2.current.upload.progress.percentage).toBeGreaterThan(0);
    });
  });

  describe("Global Auth Manager", () => {
    it("should work without provider", async () => {
      const { result } = renderHook(() => useMinder("users"));

      await act(async () => {
        await result.current.auth.setToken("test-token");
      });

      expect(result.current.auth.getToken()).toBe("test-token");
      expect(result.current.auth.isAuthenticated()).toBe(true);
    });
  });

  describe("Custom Query Key", () => {
    it("should allow custom query key generator", () => {
      const queryKeyFn = jest.fn((route, params) => [
        "custom",
        route,
        params.id,
      ]);
      renderHook(() =>
        useMinder("users", {
          queryKey: queryKeyFn,
          params: { id: 1 },
        })
      );

      expect(queryKeyFn).toHaveBeenCalledWith("users", { id: 1 });
    });
  });

  describe("Per-Hook Retry Configuration", () => {
    it("should use custom retry config", () => {
      const { result } = renderHook(() =>
        useMinder("users", {
          retryConfig: { maxRetries: 5 },
        })
      );

      // Verify query has retry: 5
    });
  });

  describe("Manual Cache Control", () => {
    it("should disable caching when cache: false", () => {
      const { result } = renderHook(() => useMinder("users", { cache: false }));
      // Verify query is not cached
    });
  });

  describe("Request Cancellation", () => {
    it("should cancel in-flight requests", async () => {
      const { result } = renderHook(() => useMinder("users"));

      act(() => {
        result.current.refetch();
        result.current.cancel();
      });

      expect(result.current.isCancelled).toBe(true);
    });
  });

  describe("Infinite Scroll", () => {
    it("should support infinite queries", async () => {
      const { result } = renderHook(() =>
        useMinder("posts", {
          infinite: true,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        })
      );

      expect(result.current.fetchNextPage).toBeDefined();
      expect(result.current.hasNextPage).toBeDefined();
    });
  });
});
```

---

## 📝 Documentation Updates

### README.md

Add new section:

````markdown
## 🆕 useMinder() Enhancements (v2.1.0)

### Works With OR Without Provider

All features now work seamlessly with or without `MinderDataProvider`!

```typescript
// ✅ Works without provider
const { data, auth, cache, upload } = useMinder("users");

// ✅ Works with provider (enhanced features)
<MinderDataProvider config={config}>
  <App />
</MinderDataProvider>;
```
````

### New Features

#### Custom Query Keys

```typescript
const { data } = useMinder("users", {
  queryKey: (route, params) => ["users", "sorted", params.sortBy],
  params: { sortBy: "name" },
});
```

#### Per-Hook Retry Configuration

```typescript
const { data } = useMinder("critical-api", {
  retryConfig: {
    maxRetries: 10,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
});
```

#### Manual Cache Control

```typescript
const { data } = useMinder("realtime-data", {
  cache: false, // Disable caching
  staleTime: 0, // Always fetch fresh
});
```

#### Request Cancellation

```typescript
const { data, cancel } = useMinder("search", {
  params: { q: searchTerm },
});

// Cancel on search term change
useEffect(() => {
  return () => cancel();
}, [searchTerm]);
```

#### Infinite Scroll

```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMinder(
  "posts",
  {
    infinite: true,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  }
);
```

```

---

## 🚀 Release Checklist

- [ ] Implement all enhancements
- [ ] Write comprehensive tests (>95% coverage)
- [ ] Update TypeScript types
- [ ] Update documentation
- [ ] Create migration guide (if needed)
- [ ] Test with all platforms (web, Next.js, React Native)
- [ ] Verify backward compatibility
- [ ] Update CHANGELOG.md
- [ ] Create release notes
- [ ] Publish v2.1.0

---

## 📊 Impact Assessment

### Benefits
- ✅ Better developer experience
- ✅ More flexible API
- ✅ Works standalone (no provider required)
- ✅ Backward compatible
- ✅ Comprehensive error messages

### Risks
- ⚠️ Increased bundle size (~5KB for global managers)
- ⚠️ More complex implementation
- ⚠️ Need extensive testing

### Mitigation
- Code splitting for optional features
- Tree-shaking friendly exports
- Comprehensive test coverage

---

**Status:** Ready for implementation
**Target Release:** v2.1.0 (Q1 2026)
```
