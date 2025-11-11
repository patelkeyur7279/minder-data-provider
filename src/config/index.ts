import { Logger, LogLevel } from '../utils/Logger.js';
import type { MinderConfig, ApiRoute } from '../core/types.js';
import { createConfigFromPreset, type ConfigPreset, getPresetInfo } from './presets.js';
import { HttpMethod, StorageType, ConfigPreset as ConfigPresetEnum, Platform } from '../constants/enums.js';
import { PlatformDetector } from '../platform/PlatformDetector.js';

const logger = new Logger('Config', { level: LogLevel.DEBUG });

/**
 * Ultra-simple configuration - just needs an API URL
 * Everything else is automatically configured with smart defaults
 */
export interface SimpleConfig {
  /** Your API base URL - that's it! */
  apiUrl: string;

  /** Optional: Custom routes if you need them */
  routes?: Record<string, string | ApiRoute>;

  /** Optional: Enable debug mode */
  debug?: boolean;
}

/**
 * Create a production-ready Minder configuration with smart defaults
 * @param config Just provide your API URL - everything else is automatic
 */
export function createMinderConfig(config: SimpleConfig | string): MinderConfig {
  // Allow string shorthand: createMinderConfig("https://api.example.com")
  const simple: SimpleConfig = typeof config === 'string'
    ? { apiUrl: config }
    : config;

  // Auto-detect platform and apply appropriate defaults
  const platform = PlatformDetector.detect();
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Smart defaults based on platform
  const defaults = getSmartDefaults(platform, isDevelopment, simple.apiUrl);

  const routes: Record<string, ApiRoute> = {};

  // Auto-generate basic CRUD routes if custom routes provided
  if (simple.routes) {
    Object.entries(simple.routes).forEach(([key, value]) => {
      if (typeof value === 'string') {
        routes[key] = { method: HttpMethod.GET, url: value };
      } else {
        routes[key] = value;
      }
    });
  }

  return {
    ...defaults,

    // User-provided settings
    apiBaseUrl: simple.apiUrl,
    routes,
    dynamic: {}, // Required by MinderConfig interface

    // Environment-specific overrides
    environments: {
      development: {
        debug: simple.debug ?? true,
        cors: { enabled: true },
      },
      production: {
        debug: false,
      }
    }
  } as MinderConfig;
}

/**
 * Get smart defaults based on platform and environment
 */
function getSmartDefaults(platform: Platform, isDevelopment: boolean, apiUrl: string) {
  const baseDefaults = {
    // Performance - optimized for most use cases
    performance: {
      deduplication: true,
      retries: 3,
      retryDelay: 1000,
      timeout: 30000,
    },

    // Auto-detect environment
    autoDetectEnvironment: true,
  };

  switch (platform) {
    case Platform.WEB:
      return {
        ...baseDefaults,
        // Web-specific: Use sessionStorage, enable CORS
        auth: {
          tokenKey: 'accessToken',
          storage: StorageType.SESSION_STORAGE,
        },
        cache: {
          staleTime: 5 * 60 * 1000, // 5 minutes
          gcTime: 10 * 60 * 1000, // 10 minutes
          refetchOnWindowFocus: !isDevelopment,
        },
        cors: {
          enabled: true,
          credentials: true,
          methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE],
        },
        websocket: {
          url: apiUrl.replace(/^http/, 'ws') + '/ws',
          reconnect: true,
          heartbeat: 30000,
        },
      };

    case Platform.NEXT_JS:
      return {
        ...baseDefaults,
        // Next.js: SSR support, API routes for CORS
        ssr: { enabled: true },
        ssg: { enabled: true },
        cors: {
          enabled: false, // Use Next.js API routes instead
        },
        auth: {
          tokenKey: 'accessToken',
          storage: StorageType.COOKIE, // Secure cookies in Next.js
        },
        cache: {
          staleTime: 2 * 60 * 1000, // 2 minutes (ISR-friendly)
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
      };

    case Platform.REACT_NATIVE:
      return {
        ...baseDefaults,
        // React Native: AsyncStorage, no CORS
        auth: {
          tokenKey: 'accessToken',
          storage: StorageType.ASYNC_STORAGE,
        },
        cache: {
          staleTime: 10 * 60 * 1000, // 10 minutes (offline-friendly)
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false },
        offline: { enabled: true },
      };

    case Platform.EXPO:
      return {
        ...baseDefaults,
        // Expo: SecureStore, enhanced features
        auth: {
          tokenKey: 'accessToken',
          storage: StorageType.SECURE_STORE,
        },
        cache: {
          staleTime: 10 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false },
        offline: { enabled: true },
        pushNotifications: { enabled: true },
      };

    case Platform.ELECTRON:
      return {
        ...baseDefaults,
        // Electron: Node integration, local files
        auth: {
          tokenKey: 'accessToken',
          storage: StorageType.ELECTRON_STORE,
        },
        cache: {
          staleTime: 15 * 60 * 1000, // 15 minutes
          gcTime: 60 * 60 * 1000, // 1 hour
          refetchOnWindowFocus: false,
        },
        cors: { enabled: false },
        websocket: { 
          url: apiUrl.replace(/^http/, 'ws') + '/ws',
          reconnect: true,
          heartbeat: 30000,
        },
      };

    default:
      return baseDefaults;
  }
}

// Re-export preset utilities for advanced users
export { createConfigFromPreset, getPresetInfo, type ConfigPreset } from './presets.js';