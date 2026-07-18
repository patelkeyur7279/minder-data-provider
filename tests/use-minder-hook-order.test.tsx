/**
 * 🧪 useMinder — Rules-of-Hooks / hook-order regression suite (task M0-03)
 *
 * Guards against the latent crash "rendered fewer hooks than expected" that
 * occurred when the hook count changed between renders. Three former
 * violations are covered:
 *
 *   1. An early return on invalid routes ran BEFORE many hooks, so the hook
 *      count changed whenever `routeValidation.valid` flipped between renders.
 *   2. `options.infinite ? useInfiniteQuery : useQuery` selected a hook
 *      conditionally, so toggling `infinite` changed hook identity/order.
 *   3. CRUD `useMutation`s were only called when a provider context existed.
 *
 * All three are now unconditional; the invalid-route case is a RESULT branch
 * computed after every hook has run. These tests would throw on the old code.
 */

import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMinder } from "../src/hooks/useMinder";
import {
  setGlobalMinderConfig,
  clearGlobalMinderConfig,
} from "../src/core/globalConfig";
import { MinderError } from "../src/errors/MinderError";
import { HttpMethod } from "../src/constants/enums";

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

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

// Silence the debug output the hook emits for unknown routes.
const originalLog = console.log;
const originalError = console.error;
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});
afterAll(() => {
  console.log = originalLog;
  console.error = originalError;
});

beforeEach(() => {
  clearGlobalMinderConfig();
  setGlobalMinderConfig({
    apiBaseUrl: "https://api.example.com",
    routes: {
      users: { method: HttpMethod.GET, url: "/users" },
      posts: { method: HttpMethod.GET, url: "/posts" },
    },
    dynamic: null,
  } as any);
});

afterEach(() => {
  clearGlobalMinderConfig();
});

// ---------------------------------------------------------------------------
// 1. Route validity flips between renders (the core latent crash)
// ---------------------------------------------------------------------------

describe("useMinder hook order — route validity transitions", () => {
  it("does not crash when the route starts INVALID and becomes VALID", () => {
    const { result, rerender } = renderHook(
      ({ route }) => useMinder(route, { autoFetch: false }),
      {
        wrapper: createWrapper(),
        initialProps: { route: "definitelyNotARoute" },
      }
    );

    // Invalid route → structured validation error, no working query object.
    expect(result.current.error).toBeInstanceOf(MinderError);
    expect(result.current.error.code).toBe("ROUTE_VALIDATION_ERROR");
    expect(typeof result.current.query.refetch).toBe("undefined");

    // Flip to a valid route. On the OLD code this rerender threw
    // "rendered fewer hooks than expected".
    expect(() => rerender({ route: "users" })).not.toThrow();

    // Transitioned to a real, working query state with no validation error.
    expect(result.current.error).toBeNull();
    expect(typeof result.current.query.refetch).toBe("function");
    expect(typeof result.current.refetch).toBe("function");
  });

  it("does not crash when the route starts VALID and becomes INVALID", () => {
    const { result, rerender } = renderHook(
      ({ route }) => useMinder(route, { autoFetch: false }),
      {
        wrapper: createWrapper(),
        initialProps: { route: "users" },
      }
    );

    // Valid route → no validation error, real query object.
    expect(result.current.error).toBeNull();
    expect(typeof result.current.query.refetch).toBe("function");

    // Flip to an unknown route — must not throw on the hook-order change.
    expect(() => rerender({ route: "stillNotARoute" })).not.toThrow();

    expect(result.current.error).toBeInstanceOf(MinderError);
    expect(result.current.error.code).toBe("ROUTE_VALIDATION_ERROR");
  });

  it("survives repeated invalid↔valid toggles without changing hook count", () => {
    const { result, rerender } = renderHook(
      ({ route }) => useMinder(route, { autoFetch: false }),
      {
        wrapper: createWrapper(),
        initialProps: { route: "users" },
      }
    );

    expect(() => {
      rerender({ route: "nope" });
      rerender({ route: "users" });
      rerender({ route: "nope-again" });
      rerender({ route: "posts" });
    }).not.toThrow();

    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. options.infinite toggled between renders
// ---------------------------------------------------------------------------

describe("useMinder hook order — infinite mode toggling", () => {
  it("does not crash when options.infinite flips between renders", () => {
    const { result, rerender } = renderHook(
      ({ infinite }) =>
        useMinder("users", {
          autoFetch: false,
          infinite,
          getNextPageParam: () => undefined,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { infinite: false as boolean },
      }
    );

    // Regular mode: no infinite pagination methods exposed.
    expect(result.current.fetchNextPage).toBeUndefined();
    expect(result.current.hasNextPage).toBeUndefined();

    // Toggle to infinite — OLD code switched useQuery→useInfiniteQuery at the
    // same hook index and threw a hook-order error.
    expect(() => rerender({ infinite: true })).not.toThrow();
    expect(typeof result.current.fetchNextPage).toBe("function");

    // Toggle back.
    expect(() => rerender({ infinite: false })).not.toThrow();
    expect(result.current.fetchNextPage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid-route result shape contract
// ---------------------------------------------------------------------------

describe("useMinder invalid-route result shape", () => {
  it("matches the documented ROUTE_VALIDATION_ERROR contract", () => {
    const { result } = renderHook(
      () => useMinder("missingRoute", { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    const r = result.current;

    // Error contract (mirrors tests/runtime-safety.test.tsx expectations).
    expect(r.error).toBeInstanceOf(MinderError);
    expect(r.error.code).toBe("ROUTE_VALIDATION_ERROR");
    expect(r.error.status).toBe(400);
    expect(r.error.message).toMatch(/Route "missingRoute" not found/);

    // Data / state contract.
    expect(r.data).toBeNull();
    expect(r.items).toBeNull();
    expect(r.loading).toBe(false);
    expect(r.success).toBe(false);
    expect(r.isFetching).toBe(false);
    expect(r.isStale).toBe(false);
    expect(r.isMutating).toBe(false);
    expect(r.isCancelled).toBe(false);

    // Stubbed raw objects and absent CRUD operations (no-op contract).
    expect(r.query).toEqual({});
    expect(r.mutation).toEqual({});
    expect(r.operations).toBeUndefined();

    // Integrated feature stubs are present and callable.
    expect(typeof r.auth.getToken).toBe("function");
    expect(r.auth.getToken()).toBeNull();
    expect(typeof r.cache.invalidate).toBe("function");
    expect(r.cache.getStats()).toEqual([]);
    expect(typeof r.websocket.connect).toBe("function");
    expect(r.websocket.isConnected()).toBe(false);
    expect(r.upload.isUploading).toBe(false);
    expect(r.upload.progress).toEqual({ loaded: 0, total: 0, percentage: 0 });
  });
});
