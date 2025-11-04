import type { MinderConfig, ApiRoute } from '../core/types.js';
import { createConfigFromPreset, type ConfigPreset, getPresetInfo } from './presets.js';

export interface SimpleConfig {
  apiUrl: string;
  routes?: Record<string, string | ApiRoute>;
  dynamic: any;
  
  // NEW: Preset support
  preset?: ConfigPreset; // 'minimal' | 'standard' | 'advanced' | 'enterprise'
  
  // Existing options (simplified)
  auth?: boolean | { storage?: 'localStorage' | 'sessionStorage' | 'memory' | 'cookie' };
  cache?: boolean | { staleTime?: number };
  cors?: boolean;
  websocket?: boolean | string;
  debug?: boolean;
}

export function createMinderConfig(simple: SimpleConfig): MinderConfig {
  // Start with preset if provided
  let baseConfig: Partial<MinderConfig> = {};
  
  if (simple.preset) {
    baseConfig = createConfigFromPreset(simple.preset);
    
    if (simple.debug) {
      console.log(`[Minder] Using '${simple.preset}' preset:`, getPresetInfo(simple.preset));
    }
  }
  
  const routes: Record<string, ApiRoute> = {};
  
  // Auto-generate CRUD routes if simple strings provided
  if (simple.routes) {
    Object.entries(simple.routes).forEach(([key, value]) => {
      if (typeof value === 'string') {
        // Auto-generate CRUD operations
        routes[key] = { method: 'GET', url: value };
        routes[`create${key.charAt(0).toUpperCase() + key.slice(1)}`] = { method: 'POST', url: value };
        routes[`update${key.charAt(0).toUpperCase() + key.slice(1)}`] = { method: 'PUT', url: `${value}/:id` };
        routes[`delete${key.charAt(0).toUpperCase() + key.slice(1)}`] = { method: 'DELETE', url: `${value}/:id` };
      } else {
        routes[key] = value;
      }
    });
  }

  // Merge preset with user config (user config takes priority)
  return {
    ...baseConfig,
    apiBaseUrl: simple.apiUrl,
    routes,
    dynamic: simple.dynamic,
    
    // Auto-configure auth (overrides preset if provided)
    ...(simple.auth !== undefined && {
      auth: {
        ...(baseConfig.auth || {}),
        tokenKey: 'accessToken',
        storage: typeof simple.auth === 'object' ? simple.auth.storage || 'cookie' : 'cookie'
      }
    }),
    
    // Auto-configure cache (overrides preset if provided)
    ...(simple.cache !== undefined && {
      cache: {
        ...(baseConfig.cache || {}),
        staleTime: typeof simple.cache === 'object' ? simple.cache.staleTime || 300000 : 300000,
        gcTime: 600000,
        refetchOnWindowFocus: false
      }
    }),
    
    // Auto-configure CORS (overrides preset if provided)
    ...(simple.cors !== undefined && {
      cors: {
        ...(baseConfig.cors || {}),
        enabled: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
      }
    }),
    
    // Auto-configure WebSocket (overrides preset if provided)
    ...(simple.websocket !== undefined && {
      websocket: {
        ...(baseConfig.websocket || {}),
        url: typeof simple.websocket === 'string' ? simple.websocket : simple.apiUrl.replace('http', 'ws') + '/ws',
        reconnect: true,
        heartbeat: 30000
      }
    }),
    
    // Auto-configure performance (merge with preset)
    performance: {
      ...(baseConfig.performance || {}),
      deduplication: true,
      retries: 3,
      retryDelay: 1000,
      timeout: 30000
    },
    
    // Auto-detect environment
    autoDetectEnvironment: true,
    environments: {
      development: {
        debug: simple.debug || false,
        cors: { enabled: true }
      },
      production: {
        debug: false
      }
    }
  } as MinderConfig;
}

// Re-export preset utilities
export { createConfigFromPreset, getPresetInfo, type ConfigPreset } from './presets.js';