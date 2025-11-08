'use client';

// ✅ CRITICAL: Import React hooks directly to avoid bundling issues
// When using namespace imports (import * as React), bundlers can sometimes
// create invalid references causing "Cannot read properties of null" errors
import { 
  createContext, 
  useContext, 
  useMemo, 
  useState, 
  Suspense 
} from 'react';
import type { ReactNode, ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { HydrationBoundary } from '@tanstack/react-query';

// const ReactQueryDevtools = dynamic(
//   () =>
//     import("@tanstack/react-query-devtools").then(
//       (mod) => mod.ReactQueryDevtools
//     ),
//   { ssr: false }
// );

import { Provider as ReduxProvider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { MinderConfig } from "./types.js";
import { createApiSlices } from "./SliceGenerator.js";
import { ApiClient } from "./ApiClient.js";
import { AuthManager } from "./AuthManager.js";
import { CacheManager } from "./CacheManager.js";
import { WebSocketManager } from "./WebSocketManager.js";
import { EnvironmentManager } from "./EnvironmentManager.js";
import { ProxyManager } from "./ProxyManager.js";
import { DebugManager } from "../debug/DebugManager.js";

interface MinderContextValue {
  config: MinderConfig;
  apiClient: ApiClient;
  authManager: AuthManager;
  cacheManager: CacheManager;
  websocketManager?: WebSocketManager;
  environmentManager?: EnvironmentManager;
  proxyManager?: ProxyManager;
  debugManager?: DebugManager;
  store: ReturnType<typeof configureStore>;
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

function getQueryClientConfig(config: MinderConfig) {
  return {
    defaultOptions: {
      queries: {
        staleTime: config.cache?.staleTime || 5 * 60 * 1000,
        gcTime: config.cache?.gcTime || 10 * 60 * 1000,
        refetchOnWindowFocus: config.cache?.refetchOnWindowFocus ?? false,
        refetchOnReconnect: config.cache?.refetchOnReconnect ?? true,
        retry: config.performance?.retries || 3,
        retryDelay: config.performance?.retryDelay || 1000,
        enabled: typeof window !== 'undefined' || !config.ssr?.enabled,
      },
      mutations: {
        retry: config.performance?.retries || 1,
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
  const [queryClientRef] = useState(() => new QueryClient(getQueryClientConfig(config)));
  
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
        "api",
        "Minder Data Provider initialized with debug mode"
      );
    }

    if (config.environments) {
      environmentManager = new EnvironmentManager(config);
      finalConfig = environmentManager.getResolvedConfig();

      // Setup proxy if CORS is enabled
      if (finalConfig.cors?.enabled && finalConfig.cors?.proxy) {
        proxyManager = new ProxyManager({
          enabled: true,
          baseUrl: finalConfig.cors.proxy,
          headers: {
            "X-Environment":
              environmentManager?.getCurrentEnvironment() || "development",
            "X-Target-URL": finalConfig.apiBaseUrl,
          },
          timeout: 30000,
        });
      }
    } else if (config.cors?.enabled && config.cors?.proxy) {
      // Setup proxy even without environments
      proxyManager = new ProxyManager({
        enabled: true,
        baseUrl: config.cors.proxy,
        headers: {
          "X-Target-URL": config.apiBaseUrl,
        },
        timeout: 30000,
      });
    }

    // Update QueryClient options based on config
    queryClientRef.setDefaultOptions({
      queries: {
        staleTime: finalConfig.cache?.staleTime || 5 * 60 * 1000,
        gcTime: finalConfig.cache?.gcTime || 10 * 60 * 1000,
        refetchOnWindowFocus: finalConfig.cache?.refetchOnWindowFocus ?? false,
        refetchOnReconnect: finalConfig.cache?.refetchOnReconnect ?? true,
        retry: finalConfig.performance?.retries || 3,
        retryDelay: finalConfig.performance?.retryDelay || 1000,
      },
      mutations: {
        retry: finalConfig.performance?.retries || 1,
      },
    });

    // Create Auth Manager
    const authManager = new AuthManager(finalConfig.auth);

    // Create API Client with CORS support and proxy
    const apiClient = new ApiClient(finalConfig, authManager, proxyManager, debugManager);

    // Create Cache Manager
    const cacheManager = new CacheManager(queryClientRef);

    // Create WebSocket Manager if configured
    const websocketManager = finalConfig.websocket
      ? new WebSocketManager(finalConfig.websocket, authManager)
      : undefined;

    // Generate Redux slices for all routes
    const slices = createApiSlices(finalConfig.routes, apiClient);

    // Create Redux store
    const store = configureStore({
      reducer: slices.reducers as any,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: {
            ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
          },
        }),
      devTools: finalConfig.redux?.devTools ?? true,
      preloadedState: finalConfig.redux?.preloadedState,
    });

    let ReactQueryDevtools: ComponentType<{ initialIsOpen?: boolean }> | undefined;
    if (config.dynamic && process.env.NODE_ENV !== 'production') {
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

  return (
    <MinderContext.Provider value={contextValue}>
      <ReduxProvider store={contextValue.store}>
        <QueryClientProvider client={queryClientRef}>
          {dehydratedState ? (
            <HydrationBoundary state={dehydratedState}>
              {children}
            </HydrationBoundary>
          ) : fallback ? (
            <Suspense fallback={fallback}>
              {children}
            </Suspense>
          ) : (
            children
          )}

          {process.env.NODE_ENV !== 'production' && contextValue.ReactQueryDevtools && (
            <contextValue.ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </ReduxProvider>
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
