import type { MinderConfig, ApiRoute } from '../core/types.js';

export interface SimpleConfig {
  apiUrl: string;
  routes?: Record<string, string | ApiRoute>;
  dynamic: any;
  auth?: boolean | { storage?: 'localStorage' | 'sessionStorage' | 'memory' };
  cache?: boolean | { staleTime?: number };
  cors?: boolean;
  websocket?: boolean | string;
  debug?: boolean;
}

export function createMinderConfig(simple: SimpleConfig): MinderConfig {
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

  return {
    apiBaseUrl: simple.apiUrl,
    routes,
    dynamic: simple.dynamic,
    // Auto-configure auth
    ...(simple.auth && {
      auth: {
        tokenKey: 'accessToken',
        storage: typeof simple.auth === 'object' ? simple.auth.storage || 'localStorage' : 'localStorage'
      }
    }),
    
    // Auto-configure cache
    ...(simple.cache && {
      cache: {
        staleTime: typeof simple.cache === 'object' ? simple.cache.staleTime || 300000 : 300000,
        gcTime: 600000,
        refetchOnWindowFocus: false
      }
    }),
    
    // Auto-configure CORS
    ...(simple.cors && {
      cors: {
        enabled: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
      }
    }),
    
    // Auto-configure WebSocket
    ...(simple.websocket && {
      websocket: {
        url: typeof simple.websocket === 'string' ? simple.websocket : simple.apiUrl.replace('http', 'ws') + '/ws',
        reconnect: true,
        heartbeat: 30000
      }
    }),
    
    // Auto-configure performance
    performance: {
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
  };
}