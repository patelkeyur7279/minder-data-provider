import { Logger, LogLevel as LoggerLogLevel } from '../utils/Logger.js';
import type { MinderConfig, ApiRoute, EnvironmentOverride } from '../core/types.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createConfigFromPreset, type ConfigPreset, getPresetInfo } from './presets.js';
import { HttpMethod, StorageType, Platform, LogLevel } from '../constants/enums.js';
import { PlatformDetector } from '../platform/PlatformDetector.js';

const logger = new Logger('Config', { level: LoggerLogLevel.DEBUG });

/**
 * 🎯 UNIFIED MINDER CONFIGURATION
 *
 * One configuration system for all applications - from simple to enterprise.
 * Smart defaults, platform detection, and progressive enhancement.
 *
 * @example Simple App (3 lines)
 * configureMinder({
 *   apiUrl: 'https://api.example.com',
 *   routes: { users: '/users' }
 * });
 *
 * @example Enterprise App (Full config)
 * configureMinder({
 *   apiUrl: 'https://api.example.com',
 *   routes: { users: '/users', posts: '/posts' },
 *   auth: { storage: 'cookie' },
 *   cache: { staleTime: 300000 },
 *   websocket: { url: 'wss://api.example.com' },
 *   security: { csrfProtection: true },
 *   debug: { enabled: true }
 * });
 */
export interface UnifiedMinderConfig {
  /** Your API base URL - required */
  apiUrl: string;

  /** API routes - auto-generates CRUD operations */
  routes?: Record<string, string | ApiRoute>;

  /** Authentication configuration */
  auth?: boolean | {
    storage?: StorageType;
    tokenKey?: string;
    refreshUrl?: string;
  };

  /** Caching configuration */
  cache?: boolean | {
    staleTime?: number;
    gcTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
  };

  /** CORS configuration */
  cors?: boolean | {
    enabled?: boolean;
    proxy?: string;
  };

  /** WebSocket configuration */
  websocket?: boolean | {
    url?: string;
    reconnect?: boolean;
    heartbeat?: number;
  };

  /** Security configuration */
  security?: boolean | {
    csrfProtection?: boolean;
    sanitization?: boolean;
    rateLimiting?: {
      requests: number;
      window: number;
    };
  };

  /** Debug configuration */
  debug?: boolean | {
    enabled?: boolean;
    logLevel?: LogLevel;
    performance?: boolean;
    devTools?: boolean;
  };

  /** Performance configuration */
  performance?: {
    deduplication?: boolean;
    retries?: number;
    timeout?: number;
    compression?: boolean;
  };

  /** SSR configuration */
  ssr?: boolean | {
    enabled?: boolean;
    prefetch?: string[];
  };

  /** Environment overrides */
  environments?: Record<string, {
    apiUrl?: string;
    cors?: { proxy?: string };
    debug?: boolean;
  }>;
}

/**
 * 🎯 CONFIGURE MINDER - The One Configuration Function
 *
 * Unified configuration for all Minder features. Smart defaults,
 * platform detection, and progressive enhancement.
 *
 * @param config - Unified configuration object
 * @returns Complete MinderConfig ready for MinderDataProvider
 */
export function configureMinder(config: UnifiedMinderConfig): MinderConfig {
  // Auto-detect platform and environment
  const platform = PlatformDetector.detect();
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Generate complete configuration with smart defaults
  const fullConfig = buildFullConfig(config, platform, isDevelopment);

  logger.debug('Minder configured', {
    platform,
    environment: isDevelopment ? 'development' : 'production',
    routes: Object.keys(fullConfig.routes || {}),
    features: getEnabledFeatures(fullConfig)
  });

  return fullConfig;
}

/**
 * Build complete MinderConfig from unified config
 */
function buildFullConfig(
  config: UnifiedMinderConfig,
  platform: Platform,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isDevelopment: boolean
): MinderConfig {
  // Base configuration
  const baseConfig: Partial<MinderConfig> = {
    apiBaseUrl: config.apiUrl,
    dynamic: {}, // Required by interface
    autoDetectEnvironment: true,
  };

  // Auto-generate CRUD routes
  const routes = generateCrudRoutes(config.routes || {});
  baseConfig.routes = routes;

  // Apply platform-specific defaults
  const platformDefaults = getPlatformDefaults(platform, config.apiUrl);
  Object.assign(baseConfig, platformDefaults);

  // Apply user configuration (overrides defaults)
  applyUserConfig(baseConfig, config, platform);

  // Apply environment overrides
  if (config.environments) {
    baseConfig.environments = Object.entries(config.environments).reduce((acc, [env, overrides]) => {
      acc[env] = {
        apiBaseUrl: overrides.apiUrl,
        cors: overrides.cors ? { proxy: overrides.cors.proxy } : undefined,
        debug: overrides.debug,
      };
      return acc;
    }, {} as Record<string, EnvironmentOverride>);
  }

  return baseConfig as MinderConfig;
}

/**
 * Generate CRUD routes from simple route definitions
 */
function generateCrudRoutes(routes: Record<string, string | ApiRoute>): Record<string, ApiRoute> {
  const fullRoutes: Record<string, ApiRoute> = {};

  Object.entries(routes).forEach(([key, value]) => {
    if (typeof value === 'string') {
      // Simple string route - generate CRUD operations
      const baseUrl = value;
      const singular = key.replace(/s$/, ''); // users -> user
      const capitalized = singular.charAt(0).toUpperCase() + singular.slice(1);

      // Base route
      fullRoutes[key] = { method: HttpMethod.GET, url: baseUrl };

      // CRUD operations
      fullRoutes[`create${capitalized}`] = { method: HttpMethod.POST, url: baseUrl };
      fullRoutes[`update${capitalized}`] = { method: HttpMethod.PUT, url: `${baseUrl}/:id` };
      fullRoutes[`delete${capitalized}`] = { method: HttpMethod.DELETE, url: `${baseUrl}/:id` };
    } else {
      // Explicit ApiRoute definition
      fullRoutes[key] = value;
    }
  });

  return fullRoutes;
}

/**
 * Get platform-specific defaults
 */
function getPlatformDefaults(platform: Platform, apiUrl: string): Partial<MinderConfig> {
  const defaults: Partial<MinderConfig> = {
    performance: {
      deduplication: true,
      retries: 3,
      retryDelay: 1000,
      timeout: 30000,
      compression: true,
      lazyLoading: true,
    }
  };

  switch (platform) {
    case Platform.WEB:
      return {
        ...defaults,
        auth: { tokenKey: 'token', storage: StorageType.COOKIE },
        cache: {
          staleTime: 5 * 60 * 1000,
          gcTime: 10 * 60 * 1000,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
        },
        cors: { enabled: true, credentials: true },
        websocket: {
          url: apiUrl.replace(/^http/, 'ws') + '/ws',
          reconnect: true,
          heartbeat: 30000,
        },
      };

    case Platform.NEXT_JS:
      return {
        ...defaults,
        ssr: { enabled: true },
        auth: { tokenKey: 'token', storage: StorageType.COOKIE },
        cache: {
          staleTime: 2 * 60 * 1000,
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false }, // Next.js handles CORS
      };

    case Platform.REACT_NATIVE:
      return {
        ...defaults,
        auth: { tokenKey: 'token', storage: StorageType.ASYNC_STORAGE },
        cache: {
          staleTime: 10 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false },
        offline: { enabled: true },
      };

    case Platform.EXPO:
      return {
        ...defaults,
        auth: { tokenKey: 'token', storage: StorageType.SECURE_STORE },
        cache: {
          staleTime: 10 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false },
        offline: { enabled: true },
      };

    case Platform.ELECTRON:
      return {
        ...defaults,
        auth: { tokenKey: 'token', storage: StorageType.ELECTRON_STORE },
        cache: {
          staleTime: 15 * 60 * 1000,
          gcTime: 60 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false },
        websocket: {
          url: apiUrl.replace(/^http/, 'ws') + '/ws',
          reconnect: true,
          heartbeat: 30000,
        },
      };

    case Platform.NODE:
      return {
        ...defaults,
        auth: { tokenKey: 'token', storage: StorageType.MEMORY },
        cache: {
          staleTime: 5 * 60 * 1000,
          gcTime: 10 * 60 * 1000,
        },
        cors: { enabled: false },
      };

    default:
      return defaults;
  }
}

/**
 * Apply user configuration overrides
 */
function applyUserConfig(
  baseConfig: Partial<MinderConfig>,
  userConfig: UnifiedMinderConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  platform: Platform
): void {
  // Auth configuration
  if (userConfig.auth !== undefined) {
    if (userConfig.auth === true) {
      // Use platform default
    } else if (userConfig.auth === false) {
      baseConfig.auth = undefined;
    } else {
      baseConfig.auth = {
        tokenKey: userConfig.auth.tokenKey || 'token',
        storage: userConfig.auth.storage || baseConfig.auth?.storage || StorageType.COOKIE,
        refreshUrl: userConfig.auth.refreshUrl,
      };
    }
  }

  // Cache configuration
  if (userConfig.cache !== undefined) {
    if (userConfig.cache === true) {
      // Use platform default
    } else if (userConfig.cache === false) {
      baseConfig.cache = undefined;
    } else {
      baseConfig.cache = {
        ...baseConfig.cache,
        ...userConfig.cache,
      };
    }
  }

  // CORS configuration
  if (userConfig.cors !== undefined) {
    if (userConfig.cors === true) {
      baseConfig.cors = { enabled: true, credentials: true };
    } else if (userConfig.cors === false) {
      baseConfig.cors = { enabled: false };
    } else {
      baseConfig.cors = {
        enabled: userConfig.cors.enabled ?? true,
        proxy: userConfig.cors.proxy,
        credentials: true,
      };
    }
  }

  // WebSocket configuration
  if (userConfig.websocket !== undefined) {
    if (userConfig.websocket === true) {
      // Use platform default
    } else if (userConfig.websocket === false) {
      baseConfig.websocket = undefined;
    } else {
      baseConfig.websocket = {
        url: userConfig.websocket.url || baseConfig.websocket?.url || '',
        reconnect: userConfig.websocket.reconnect ?? true,
        heartbeat: userConfig.websocket.heartbeat ?? 30000,
      };
    }
  }

  // Security configuration
  if (userConfig.security !== undefined) {
    if (userConfig.security === true) {
      baseConfig.security = {
        csrfProtection: true,
        sanitization: true,
        rateLimiting: { requests: 100, window: 60000 },
      };
    } else if (userConfig.security === false) {
      baseConfig.security = undefined;
    } else {
      baseConfig.security = {
        csrfProtection: userConfig.security.csrfProtection ?? false,
        sanitization: userConfig.security.sanitization ?? false,
        rateLimiting: userConfig.security.rateLimiting,
      };
    }
  }

  // Debug configuration
  if (userConfig.debug !== undefined) {
    if (userConfig.debug === true) {
      baseConfig.debug = {
        enabled: true,
        logLevel: LogLevel.INFO,
        performance: true,
        devTools: true,
      };
    } else if (userConfig.debug === false) {
      baseConfig.debug = { enabled: false };
    } else {
      baseConfig.debug = {
        enabled: userConfig.debug.enabled ?? true,
        logLevel: userConfig.debug.logLevel ?? LogLevel.INFO,
        performance: userConfig.debug.performance ?? false,
        devTools: userConfig.debug.devTools ?? false,
      };
    }
  }

  // Performance configuration
  if (userConfig.performance) {
    baseConfig.performance = {
      ...baseConfig.performance,
      ...userConfig.performance,
    };
  }

  // SSR configuration
  if (userConfig.ssr !== undefined) {
    if (userConfig.ssr === true) {
      baseConfig.ssr = { enabled: true, hydrate: true };
    } else if (userConfig.ssr === false) {
      baseConfig.ssr = { enabled: false };
    } else {
      baseConfig.ssr = {
        enabled: userConfig.ssr.enabled ?? true,
        prefetch: userConfig.ssr.prefetch,
        hydrate: true,
      };
    }
  }
}

/**
 * Get list of enabled features for logging
 */
function getEnabledFeatures(config: Partial<MinderConfig>): string[] {
  const features: string[] = [];

  if (config.auth) features.push('auth');
  if (config.cache) features.push('cache');
  if (config.cors?.enabled) features.push('cors');
  if (config.websocket) features.push('websocket');
  if (config.security) features.push('security');
  if (config.debug?.enabled) features.push('debug');
  if (config.ssr?.enabled) features.push('ssr');

  return features;
}

// Re-export preset utilities for advanced users
export { createConfigFromPreset, getPresetInfo, type ConfigPreset } from './presets.js';