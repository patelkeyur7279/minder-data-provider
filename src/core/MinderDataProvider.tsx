import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { MinderConfig } from './types.js';
import { createApiSlices } from './SliceGenerator.js';
import { ApiClient } from './ApiClient.js';
import { AuthManager } from './AuthManager.js';
import { CacheManager } from './CacheManager.js';
import { WebSocketManager } from './WebSocketManager.js';
import { EnvironmentManager } from './EnvironmentManager.js';
import { ProxyManager } from './ProxyManager.js';

interface MinderContextValue {
  config: MinderConfig;
  apiClient: ApiClient;
  authManager: AuthManager;
  cacheManager: CacheManager;
  websocketManager?: WebSocketManager;
  environmentManager?: EnvironmentManager;
  proxyManager?: ProxyManager;
  store: any;
  queryClient: QueryClient;
}

const MinderContext = createContext<MinderContextValue | null>(null);

interface MinderDataProviderProps {
  config: MinderConfig;
  children: ReactNode;
}

export function MinderDataProvider({ config, children }: MinderDataProviderProps) {
  const contextValue = useMemo(() => {
    // Setup environment manager if environments are configured
    let environmentManager: EnvironmentManager | undefined;
    let proxyManager: ProxyManager | undefined;
    let finalConfig: MinderConfig = config;
    
    if (config.environments) {
      environmentManager = new EnvironmentManager(config);
      finalConfig = environmentManager.getResolvedConfig();
      
      // Setup proxy if CORS is enabled
      if (finalConfig.cors?.enabled && finalConfig.cors?.proxy) {
        proxyManager = new ProxyManager({
          enabled: true,
          baseUrl: finalConfig.cors.proxy,
          headers: { 
            'X-Environment': environmentManager?.getCurrentEnvironment() || 'development',
            'X-Target-URL': finalConfig.apiBaseUrl
          },
          timeout: 30000
        });
      }
    } else if (config.cors?.enabled && config.cors?.proxy) {
      // Setup proxy even without environments
      proxyManager = new ProxyManager({
        enabled: true,
        baseUrl: config.cors.proxy,
        headers: { 
          'X-Target-URL': config.apiBaseUrl
        },
        timeout: 30000
      });
    }
    
    // Create QueryClient with CORS and performance optimizations
    const queryClient = new QueryClient({
      defaultOptions: {
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
      },
    });

    // Create Auth Manager
    const authManager = new AuthManager(finalConfig.auth);

    // Create API Client with CORS support and proxy
    const apiClient = new ApiClient(finalConfig, authManager, proxyManager);

    // Create Cache Manager
    const cacheManager = new CacheManager(queryClient);

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
            ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
          },
        }),
      devTools: finalConfig.redux?.devTools ?? true,
      preloadedState: finalConfig.redux?.preloadedState,
    });

    return {
      config: finalConfig,
      apiClient,
      authManager,
      cacheManager,
      websocketManager,
      environmentManager,
      proxyManager,
      store,
      queryClient,
    };
  }, [config]);

  return (
    <MinderContext.Provider value={contextValue}>
      <ReduxProvider store={contextValue.store}>
        <QueryClientProvider client={contextValue.queryClient}>
          {children}
          {typeof window !== 'undefined' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </ReduxProvider>
    </MinderContext.Provider>
  );
}

export function useMinderContext(): MinderContextValue {
  const context = useContext(MinderContext);
  if (!context) {
    throw new Error('useMinderContext must be used within MinderDataProvider');
  }
  return context;
}