/**
 * Configuration Presets
 * Simplifies configuration from 15+ options to 3 easy presets
 * 
 * Users can start with preset and customize later
 * 
 * SECURITY NOTICE (v2.1+):
 * All presets now default to storage: 'cookie' for better XSS protection.
 * localStorage is deprecated and will be removed in v3.0.
 * See docs/MIGRATION_STORAGE.md for migration guide.
 */

import type { MinderConfig } from '../core/types.js';

export type ConfigPreset = 'minimal' | 'standard' | 'advanced' | 'enterprise';

/**
 * Preset configurations for different use cases
 */
export const CONFIG_PRESETS: Record<ConfigPreset, Partial<MinderConfig>> = {
  /**
   * MINIMAL - Simple CRUD applications
   * Bundle: ~45KB
   * Features: Basic CRUD only
   */
  minimal: {
    // Only CRUD, no extras
    cache: {
      type: 'memory',
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 50, // 50 items
    },
    performance: {
      deduplication: true,
      batching: false,
      retries: 1,
      timeout: 10000,
      lazyLoading: true,
    },
    debug: {
      enabled: false,
      logLevel: 'error',
    },
  },

  /**
   * STANDARD - Most applications (RECOMMENDED)
   * Bundle: ~90KB
   * Features: CRUD + Auth + Cache + Basic Security
   */
  standard: {
    auth: {
      tokenKey: 'token',
      storage: 'cookie', // Changed from localStorage (v2.1) - More secure, XSS resistant
      refreshUrl: '/api/auth/refresh',
    },
    cache: {
      type: 'hybrid', // Memory + IndexedDB fallback
      ttl: 15 * 60 * 1000, // 15 minutes
      maxSize: 200,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    security: {
      sanitization: true,
      csrfProtection: true,
      rateLimiting: {
        requests: 100,
        window: 60000, // 1 minute
      },
    },
    performance: {
      deduplication: true,
      batching: true,
      batchDelay: 50,
      retries: 3,
      timeout: 30000,
      compression: true,
      lazyLoading: true,
    },
    debug: {
      enabled: process.env.NODE_ENV === 'development',
      logLevel: 'warn',
      performance: true,
    },
  },

  /**
   * ADVANCED - Large applications
   * Bundle: ~120KB
   * Features: Everything except WebSocket
   */
  advanced: {
    auth: {
      tokenKey: 'token',
      storage: 'cookie', // Changed from localStorage (v2.1) - More secure, XSS resistant
      refreshUrl: '/api/auth/refresh',
    },
    cache: {
      type: 'persistent', // IndexedDB for offline support
      ttl: 30 * 60 * 1000, // 30 minutes
      maxSize: 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    security: {
      sanitization: {
        enabled: true,
        allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p'],
      },
      csrfProtection: {
        enabled: true,
        tokenLength: 32,
      },
      rateLimiting: {
        requests: 500,
        window: 60000,
      },
      inputValidation: true,
    },
    performance: {
      deduplication: true,
      batching: true,
      batchDelay: 50,
      monitoring: true,
      retries: 3,
      retryDelay: 1000,
      timeout: 30000,
      compression: true,
      bundleAnalysis: true,
      lazyLoading: true,
    },
    debug: {
      enabled: process.env.NODE_ENV === 'development',
      logLevel: 'info',
      performance: true,
      devTools: true,
      networkLogs: true,
    },
  },

  /**
   * ENTERPRISE - Production-grade applications
   * Bundle: ~150KB (all features)
   * Features: Everything including WebSocket, SSR, Offline
   */
  enterprise: {
    auth: {
      tokenKey: 'token',
      storage: 'cookie',
      refreshUrl: '/api/auth/refresh',
    },
    cache: {
      type: 'persistent',
      ttl: 60 * 60 * 1000, // 1 hour
      maxSize: 5000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    websocket: {
      url: '', // User must provide
      reconnect: true,
      heartbeat: 30000,
    },
    security: {
      encryption: true,
      sanitization: {
        enabled: true,
        allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li'],
      },
      csrfProtection: {
        enabled: true,
        tokenLength: 64,
      },
      rateLimiting: {
        requests: 1000,
        window: 60000,
      },
      headers: {
        contentSecurityPolicy: "default-src 'self'",
        xFrameOptions: 'DENY',
        xContentTypeOptions: true,
        strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      },
      inputValidation: true,
    },
    performance: {
      deduplication: true,
      batching: true,
      batchDelay: 50,
      monitoring: true,
      retries: 5,
      retryDelay: 1000,
      timeout: 60000,
      compression: true,
      bundleAnalysis: true,
      lazyLoading: true,
    },
    ssr: {
      enabled: true,
      hydrate: true,
    },
    debug: {
      enabled: process.env.NODE_ENV === 'development',
      logLevel: 'debug',
      performance: true,
      devTools: true,
      networkLogs: true,
    },
  },
};

/**
 * Create configuration from preset with optional overrides
 * 
 * @example Simple CRUD app
 * const config = createConfigFromPreset('minimal', {
 *   apiBaseUrl: 'https://api.example.com'
 * });
 * 
 * @example Standard app with WebSocket
 * const config = createConfigFromPreset('standard', {
 *   apiBaseUrl: 'https://api.example.com',
 *   websocket: { url: 'wss://api.example.com' }
 * });
 */
export function createConfigFromPreset(
  preset: ConfigPreset,
  overrides: Partial<MinderConfig> = {}
): Partial<MinderConfig> {
  const baseConfig = CONFIG_PRESETS[preset];
  
  // Deep merge preset with overrides
  return deepMerge(baseConfig, overrides);
}

/**
 * Auto-detect appropriate preset based on usage
 * Analyzes config to recommend best preset
 */
export function detectPreset(config: Partial<MinderConfig>): ConfigPreset {
  let score = {
    minimal: 0,
    standard: 0,
    advanced: 0,
    enterprise: 0,
  };

  // Has auth?
  if (config.auth) {
    score.standard += 1;
    score.advanced += 1;
    score.enterprise += 1;
  }

  // Has WebSocket?
  if (config.websocket) {
    score.enterprise += 3;
  }

  // Has SSR?
  if (config.ssr?.enabled) {
    score.advanced += 2;
    score.enterprise += 2;
  }

  // Complex security?
  if (config.security?.encryption || config.security?.headers) {
    score.enterprise += 2;
  }

  // High cache size?
  if (config.cache && (config.cache as any).maxSize > 500) {
    score.advanced += 1;
    score.enterprise += 1;
  }

  // Find highest score
  const entries = Object.entries(score) as [ConfigPreset, number][];
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));

  return best[0];
}

/**
 * Get preset metadata
 */
export function getPresetInfo(preset: ConfigPreset) {
  const info = {
    minimal: {
      name: 'Minimal',
      description: 'Simple CRUD applications',
      bundleSize: '~45KB',
      features: ['Basic CRUD', 'Memory Cache'],
      useCase: 'Small apps, prototypes, MVPs',
    },
    standard: {
      name: 'Standard',
      description: 'Most applications (Recommended)',
      bundleSize: '~90KB',
      features: ['CRUD', 'Auth', 'Cache', 'Security'],
      useCase: 'Production apps, SaaS products',
    },
    advanced: {
      name: 'Advanced',
      description: 'Large applications',
      bundleSize: '~120KB',
      features: ['CRUD', 'Auth', 'Cache', 'Security', 'Offline', 'SSR'],
      useCase: 'Complex apps, PWAs, multi-platform',
    },
    enterprise: {
      name: 'Enterprise',
      description: 'Production-grade applications',
      bundleSize: '~150KB',
      features: ['All Features', 'WebSocket', 'Monitoring', 'Advanced Security'],
      useCase: 'Enterprise apps, real-time systems',
    },
  };

  return info[preset];
}

/**
 * Deep merge utility
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}
