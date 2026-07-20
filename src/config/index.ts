import { Logger, LogLevel as LoggerLogLevel } from '../utils/Logger.js';
import type { MinderConfig, ApiRoute, EnvironmentOverride } from '../core/types.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createConfigFromPreset, type ConfigPreset, getPresetInfo } from './presets.js';
import { HttpMethod, StorageType, Platform, LogLevel, CacheType } from '../constants/enums.js';
import { PlatformDetector } from '../platform/PlatformDetector.js';
import { MinderConfigError } from '../errors/MinderError.js';
import { assertNoExposedSecrets } from '../security/secrets.js';
import { validateMinderConfig } from './validateConfig.js';
import { setGlobalMinderConfig } from '../core/globalConfig.js';
import { setMinderGlobalConfig, clearMinderCache } from '../core/minder.js';
import { pluginManager, type MinderPlugin } from '../plugins/PluginSystem.js';

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

  /**
   * Provider platform config (per-provider sections; secrets only as
   * secret('ENV_NAME') refs — raw secret-shaped strings hard-fail in browsers).
   */
  providers?: Record<string, unknown>;

  /**
   * Next.js dynamic import function - Required for Next.js apps
   * @example
   * import dynamic from 'next/dynamic';
   * configureMinder({ apiUrl: '...', dynamic: dynamic })
   */
  dynamic?: any;

  /**
   * Plugins registered per-configure. Each is wired into the shared plugin
   * manager (the same path `registerPlugins()` uses), so their hooks fire on
   * `minder()` / `useMinder()` requests. Registration is idempotent across
   * re-configure: plugins registered by a previous `configureMinder({ plugins })`
   * call are replaced, so re-configuring does not double-register by name.
   */
  plugins?: MinderPlugin[];

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
    /**
     * Time-to-live in ms. Matches the shape MDP's own presets emit
     * ({ type, ttl, maxSize }) and the documented FEATURES.md example.
     * Normalized to `staleTime` when `staleTime` is not given.
     */
    ttl?: number;
    /** Cache strategy (memory | persistent | hybrid), matching presets. */
    type?: CacheType;
    /** Maximum number of cached entries, matching presets. */
    maxSize?: number;
  };

  /**
   * CORS configuration
   * @deprecated Use corsHelper instead. Will be removed in v3.0.
   * The name "cors" was misleading - this config does NOT bypass CORS restrictions!
   * CORS must be configured on your API server, not in the client.
   */
  cors?: boolean | {
    enabled?: boolean;
    proxy?: string;
  };

  /**
   * CORS Helper configuration
   * ⚠️ IMPORTANT: This does NOT bypass CORS restrictions!
   * CORS must be configured on your API server, not in the client.
   * 
   * What this DOES:
   * - Add helpful request headers
   * - Better error messages for CORS issues
   * - Proxy routing support
   * 
   * What this CANNOT do:
   * - Bypass browser CORS security
   * - Configure server CORS headers
   * - Fix CORS errors from the client
   * 
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
   */
  corsHelper?: boolean | {
    enabled?: boolean;
    proxy?: string;
    credentials?: boolean;
    origin?: string;
    methods?: string[];
    headers?: string[];
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

  // Next.js auto-detection and validation
  if (platform === Platform.NEXT_JS) {
    validateNextJsConfig(config);
  }

  // 🛡️ Runtime Safety: Validate required fields
  if (!config.apiUrl) {
    throw new MinderConfigError(
      'Missing required "apiUrl" in configuration',
      'apiUrl',
      'CONFIG_MISSING_API_URL'
    );
  }

  // 🛡️ Schema validation: catch every problem in one pass so developers fix
  // everything in a single edit instead of playing whack-a-mole with configureMinder
  // throwing once per mistake. Also enforces the `serverOnlyKeys` registry (see
  // ./validateConfig.ts) in browser-like environments.
  const validation = validateMinderConfig(config);
  const validationFailures = validation.errors.filter((e) => e.level === 'error');
  if (validationFailures.length > 0) {
    const report = validation.errors
      .map((e) => `  • [${e.key}] ${e.message}\n    Fix: ${e.fix}`)
      .join('\n');
    throw new MinderConfigError(
      `Invalid Minder configuration — ${validationFailures.length} error(s) found:\n${report}`,
      validationFailures[0]?.key,
      'CONFIG_VALIDATION_ERROR'
    );
  }
  for (const warning of validation.errors) {
    if (warning.level === 'warning') {
      logger.warn(`[Minder config] ${warning.key}: ${warning.message} Fix: ${warning.fix}`);
    }
  }

  // 🛡️ Security: refuse to run if a raw secret value is present in client config
  // (would be shipped in the browser bundle). No-op on the server.
  assertNoExposedSecrets(config);

  // Generate complete configuration with smart defaults
  const fullConfig = buildFullConfig(config, platform, isDevelopment);

  // 🔗 Unify the two global stores so standalone usage sees ONE source of truth:
  //  - the routes-aware registry that useMinder reads for VALIDATION and that
  //    minder() now consults for route-NAME resolution, and
  //  - minder()'s baseURL bag used for URL RESOLUTION.
  // (MinderDataProvider still sets the registry too when a provider is used.)
  setGlobalMinderConfig(fullConfig);
  setMinderGlobalConfig({ baseURL: fullConfig.apiBaseUrl });

  // MDPD-24: reset the standalone minder() response cache on (re)configuration so
  // stale entries from a previous baseURL/config never bleed into the new one.
  clearMinderCache();

  // MDPD-10: register per-instance plugins from config through the shared plugin
  // manager. Idempotent across re-configure — plugins registered by a prior
  // configureMinder({ plugins }) call are unregistered first so a new plugins
  // array replaces the old one instead of double-registering (or warning) by name.
  registerConfigPlugins(config.plugins);

  logger.debug('Minder configured', {
    platform,
    environment: isDevelopment ? 'development' : 'production',
    routes: Object.keys(fullConfig.routes || {}),
    features: getEnabledFeatures(fullConfig)
  });

  return fullConfig;
}

/**
 * Names of plugins registered via a previous `configureMinder({ plugins })` call.
 * Tracked so re-configuring replaces them rather than tripping the plugin
 * manager's already-registered warning or leaking stale plugins.
 */
let configRegisteredPluginNames: string[] = [];

/**
 * Register per-instance plugins from `configureMinder({ plugins })` idempotently.
 * Unregisters plugins from the previous configure call, then registers the new
 * set through the shared plugin manager (the same path `registerPlugins` uses).
 */
function registerConfigPlugins(plugins: MinderPlugin[] | undefined): void {
  // Remove plugins registered by the previous configure call.
  for (const name of configRegisteredPluginNames) {
    pluginManager.unregister(name);
  }
  configRegisteredPluginNames = [];

  if (!plugins || plugins.length === 0) {
    return;
  }

  for (const plugin of plugins) {
    if (!plugin || typeof plugin.name !== 'string' || plugin.name.length === 0) {
      logger.warn(
        '[Minder config] plugins: ignored an entry with no string "name". ' +
          'Fix: each plugin must be an object with a unique string `name`.'
      );
      continue;
    }
    pluginManager.register(plugin);
    configRegisteredPluginNames.push(plugin.name);
  }
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
      // G-05: was `3`, silently overriding MinderDataProvider's documented
      // `?? 1` default (CHANGELOG 2.2.0-beta.1, M0-02) for every consumer
      // that goes through configureMinder(). Explicit `1` here (rather than
      // omitting the key) keeps the value directly test-observable on the
      // configureMinder() return value while staying fully user-overridable
      // — applyUserConfig() below does `{ ...baseConfig.performance,
      // ...userConfig.performance }`, so any explicit user value (including
      // `retries: 0`) still wins.
      retries: 1,
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
        // G-05: `credentials: true` here silently re-enabled the CORS
        // preflight tax that M0-01 opted out by default (ApiClient's
        // `withCredentials: config.cors?.credentials === true`). `enabled`
        // stays `true` — the CORS-error-handling/proxy machinery is still
        // useful by default; only credentialed requests must be opt-in.
        cors: { enabled: true, credentials: false },
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
        cors: { enabled: false }, // Deprecated, kept for backward compatibility
        corsHelper: { enabled: false },
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
        cors: { enabled: false }, // Deprecated, kept for backward compatibility
        corsHelper: { enabled: false },
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
        cors: { enabled: false }, // Deprecated, kept for backward compatibility
        corsHelper: { enabled: false },
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
        cors: { enabled: false }, // Deprecated, kept for backward compatibility
        corsHelper: { enabled: false },
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
  // Provider platform sections pass through verbatim (validated separately
  // by validateMinderConfig; consumed via getProviderConfig).
  if (userConfig.providers !== undefined) {
    baseConfig.providers = userConfig.providers;
  }

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
      const userCache = userConfig.cache;
      // MDPD-9: normalize the documented/preset `ttl` field to `staleTime`.
      // `staleTime` (if explicitly provided) wins; otherwise `ttl` takes effect.
      const normalizedStaleTime =
        userCache.staleTime ?? userCache.ttl ?? baseConfig.cache?.staleTime;
      baseConfig.cache = {
        ...baseConfig.cache,
        ...userCache,
        ...(normalizedStaleTime !== undefined
          ? { staleTime: normalizedStaleTime }
          : {}),
      };
    }
  }

  // CORS configuration (backward compatibility)
  // Handle both old 'cors' and new 'corsHelper' fields
  const corsConfig = (userConfig as any).corsHelper !== undefined
    ? (userConfig as any).corsHelper
    : userConfig.cors;

  if (corsConfig !== undefined) {
    // Show deprecation warning if using old 'cors' field
    if (userConfig.cors !== undefined && (userConfig as any).corsHelper === undefined) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[Minder] DEPRECATION WARNING: config.cors is deprecated and will be removed in v3.0.\n' +
          'Please use config.corsHelper instead.\n\n' +
          'Why? The name "cors" was misleading - this config does NOT bypass CORS restrictions!\n' +
          'CORS must be configured on your API server, not in the client.\n\n' +
          'Change:\n' +
          '  cors: { enabled: true, proxy: "..." }\n' +
          'To:\n' +
          '  corsHelper: { enabled: true, proxy: "..." }\n\n' +
          'See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'
        );
      }
    }

    if (corsConfig === true) {
      // G-05: boolean shorthand `cors: true` / `corsHelper: true` must not
      // imply credentialed requests — `true` here only means "enable the
      // CORS helper", not "opt into cookies/Authorization on cross-origin
      // calls". Mirrors the object-branch opt-in rule below.
      baseConfig.cors = { enabled: true, credentials: false };
      (baseConfig as any).corsHelper = { enabled: true, credentials: false };
    } else if (corsConfig === false) {
      baseConfig.cors = { enabled: false };
      (baseConfig as any).corsHelper = { enabled: false };
    } else {
      const config = {
        enabled: corsConfig.enabled ?? true,
        proxy: corsConfig.proxy,
        // G-05: was `corsConfig.credentials ?? true`, which turned
        // credentials on by default for anyone who enabled CORS/corsHelper
        // without an opinion on credentials. Aligns with ApiClient's
        // `withCredentials: config.cors?.credentials === true` — opt-in
        // only, explicit `credentials: true` from the user still passes
        // through unchanged.
        credentials: corsConfig.credentials === true,
        origin: corsConfig.origin,
        methods: corsConfig.methods,
        headers: corsConfig.headers,
      };
      baseConfig.cors = config; // Keep for backward compatibility
      (baseConfig as any).corsHelper = config; // New field
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

/**
 * Validate Next.js specific configuration.
 *
 * `dynamic` (from `next/dynamic`) lets Minder lazy-load its dev-only devtools in
 * a Next.js app. MDPD-11: this used to hard-throw NEXTJS_DYNAMIC_REQUIRED when
 * `dynamic` was absent — but docs/NEXTJS_APP_ROUTER.md never documents `dynamic`,
 * so following the docs crashed `next build`. It is now a single warning and the
 * config continues with a working default (no dynamic-import devtools).
 */
function validateNextJsConfig(config: UnifiedMinderConfig): void {
  // Check if dynamic property exists and is a function
  const dynamicConfig = (config as any).dynamic;

  if (!dynamicConfig || typeof dynamicConfig !== 'function') {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[Minder] Next.js detected without a "dynamic" import. Minder will run ' +
          'with its dynamic-import devtools disabled. To enable them, pass ' +
          '`dynamic` from next/dynamic:\n' +
          '  import dynamic from "next/dynamic";\n' +
          '  configureMinder({ apiUrl: "...", dynamic, routes: { users: "/users" } });'
      );
    }
  }
}

// Re-export preset utilities for advanced users
export { createConfigFromPreset, getPresetInfo, type ConfigPreset } from './presets.js';

// Re-export core types that users might need when working with config
export type { MinderConfig, ApiRoute, EnvironmentOverride, CorsHelperConfig } from '../core/types.js';