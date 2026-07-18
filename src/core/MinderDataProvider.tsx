"use client";

// ✅ CRITICAL: Import React hooks directly to avoid bundling issues
// When using namespace imports (import * as React), bundlers can sometimes
// create invalid references causing "Cannot read properties of null" errors
import React, {
  createContext,
  useContext,
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
import { DevTools } from "../devtools/DevTools.js";
import { DebugLogType } from "../constants/enums.js";
import { setGlobalMinderConfig } from "./globalConfig.js";

// ---------------------------------------------------------------------------
// Redux is an OPTIONAL peer dependency: react-redux, @reduxjs/toolkit, and
// SliceGenerator.ts (which statically imports @reduxjs/toolkit) must never be
// hard-resolved when those packages aren't installed. Probe for them once, at
// module load time, via `require()` inside try/catch — this mirrors
// AuthManager's optional-dependency pattern (src/core/AuthManager.ts) and
// keeps detection synchronous so the store can still be created inside the
// render-time useMemo below when the packages ARE present.
type ReduxStore = ReturnType<typeof import("@reduxjs/toolkit").configureStore>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ReduxProviderComponent: ComponentType<{ store: any; children?: ReactNode }> | undefined;
let configureStoreFn: typeof import("@reduxjs/toolkit").configureStore | undefined;
let createApiSlicesFn: typeof import("./SliceGenerator.js").createApiSlices | undefined;

try {
  ReduxProviderComponent = require("react-redux").Provider;
  configureStoreFn = require("@reduxjs/toolkit").configureStore;
  createApiSlicesFn = require("./SliceGenerator.js").createApiSlices;
} catch {
  // react-redux / @reduxjs/toolkit not installed - Redux support is disabled.
  ReduxProviderComponent = undefined;
  configureStoreFn = undefined;
  createApiSlicesFn = undefined;
}

const isReduxSupportAvailable = Boolean(
  ReduxProviderComponent && configureStoreFn && createApiSlicesFn
);

interface MinderContextValue {
  config: MinderConfig;
  apiClient: ApiClient;
  authManager: AuthManager;
  cacheManager: CacheManager;
  websocketManager?: WebSocketManager;
  environmentManager?: EnvironmentManager;
  proxyManager?: ProxyManager;
  debugManager?: DebugManager;
  /**
   * Redux store. Only present when react-redux + @reduxjs/toolkit (optional
   * peers) are installed AND `config.redux !== false`. Consumers must not
   * assume this is always defined - see useReduxSlice/useStore for the
   * "Redux not enabled" error thrown when it's absent.
   */
  store?: ReduxStore;
  queryClient: QueryClient;
  ReactQueryDevtools?: ComponentType<{ initialIsOpen?: boolean }>;
  dehydratedState?: DehydratedState;
}

const MinderContext = createContext<MinderContextValue | null>(null);

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

    // Create WebSocket Manager if configured
    const websocketManager = finalConfig.websocket
      ? new WebSocketManager(
        finalConfig.websocket,
        authManager,
        debugManager,
        finalConfig.debug?.websocketLogs
      )
      : undefined;

    // Redux is opt-out via `config.redux === false`, and only ever enabled
    // when react-redux + @reduxjs/toolkit (optional peers) are installed.
    const reduxExplicitlyDisabled = finalConfig.redux === false;
    const reduxConfig = finalConfig.redux === false ? undefined : finalConfig.redux;
    const reduxEnabled =
      !reduxExplicitlyDisabled &&
      isReduxSupportAvailable &&
      !!createApiSlicesFn &&
      !!configureStoreFn;

    let store: ReduxStore | undefined;
    if (reduxEnabled && createApiSlicesFn && configureStoreFn) {
      // Generate Redux slices for all routes
      const slices = createApiSlicesFn(finalConfig.routes, apiClient);

      // Create Redux store
      store = configureStoreFn({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reducer: slices.reducers as any,
        middleware: (getDefaultMiddleware) =>
          getDefaultMiddleware({
            serializableCheck: {
              ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
            },
          }),
        devTools: reduxConfig?.devTools ?? true,
        preloadedState: reduxConfig?.preloadedState,
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
      environmentManager,
      proxyManager,
      debugManager,
      store,
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

      {/* Custom DevTools */}
      {process.env.NODE_ENV !== "production" &&
        contextValue.config.debug?.enabled !== false &&
        contextValue.config.debug?.devTools && (
          <DevTools config={contextValue.config.debug} />
        )}
    </QueryClientProvider>
  );

  return (
    <MinderContext.Provider value={contextValue}>
      {contextValue.store && ReduxProviderComponent ? (
        <ReduxProviderComponent store={contextValue.store}>
          {queryClientProviderContent}
        </ReduxProviderComponent>
      ) : (
        queryClientProviderContent
      )}
    </MinderContext.Provider>
  );
}

export function useMinderContext(): MinderContextValue {
  const context = useContext(MinderContext);
  if (!context) {
    throw new Error("useMinderContext must be used within MinderDataProvider");
  }
  return context;
}

/**
 * Non-throwing variant for hooks that support standalone (no-provider) mode.
 * Returns `null` outside a MinderDataProvider instead of throwing, so callers
 * don't need to wrap a hook call in try/catch (which violates the Rules of
 * Hooks and breaks hook-order guarantees if the accessor ever grows).
 */
export function useMinderContextSafe(): MinderContextValue | null {
  return useContext(MinderContext);
}
