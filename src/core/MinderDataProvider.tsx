"use client";

// ✅ CRITICAL: Import React hooks directly to avoid bundling issues
// When using namespace imports (import * as React), bundlers can sometimes
// create invalid references causing "Cannot read properties of null" errors
import React, {
  lazy,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import type { ReactNode, ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { HydrationBoundary } from "@tanstack/react-query";

// const ReactQueryDevtools = dynamic(
//   () =>
//     import("@tanstack/react-query-devtools").then(
//       (mod) => mod.ReactQueryDevtools
//     ),
//   { ssr: false }
// );

import type { MinderConfig } from "./types.js";
import { ApiClient } from "./ApiClient.js";
import { AuthManager } from "./AuthManager.js";
import { CacheManager } from "./CacheManager.js";
import { WebSocketManager } from "./WebSocketManager.js";
import { EnvironmentManager } from "./EnvironmentManager.js";
import { ProxyManager } from "./ProxyManager.js";
import { DebugManager } from "../debug/DebugManager.js";
import { DebugLogType } from "../constants/enums.js";
import { setGlobalMinderConfig } from "./globalConfig.js";
import { getMinderContext } from "./MinderContext.js";
import { checkReactVersionAtRuntime } from "../utils/version-validator.js";
import type { MinderContextValue } from "./MinderContext.js";
import {
  selectRealtimeTransport,
  resolveWebSocketConfigForSelection,
  resolveRealtimeConfig,
} from "./realtime/selectTransport.js";
import { LazySseTransport } from "./realtime/LazySseTransport.js";
import type { RealtimeTransport } from "./realtime/types.js";
import { getActiveOfflineManager } from "../platform/offline/registry.js";

// Context accessors live in MinderContext.tsx (kept import-light so hooks
// don't pull the provider's manager construction into consumer bundles).
// Re-exported here so the public surface is unchanged.
export { useMinderContext, useMinderContextSafe } from "./MinderContext.js";
export type { MinderContextValue } from "./MinderContext.js";

// DevTools is dev-only UI — loaded lazily so it lands in its own chunk and
// production bundles never carry it. May appear a tick later than the sync
// version did; it is gated to non-production + debug.devTools anyway.
const LazyDevTools = lazy(() =>
  import("../devtools/DevTools.js").then((m) => ({ default: m.DevTools }))
);

interface MinderDataProviderProps {
  config: MinderConfig;
  children: ReactNode;
  dehydratedState?: DehydratedState;
  fallback?: ReactNode;
}

export function getQueryClientConfig(config: MinderConfig) {
  return {
    defaultOptions: {
      queries: {
        staleTime: config.cache?.staleTime || 5 * 60 * 1000,
        gcTime: config.cache?.gcTime || 10 * 60 * 1000,
        refetchOnWindowFocus: config.cache?.refetchOnWindowFocus ?? false,
        refetchOnReconnect: config.cache?.refetchOnReconnect ?? true,
        retry: config.performance?.retries ?? 1,
        retryDelay: config.performance?.retryDelay ?? 1000,
        enabled: typeof window !== "undefined" || !config.ssr?.enabled,
      },
      mutations: {
        retry: config.performance?.retries ?? 1,
      },
    },
  };
}

export function MinderDataProvider({
  config,
  children,
  dehydratedState,
  fallback,
}: MinderDataProviderProps) {
  const [queryClientRef] = useState(
    () => new QueryClient(getQueryClientConfig(config))
  );

  // Dev-only React-version conflict check (Spec 1.3c §2.4). Moved here off the
  // package's import path so `sideEffects: false` stays honest. `hasChecked`
  // inside checkReactVersionAtRuntime() makes this fire exactly once across all
  // provider mounts; the empty dep array scopes it to first mount.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      checkReactVersionAtRuntime();
    }
  }, []);

  const contextValue = useMemo(() => {
    // Setup environment manager if environments are configured
    let environmentManager: EnvironmentManager | undefined;
    let proxyManager: ProxyManager | undefined;
    let debugManager: DebugManager | undefined;
    let finalConfig: MinderConfig = config;

    // Setup debug manager
    const debugEnabled =
      finalConfig.debug?.enabled ||
      (finalConfig.environments &&
        finalConfig.autoDetectEnvironment &&
        typeof window !== "undefined" &&
        window.location.hostname === "localhost");

    if (debugEnabled) {
      debugManager = new DebugManager(true);
      debugManager.log(
        DebugLogType.API,
        "Minder Data Provider initialized with debug mode"
      );
    }

    if (config.environments) {
      environmentManager = new EnvironmentManager(config);
      finalConfig = environmentManager.getResolvedConfig();
    }

    // Setup proxy if CORS is enabled (checking both corsHelper and deprecated cors)
    const corsConfig = finalConfig.corsHelper || finalConfig.cors;

    if (corsConfig?.enabled) {
      // Auto-Proxy: Default to /api/minder-proxy if no proxy URL provided
      const proxyUrl = corsConfig.proxy || '/api/minder-proxy';

      // Warn in development if using default proxy
      if (!corsConfig.proxy && process.env.NODE_ENV === 'development') {
        console.warn(
          '[Minder] CORS Helper enabled but no proxy URL provided.\n' +
          `Defaulting to '${proxyUrl}'.\n` +
          'Make sure you have created this API route handler in your application.'
        );
      }

      proxyManager = new ProxyManager({
        enabled: true,
        baseUrl: proxyUrl,
        headers: {
          "X-Environment":
            environmentManager?.getCurrentEnvironment() || "development",
          "X-Target-URL": finalConfig.apiBaseUrl,
        },
        timeout: 30000,
        cors: {
          origin: corsConfig.origin,
          methods: corsConfig.methods,
          headers: corsConfig.headers,
          credentials: corsConfig.credentials,
        },
      });
    }

    // Update QueryClient options based on config
    queryClientRef.setDefaultOptions({
      queries: {
        staleTime: finalConfig.cache?.staleTime || 5 * 60 * 1000,
        gcTime: finalConfig.cache?.gcTime || 10 * 60 * 1000,
        refetchOnWindowFocus: finalConfig.cache?.refetchOnWindowFocus ?? false,
        refetchOnReconnect: finalConfig.cache?.refetchOnReconnect ?? true,
        retry: finalConfig.performance?.retries ?? 1,
        retryDelay: finalConfig.performance?.retryDelay ?? 1000,
      },
      mutations: {
        retry: finalConfig.performance?.retries ?? 1,
      },
    });

    // Create Auth Manager
    const authManager = new AuthManager(
      finalConfig.auth,
      debugManager,
      finalConfig.debug?.authLogs
    );

    // Create API Client with CORS support and proxy
    const apiClient = new ApiClient(
      finalConfig,
      authManager,
      proxyManager,
      debugManager
    );

    // Create Cache Manager
    const cacheManager = new CacheManager(
      queryClientRef,
      debugManager,
      finalConfig.debug?.cacheLogs
    );

    // Create the realtime transport (WS or SSE) per the precedence table in
    // Spec 5.2 §3.1. WS stays the default and this branch is byte-for-byte the
    // same construction as before; SSE is lazy-loaded (§4.8) so non-SSE apps
    // never pull SseTransport's module into their bundle (P4).
    const realtimeTransportKind = selectRealtimeTransport(finalConfig);
    let websocketManager: WebSocketManager | undefined;
    let realtimeManager: RealtimeTransport | undefined;

    if (realtimeTransportKind === "ws") {
      websocketManager = new WebSocketManager(
        resolveWebSocketConfigForSelection(finalConfig),
        authManager,
        debugManager,
        finalConfig.debug?.websocketLogs
      );
      realtimeManager = websocketManager;
    } else if (realtimeTransportKind === "sse") {
      realtimeManager = new LazySseTransport(
        () => import("./realtime/SseTransport.js"),
        resolveRealtimeConfig(finalConfig),
        authManager,
        debugManager,
        finalConfig.debug?.websocketLogs ?? false
      );
    }

    // Resync-nudge glue (5.1 §5 / 5.2 §4.6): a conventional 'resync' event
    // triggers an offline sync + full query invalidation; 'invalidate' targets
    // specific keys. Reads the neutral offline registry (not ApiClient) so
    // there's no realtime -> offline import cycle; the transport itself carries
    // no offline import (works for either WS or SSE, whichever was selected).
    if (realtimeManager) {
      realtimeManager.subscribe("resync", () => {
        void getActiveOfflineManager()?.sync();
        void queryClientRef.invalidateQueries();
      });
      realtimeManager.subscribe("invalidate", (payload) => {
        const keys = (payload as { keys?: unknown } | undefined)?.keys;
        void queryClientRef.invalidateQueries(
          keys ? { queryKey: keys as readonly unknown[] } : undefined
        );
      });
    }

    let ReactQueryDevtools:
      | ComponentType<{ initialIsOpen?: boolean }>
      | undefined;
    if (config.dynamic && process.env.NODE_ENV !== "production") {
      ReactQueryDevtools = config.dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (mod) => mod.ReactQueryDevtools
          ),
        { ssr: false }
      );
    }

    return {
      config: finalConfig,
      apiClient,
      authManager,
      cacheManager,
      websocketManager,
      realtimeManager,
      environmentManager,
      proxyManager,
      debugManager,
      queryClient: queryClientRef,
      ReactQueryDevtools,
    };
  }, [config, queryClientRef]);

  // Set global config for standalone hook usage
  useMemo(() => {
    setGlobalMinderConfig(contextValue.config);
  }, [contextValue.config]);

  // Tear down the ApiClient (background timers, request cache, offline listeners)
  // when the provider unmounts or the resolved client changes, to avoid leaks.
  useEffect(() => {
    const { apiClient } = contextValue;
    return () => {
      apiClient.destroy();
    };
  }, [contextValue]);

  const queryClientProviderContent = (
    <QueryClientProvider client={queryClientRef}>
      {dehydratedState ? (
        <HydrationBoundary state={dehydratedState}>
          {children}
        </HydrationBoundary>
      ) : fallback ? (
        <Suspense fallback={fallback}>{children}</Suspense>
      ) : (
        children
      )}

      {process.env.NODE_ENV !== "production" &&
        contextValue.config.debug?.enabled !== false &&
        contextValue.ReactQueryDevtools && (
          <contextValue.ReactQueryDevtools initialIsOpen={false} />
        )}

      {/* Custom DevTools (lazy: own chunk, never in production bundles) */}
      {process.env.NODE_ENV !== "production" &&
        contextValue.config.debug?.enabled !== false &&
        contextValue.config.debug?.devTools && (
          <Suspense fallback={null}>
            <LazyDevTools config={contextValue.config.debug} />
          </Suspense>
        )}
    </QueryClientProvider>
  );

  // Resolve the context at render time (client component) — see ./singletons.ts.
  // No module-scope `createContext` call to be tree-shaken away (MDPD-17).
  const MinderContext = getMinderContext();

  return (
    <MinderContext.Provider value={contextValue}>
      {queryClientProviderContent}
    </MinderContext.Provider>
  );
}

