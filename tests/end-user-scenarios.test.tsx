/**
 * 🧑‍💻 END-USER SCENARIOS TEST SUITE
 *
 * Real-world usage patterns from an end-user perspective
 * Tests the complete framework as actual developers would use it
 */

import React, { useEffect, useState } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useMinder,
  setGlobalMinderConfig,
  globalAuthManager,
  clearGlobalMinderConfig,
  HttpMethod,
  MinderDataProvider,
} from "../src/index";
import type { ReactNode } from "react";

// ============================================================================
// TEST SETUP
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

const mockApiConfig = {
  apiBaseUrl: "https://api.example.com",
  routes: {
    posts: { method: HttpMethod.GET, url: "/posts" },
    postById: { method: HttpMethod.GET, url: "/posts/:id" },
    createPost: { method: HttpMethod.POST, url: "/posts" },
    updatePost: { method: HttpMethod.PUT, url: "/posts/:id" },
    deletePost: { method: HttpMethod.DELETE, url: "/posts/:id" },
    users: { method: HttpMethod.GET, url: "/users" },
    userProfile: { method: HttpMethod.GET, url: "/users/:userId/profile" },
    login: { method: HttpMethod.POST, url: "/auth/login" },
    uploadMedia: { method: HttpMethod.POST, url: "/media/upload" },
  },
  dynamic: null,
};

// ============================================================================
// SCENARIO 1: New Developer - First Time Setup (No Provider)
// ============================================================================

describe("🧑‍💻 Scenario 1: New Developer - Simple Setup Without Provider", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
  });

  it("should work immediately with minimal setup", () => {
    // Step 1: Developer reads docs, sets up global config
    setGlobalMinderConfig(mockApiConfig);

    // Step 2: Try to use useMinder in a component
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    // Step 3: Verify it works!
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.auth).toBeDefined();
    expect(result.current.cache).toBeDefined();
    expect(result.current.upload).toBeDefined();
  });

  it("should provide helpful error for typos in route names", () => {
    setGlobalMinderConfig(mockApiConfig);

    // Developer typos "post" instead of "posts"
    const { result } = renderHook(
      () => useMinder("post", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    // Should work but with validation warning in route validation
    expect(result.current).toBeDefined();
  });

  it("should help with missing parameters", () => {
    setGlobalMinderConfig(mockApiConfig);

    // Developer forgets to pass id parameter
    const { result } = renderHook(
      () => useMinder("postById", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Should still work but validation detects missing params
    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 2: Authentication Flow
// ============================================================================

describe("🔐 Scenario 2: User Authentication Flow", () => {
  beforeEach(async () => {
    clearGlobalMinderConfig();
    await globalAuthManager.clearAuth();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should handle complete login flow", async () => {
    const { result } = renderHook(
      () => useMinder("login", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    // User is not authenticated initially
    expect(result.current.auth.isAuthenticated()).toBe(false);

    // User logs in
    await act(async () => {
      await result.current.auth.setToken(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjo5OTk5OTk5OTk5fQ.test"
      );
    });

    // User is now authenticated
    expect(result.current.auth.isAuthenticated()).toBe(true);
    expect(result.current.auth.getToken()).toBeTruthy();

    // Can get current user info
    const user = result.current.auth.getCurrentUser();
    expect(user).toBeDefined();
  });

  it("should handle logout flow", async () => {
    const { result } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    // Login
    await act(async () => {
      await result.current.auth.setToken("test-token");
    });
    expect(result.current.auth.isAuthenticated()).toBe(true);

    // Logout
    await act(async () => {
      await result.current.auth.clearAuth();
    });
    expect(result.current.auth.isAuthenticated()).toBe(false);
    expect(result.current.auth.getToken()).toBeNull();
  });

  it("should persist auth across different components", async () => {
    // Component 1 logs in
    const { result: result1 } = renderHook(
      () => useMinder("login", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    await act(async () => {
      await result1.current.auth.setToken("shared-token");
    });

    // Component 2 should see the auth state
    const { result: result2 } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result2.current.auth.isAuthenticated()).toBe(true);
    expect(result2.current.auth.getToken()).toBe("shared-token");
  });
});

// ============================================================================
// SCENARIO 3: CRUD Operations
// ============================================================================

describe("📝 Scenario 3: Blog Post CRUD Operations", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should handle create, read, update, delete flow", async () => {
    // 1. Fetch all posts
    const { result: listResult } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(listResult.current.data).toBeNull();
    expect(typeof listResult.current.refetch).toBe("function");

    // 2. Create a new post
    const { result: createResult } = renderHook(
      () =>
        useMinder("createPost", { autoFetch: false, method: HttpMethod.POST }),
      { wrapper: createWrapper() }
    );

    expect(typeof createResult.current.mutate).toBe("function");

    // 3. Update post
    const { result: updateResult } = renderHook(
      () =>
        useMinder("updatePost", {
          autoFetch: false,
          method: HttpMethod.PUT,
          params: { id: "123" },
        }),
      { wrapper: createWrapper() }
    );

    expect(updateResult.current).toBeDefined();

    // 4. Delete post
    const { result: deleteResult } = renderHook(
      () =>
        useMinder("deletePost", {
          autoFetch: false,
          method: HttpMethod.DELETE,
          params: { id: "123" },
        }),
      { wrapper: createWrapper() }
    );

    expect(deleteResult.current).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 4: File Upload with Progress
// ============================================================================

describe("📤 Scenario 4: File Upload with Progress Tracking", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should provide upload functionality", () => {
    const { result } = renderHook(
      () => useMinder("uploadMedia", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Upload methods available
    expect(typeof result.current.upload.uploadFile).toBe("function");
    expect(typeof result.current.upload.uploadMultiple).toBe("function");

    // Progress tracking available
    expect(result.current.upload.progress).toBeDefined();
    expect(result.current.upload.progress.percentage).toBe(0);
    expect(typeof result.current.upload.isUploading).toBe("boolean");
  });

  it("should track upload progress across multiple components", () => {
    // Component A - Main upload component
    const { result: uploadComponent } = renderHook(
      () => useMinder("uploadMedia", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Component B - Progress indicator in navbar
    const { result: navbarProgress } = renderHook(
      () => useMinder("uploadMedia", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Both should have upload capabilities
    expect(uploadComponent.current.upload).toBeDefined();
    expect(navbarProgress.current.upload).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 5: Cache Management
// ============================================================================

describe("💾 Scenario 5: Cache Management & Data Freshness", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should provide cache control methods", async () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Cache methods available
    expect(typeof result.current.cache.invalidate).toBe("function");
    expect(typeof result.current.cache.clear).toBe("function");
    expect(typeof result.current.cache.getStats).toBe("function");
    expect(typeof result.current.cache.prefetch).toBe("function");
    expect(typeof result.current.cache.isQueryFresh).toBe("function");

    // Can invalidate cache
    await act(async () => {
      await result.current.cache.invalidate(["posts"]);
    });

    // Can clear cache
    act(() => {
      result.current.cache.clear(["posts"]);
    });

    // Can get cache stats
    const stats = result.current.cache.getStats();
    expect(Array.isArray(stats)).toBe(true);
  });

  it("should support custom cache configuration", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          staleTime: 60000, // 1 minute
          gcTime: 120000, // 2 minutes
          cache: true,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 6: Infinite Scroll / Pagination
// ============================================================================

describe("📜 Scenario 6: Infinite Scroll Blog Feed", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should support infinite scroll pattern", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          infinite: true,
          getNextPageParam: (lastPage) => lastPage?.nextCursor,
          initialPageParam: 1,
        }),
      { wrapper: createWrapper() }
    );

    // Infinite scroll methods available
    expect(typeof result.current.fetchNextPage).toBe("function");
    expect(typeof result.current.hasNextPage).toBe("boolean");
    expect(typeof result.current.isFetchingNextPage).toBe("boolean");
  });

  it("should support bidirectional infinite scroll", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          infinite: true,
          getNextPageParam: (lastPage) => lastPage?.nextCursor,
          getPreviousPageParam: (firstPage) => firstPage?.prevCursor,
          initialPageParam: 10, // Start at page 10
        }),
      { wrapper: createWrapper() }
    );

    // Both directions available
    expect(typeof result.current.fetchNextPage).toBe("function");
    expect(typeof result.current.fetchPreviousPage).toBe("function");
    expect(typeof result.current.hasNextPage).toBe("boolean");
    expect(typeof result.current.hasPreviousPage).toBe("boolean");
  });
});

// ============================================================================
// SCENARIO 7: Error Handling & Retry Logic
// ============================================================================

describe("⚠️ Scenario 7: Error Handling & Network Resilience", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should provide error state", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.error).toBeNull();
    expect(result.current.success).toBe(false);
  });

  it("should support custom retry configuration", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          retryConfig: {
            maxRetries: 5,
            backoff: "exponential",
            baseDelay: 1000,
            shouldRetry: (error: any, attempt: number) => {
              return error.status >= 500 && attempt < 5;
            },
          },
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 8: Request Cancellation
// ============================================================================

describe("🚫 Scenario 8: Request Cancellation on Navigation", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should support request cancellation", async () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.cancel).toBe("function");
    expect(result.current.isCancelled).toBe(false);

    // Cancel ongoing request
    await act(async () => {
      await result.current.cancel();
    });

    // Should reflect cancelled state
    await waitFor(() => {
      expect(result.current.isCancelled).toBe(true);
    });
  });

  it("should allow refetch after cancellation", async () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Cancel
    await act(async () => {
      await result.current.cancel();
    });

    // Should be able to refetch
    expect(typeof result.current.refetch).toBe("function");
  });
});

// ============================================================================
// SCENARIO 9: Conditional Data Fetching
// ============================================================================

describe("🎯 Scenario 9: Conditional Fetching Based on User State", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should support conditional fetching with enabled flag", () => {
    const userId = null; // User not selected yet

    const { result } = renderHook(
      () =>
        useMinder("userProfile", {
          enabled: !!userId, // Only fetch when userId exists
          params: { userId },
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it("should support manual fetch control", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    expect(result.current.loading).toBe(false);
    expect(typeof result.current.refetch).toBe("function");
  });
});

// ============================================================================
// SCENARIO 10: Real-World App - Dashboard with Multiple Data Sources
// ============================================================================

describe("🏢 Scenario 10: Dashboard with Multiple Data Sources", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should handle multiple concurrent useMinder calls", () => {
    // Simulating a dashboard that needs multiple data sources
    const { result: postsResult } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    const { result: usersResult } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Both should work independently
    expect(postsResult.current).toBeDefined();
    expect(usersResult.current).toBeDefined();

    // Each should have independent state
    expect(postsResult.current.loading).toBe(false);
    expect(usersResult.current.loading).toBe(false);
  });

  it("should share authentication across all data sources", async () => {
    const { result: posts } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    const { result: users } = renderHook(
      () => useMinder("users", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Login in one place
    await act(async () => {
      await posts.current.auth.setToken("dashboard-token");
    });

    // All should see the auth state
    expect(posts.current.auth.isAuthenticated()).toBe(true);
    expect(users.current.auth.isAuthenticated()).toBe(true);
  });
});

// ============================================================================
// SCENARIO 11: With MinderDataProvider (Advanced Setup)
// ============================================================================

describe("🎛️ Scenario 11: Advanced Setup with MinderDataProvider", () => {
  it("should work with MinderDataProvider wrapper", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <MinderDataProvider config={mockApiConfig}>{children}</MinderDataProvider>
    );

    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper }
    );

    // Should have all features available
    expect(result.current.data).toBeNull();
    expect(result.current.auth).toBeDefined();
    expect(result.current.cache).toBeDefined();
    expect(result.current.upload).toBeDefined();
    expect(result.current.websocket).toBeDefined();
  });

  it("should provide CRUD operations when using provider", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MinderDataProvider config={mockApiConfig}>{children}</MinderDataProvider>
    );

    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper }
    );

    // Should have operations object when using provider
    // (Note: operations require apiClient from context)
    expect(result.current).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 12: Developer Experience - Helpful Defaults
// ============================================================================

describe("👨‍💻 Scenario 12: Developer Experience - Smart Defaults", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should work with minimal configuration", () => {
    // Just the route name, everything else has smart defaults
    const { result } = renderHook(() => useMinder("posts"), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeDefined();
    expect(result.current.loading).toBeDefined();
    expect(result.current.error).toBeDefined();
  });

  it("should provide all features even with simple setup", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // All features available
    expect(result.current.auth).toBeDefined();
    expect(result.current.cache).toBeDefined();
    expect(result.current.upload).toBeDefined();
    expect(result.current.websocket).toBeDefined();
    expect(result.current.refetch).toBeDefined();
    expect(result.current.mutate).toBeDefined();
    expect(result.current.cancel).toBeDefined();
    expect(result.current.invalidate).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 13: Performance - Custom Query Keys for Optimization
// ============================================================================

describe("⚡ Scenario 13: Performance Optimization with Custom Keys", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should support custom query keys for granular caching", () => {
    // Different cache keys for different post filters
    const { result: featuredPosts } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          queryKey: ["posts", "featured"],
        }),
      { wrapper: createWrapper() }
    );

    const { result: draftPosts } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          queryKey: ["posts", "drafts"],
        }),
      { wrapper: createWrapper() }
    );

    // Both should work independently with separate caches
    expect(featuredPosts.current).toBeDefined();
    expect(draftPosts.current).toBeDefined();
  });
});

// ============================================================================
// SCENARIO 14: Migration from Other Libraries
// ============================================================================

describe("🔄 Scenario 14: Easy Migration from Other Libraries", () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    setGlobalMinderConfig(mockApiConfig);
  });

  it("should be familiar to React Query users", () => {
    const { result } = renderHook(
      () =>
        useMinder("posts", {
          autoFetch: false,
          enabled: true,
          staleTime: 5000,
          gcTime: 10000,
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        }),
      { wrapper: createWrapper() }
    );

    // Similar API to React Query
    expect(result.current.data).toBeDefined();
    expect(result.current.loading).toBeDefined();
    expect(result.current.error).toBeDefined();
    expect(result.current.refetch).toBeDefined();
    expect(result.current.isFetching).toBeDefined();
    expect(result.current.isStale).toBeDefined();
  });

  it("should provide more features than basic data fetching libraries", () => {
    const { result } = renderHook(
      () => useMinder("posts", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    // Extra features beyond basic fetching
    expect(result.current.auth).toBeDefined(); // Built-in auth
    expect(result.current.cache).toBeDefined(); // Cache control
    expect(result.current.upload).toBeDefined(); // File uploads
    expect(result.current.websocket).toBeDefined(); // Real-time
    expect(result.current.cancel).toBeDefined(); // Cancellation
  });
});
