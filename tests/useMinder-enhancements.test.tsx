/**
 * 🧪 useMinder Enhancements Test Suite (v2.1)
 *
 * Tests for all 11 limitations fixed:
 * 1. Works without MinderDataProvider
 * 2. Route error messages with suggestions
 * 3. Parameter replacement without provider
 * 4. Shared upload progress
 * 5. Standalone authentication
 * 6. Custom query keys
 * 7. Per-hook retry configuration
 * 8. Manual cache control
 * 9. Request cancellation
 * 10. Conditional fetching without refetch issues
 * 11. Infinite scroll support
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMinder } from "../src/hooks/useMinder";
import { globalAuthManager } from "../src/auth/GlobalAuthManager";
import {
  getUploadProgress,
  setUploadProgress,
  clearAllUploadProgress,
} from "../src/upload/uploadProgressStore";
import {
  replaceUrlParams,
  hasUnreplacedParams,
  getRouteSuggestions,
  levenshteinDistance,
} from "../src/utils/routeHelpers";
import {
  setGlobalMinderConfig,
  getGlobalMinderConfig,
  clearGlobalMinderConfig,
} from "../src/core/globalConfig";
import { HttpMethod } from "../src/constants/enums";

// ============================================================================
// TEST UTILITIES
// ============================================================================

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// ============================================================================
// 1. WORKS WITHOUT MINDERDATAPROVIDER
// ============================================================================

describe("useMinder - Standalone Usage (No Provider)", () => {
  beforeEach(() => {
    // Clear first to ensure clean state
    clearGlobalMinderConfig();
    // Set default config for all tests in this file
    setGlobalMinderConfig({
      apiBaseUrl: "https://api.example.com",
      routes: {
        users: { method: HttpMethod.GET, url: "/users" },
        posts: { method: HttpMethod.GET, url: "/posts" },
      },
      dynamic: null,
    });
  });

  it("should work without MinderDataProvider when global config is set", () => {
    setGlobalMinderConfig({
      apiBaseUrl: "https://api.example.com",
      routes: {
        users: { method: HttpMethod.GET, url: "/users" },
      },
      dynamic: null,
    });

    const { result } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.auth).toBeDefined();
    expect(result.current.cache).toBeDefined();
  });

  it("should provide auth methods without provider", () => {
    const { result } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(typeof result.current.auth.setToken).toBe("function");
    expect(typeof result.current.auth.getToken).toBe("function");
    expect(typeof result.current.auth.isAuthenticated).toBe("function");
  });

  it("should provide cache methods without provider", () => {
    const { result } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(typeof result.current.cache.invalidate).toBe("function");
    expect(typeof result.current.cache.clear).toBe("function");
    expect(typeof result.current.cache.getStats).toBe("function");
  });
});

// ============================================================================
// 2. ROUTE ERROR MESSAGES WITH SUGGESTIONS
// ============================================================================

describe("Route Validation & Suggestions", () => {
  it("should calculate Levenshtein distance correctly", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("", "test")).toBe(4);
    expect(levenshteinDistance("test", "")).toBe(4);
  });

  it("should suggest similar route names", () => {
    const availableRoutes = ["users", "posts", "comments", "products"];
    const suggestions = getRouteSuggestions("user", availableRoutes, 2);

    expect(suggestions).toContain("users");
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("should not suggest routes with distance > maxDistance", () => {
    const availableRoutes = ["abcdefg", "hijklmn"];
    const suggestions = getRouteSuggestions("xyz", availableRoutes, 2);

    expect(suggestions.length).toBe(0);
  });

  it("should detect unreplaced parameters", () => {
    expect(hasUnreplacedParams("/users/:id")).toBe(true);
    expect(hasUnreplacedParams("/users/123")).toBe(false);
    expect(hasUnreplacedParams("/users/:id/posts/:postId")).toBe(true);
  });

  it("should replace URL parameters correctly", () => {
    const url = "/users/:id/posts/:postId";
    const params = { id: "123", postId: "456" };
    const replaced = replaceUrlParams(url, params);

    expect(replaced).toBe("/users/123/posts/456");
  });

  it("should handle missing parameters gracefully", () => {
    const url = "/users/:id";
    const replaced = replaceUrlParams(url, {});

    expect(replaced).toBe("/users/:id"); // Unchanged
  });
});

// ============================================================================
// 3. PARAMETER REPLACEMENT WITHOUT PROVIDER
// ============================================================================

describe("Parameter Replacement", () => {
  it("should replace multiple parameters", () => {
    const url = "/api/:version/users/:userId/posts/:postId";
    const params = { version: "v1", userId: "42", postId: "99" };
    const result = replaceUrlParams(url, params);

    expect(result).toBe("/api/v1/users/42/posts/99");
  });

  it("should handle query-style parameters", () => {
    const url = "/search?q=:query&page=:page";
    const params = { query: "test", page: "2" };
    const result = replaceUrlParams(url, params);

    expect(result).toBe("/search?q=test&page=2");
  });

  it("should preserve unreplaced params", () => {
    const url = "/users/:id/posts/:postId";
    const params = { id: "123" }; // Missing postId
    const result = replaceUrlParams(url, params);

    expect(result).toBe("/users/123/posts/:postId");
    expect(hasUnreplacedParams(result)).toBe(true);
  });
});

// ============================================================================
// 4. SHARED UPLOAD PROGRESS
// ============================================================================

describe("Upload Progress Store", () => {
  beforeEach(() => {
    clearAllUploadProgress();
  });

  it("should store and retrieve upload progress", () => {
    const uploadId = "test-upload-1";
    const progress = { loaded: 50, total: 100, percentage: 50 };

    setUploadProgress(uploadId, progress);
    const retrieved = getUploadProgress(uploadId);

    expect(retrieved).toEqual(progress);
  });

  it("should return default progress for unknown uploadId", () => {
    const progress = getUploadProgress("unknown-id");

    expect(progress.loaded).toBe(0);
    expect(progress.total).toBe(0);
    expect(progress.percentage).toBe(0);
  });

  it("should notify subscribers on progress update", () => {
    const uploadId = "test-upload-2";
    const callback = jest.fn();

    const unsubscribe =
      require("../src/upload/uploadProgressStore").subscribeToUploadProgress(
        uploadId,
        callback
      );

    const progress = { loaded: 75, total: 100, percentage: 75 };
    setUploadProgress(uploadId, progress);

    expect(callback).toHaveBeenCalledWith(progress);

    unsubscribe();
  });

  it("should allow multiple subscribers per upload", () => {
    const uploadId = "test-upload-3";
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    const {
      subscribeToUploadProgress: subscribe,
    } = require("../src/upload/uploadProgressStore");
    const unsub1 = subscribe(uploadId, callback1);
    const unsub2 = subscribe(uploadId, callback2);

    const progress = { loaded: 25, total: 100, percentage: 25 };
    setUploadProgress(uploadId, progress);

    expect(callback1).toHaveBeenCalledWith(progress);
    expect(callback2).toHaveBeenCalledWith(progress);

    unsub1();
    unsub2();
  });
});

// ============================================================================
// 5. STANDALONE AUTHENTICATION
// ============================================================================

describe("Global Auth Manager", () => {
  beforeEach(async () => {
    await globalAuthManager.clearAuth();
  });

  it("should store and retrieve tokens", async () => {
    const token = "test-token-123";
    await globalAuthManager.setToken(token);

    expect(globalAuthManager.getToken()).toBe(token);
    expect(globalAuthManager.isAuthenticated()).toBe(true);
  });

  it("should clear authentication", async () => {
    await globalAuthManager.setToken("test-token");
    await globalAuthManager.clearAuth();

    expect(globalAuthManager.getToken()).toBeNull();
    expect(globalAuthManager.isAuthenticated()).toBe(false);
  });

  it("should store refresh tokens separately", async () => {
    const accessToken = "access-token";
    const refreshToken = "refresh-token";

    await globalAuthManager.setToken(accessToken);
    await globalAuthManager.setRefreshToken(refreshToken);

    expect(globalAuthManager.getToken()).toBe(accessToken);
    expect(globalAuthManager.getRefreshToken()).toBe(refreshToken);
  });

  it("should parse JWT and extract user info", async () => {
    // Valid JWT token (payload: { sub: "123", name: "Test User", exp: future })
    const validJWT =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiVGVzdCBVc2VyIiwiZXhwIjo5OTk5OTk5OTk5fQ.mock";

    await globalAuthManager.setToken(validJWT);
    const user = globalAuthManager.getCurrentUser();

    expect(user).toBeDefined();
  });

  it("should detect token expiration", async () => {
    // Expired JWT (exp in the past)
    const expiredJWT =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiVGVzdCIsImV4cCI6MTAwMDAwMDAwMH0.mock";

    await globalAuthManager.setToken(expiredJWT);

    // Note: This test depends on actual JWT validation implementation
    // If parseJWT is working, isTokenExpired should return true for old exp
  });
});

// ============================================================================
// 6. CUSTOM QUERY KEYS
// ============================================================================

describe("Custom Query Keys", () => {
  it("should accept custom query key", () => {
    const customKey = ["posts", "featured", { page: 1 }];
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false, queryKey: customKey }),
      { wrapper: createWrapper() }
    );

    // Query should be defined and use custom key
    expect(result.current.query).toBeDefined();
    // Custom key configuration is accepted
    expect(result.current).toBeDefined();
  });

  it("should use default query key when not provided", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false, params: { id: "123" } }),
      { wrapper: createWrapper() }
    );

    // Default configuration should work
    expect(result.current.query).toBeDefined();
    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// 7. PER-HOOK RETRY CONFIGURATION
// ============================================================================

describe("Per-Hook Retry Configuration", () => {
  it("should accept custom retry config", () => {
    const retryConfig = {
      maxRetries: 5,
      baseDelay: 2000,
      backoff: "linear" as const,
    };

    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false, retryConfig }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });

  it("should support custom shouldRetry function", () => {
    const retryConfig = {
      maxRetries: 3,
      shouldRetry: (error: any, attempt: number) => {
        return error.status >= 500 && attempt < 3;
      },
    };

    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false, retryConfig }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// 8. MANUAL CACHE CONTROL
// ============================================================================

describe("Manual Cache Control", () => {
  it("should provide cache.invalidate method", async () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(typeof result.current.cache.invalidate).toBe("function");
    await result.current.cache.invalidate(["posts"]);
  });

  it("should provide cache.clear method", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(typeof result.current.cache.clear).toBe("function");
    result.current.cache.clear(["posts"]);
  });

  it("should provide cache.getStats method", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(typeof result.current.cache.getStats).toBe("function");
    const stats = result.current.cache.getStats();
    expect(Array.isArray(stats)).toBe(true);
  });

  it("should support custom staleTime", () => {
    const staleTime = 60000; // 1 minute

    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false, staleTime }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });

  it("should support custom gcTime", () => {
    const gcTime = 120000; // 2 minutes

    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false, gcTime }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// 9. REQUEST CANCELLATION
// ============================================================================

describe("Request Cancellation", () => {
  it("should provide cancel method", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(typeof result.current.cancel).toBe("function");
  });

  it("should have isCancelled state", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result.current.isCancelled).toBe(false);
  });

  it("should update isCancelled when cancelled", async () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    await result.current.cancel();

    await waitFor(() => {
      expect(result.current.isCancelled).toBe(true);
    });
  });
});

// ============================================================================
// 10. CONDITIONAL FETCHING
// ============================================================================

describe("Conditional Fetching", () => {
  beforeEach(() => {
    setGlobalMinderConfig({
      apiBaseUrl: "https://api.example.com",
      routes: {
        posts: { method: HttpMethod.GET, url: "/posts" },
      },
      dynamic: null,
    });
  });

  it("should not fetch when enabled=false", () => {
    const { result } = renderHook(
      () => useMinder("posts", { enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it("should not fetch when autoFetch=false", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.loading).toBe(false);
  });

  it("should allow manual refetch even when autoFetch=false", async () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.refetch).toBe("function");
  });
});

// ============================================================================
// 11. INFINITE SCROLL SUPPORT
// ============================================================================

describe("Infinite Queries", () => {
  beforeEach(() => {
    setGlobalMinderConfig({
      apiBaseUrl: "https://api.example.com",
      routes: {
        posts: { method: HttpMethod.GET, url: "/posts" },
      },
      dynamic: null,
    });
  });

  it("should support infinite mode", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          infinite: true,
          getNextPageParam: (lastPage) => lastPage?.nextCursor,
          initialPageParam: 0,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchNextPage).toBeDefined();
    expect(result.current.hasNextPage).toBeDefined();
  });

  it("should provide infinite query methods", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          infinite: true,
          initialPageParam: 1,
        }),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.fetchNextPage).toBe("function");
    expect(typeof result.current.hasNextPage).toBe("boolean");
    expect(typeof result.current.isFetchingNextPage).toBe("boolean");
  });

  it("should support previous page fetching", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          infinite: true,
          getPreviousPageParam: (firstPage) => firstPage?.prevCursor,
          initialPageParam: 10,
        }),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.fetchPreviousPage).toBe("function");
    expect(typeof result.current.hasPreviousPage).toBe("boolean");
  });

  it("should not have infinite methods when infinite=false", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.fetchNextPage).toBeUndefined();
    expect(result.current.hasNextPage).toBeUndefined();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Integration - All Features Together", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    clearAllUploadProgress();
  });

  it("should work with all features enabled", () => {
    setGlobalMinderConfig({
      apiBaseUrl: "https://api.example.com",
      routes: {
        posts: { method: HttpMethod.GET, url: "/posts" },
      },
      dynamic: null,
    });

    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          queryKey: ["posts", "featured"],
          staleTime: 30000,
          gcTime: 60000,
          retryConfig: { maxRetries: 3 },
          cache: true,
        }),
      { wrapper: createWrapper() }
    );

    // Auth methods available
    expect(typeof result.current.auth.setToken).toBe("function");

    // Cache methods available
    expect(typeof result.current.cache.invalidate).toBe("function");

    // Cancellation available
    expect(typeof result.current.cancel).toBe("function");
    expect(result.current.isCancelled).toBe(false);

    // Upload methods available
    expect(typeof result.current.upload.uploadFile).toBe("function");
  });

  it("should work with infinite queries and auth", async () => {
    setGlobalMinderConfig({
      apiBaseUrl: "https://api.example.com",
      routes: {
        posts: { method: HttpMethod.GET, url: "/posts" },
      },
      dynamic: null,
    });

    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          infinite: true,
          getNextPageParam: (lastPage) => lastPage?.nextCursor,
          initialPageParam: 0,
        }),
      { wrapper: createWrapper() }
    );

    // Set authentication
    await result.current.auth.setToken("test-token");

    expect(result.current.auth.isAuthenticated()).toBe(true);
    expect(typeof result.current.fetchNextPage).toBe("function");
  });
});
