"use client";

/**
 * MinderContext — the React context and its accessors, split from the
 * provider component (bundle-surgery cut 1).
 *
 * This module must stay LIGHT: manager classes are imported as TYPES only,
 * so hooks that need `useMinderContext` no longer pull the provider's
 * construction code (ApiClient, AuthManager, CacheManager, WebSocketManager,
 * EnvironmentManager, ProxyManager, DebugManager, DevTools) into every
 * consumer bundle. Do not add value imports of managers here.
 */
import { createContext, useContext } from "react";
import type { ComponentType } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";

import type { MinderConfig } from "./types.js";
import type { ApiClient } from "./ApiClient.js";
import type { AuthManager } from "./AuthManager.js";
import type { CacheManager } from "./CacheManager.js";
import type { WebSocketManager } from "./WebSocketManager.js";
import type { EnvironmentManager } from "./EnvironmentManager.js";
import type { ProxyManager } from "./ProxyManager.js";
import type { DebugManager } from "../debug/DebugManager.js";

export interface MinderContextValue {
  config: MinderConfig;
  apiClient: ApiClient;
  authManager: AuthManager;
  cacheManager: CacheManager;
  websocketManager?: WebSocketManager;
  environmentManager?: EnvironmentManager;
  proxyManager?: ProxyManager;
  debugManager?: DebugManager;
  queryClient: QueryClient;
  ReactQueryDevtools?: ComponentType<{ initialIsOpen?: boolean }>;
  dehydratedState?: DehydratedState;
}

export const MinderContext = createContext<MinderContextValue | null>(null);

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
