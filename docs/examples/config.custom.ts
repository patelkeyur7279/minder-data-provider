// config/custom.example.ts
// For custom configurations that don't fit presets
// Mix and match features as needed

import { createMinderConfig } from 'minder-data-provider/config';
import type { MinderConfig } from 'minder-data-provider';

// Example 1: Lightweight app with offline support
export const lightweightWithOffline = createMinderConfig({
  apiUrl: 'https://api.example.com',
  cache: {
    staleTime: 30 * 60 * 1000, // 30 min
    type: 'persistent' // Offline cache
  },
  performance: {
    retries: 2,
    timeout: 15000
  },
  routes: {
    items: '/items'
  }
});

// Example 2: Real-time app without auth
export const realtimeNoAuth = createMinderConfig({
  apiUrl: 'https://api.example.com',
  websocket: 'wss://api.example.com/ws',
  cache: {
    staleTime: 5 * 60 * 1000 // 5 min
  },
  auth: false, // Disable auth
  routes: {
    messages: '/messages',
    notifications: '/notifications'
  }
});

// Example 3: Secure app with everything
const fullConfig: MinderConfig = {
  apiBaseUrl: 'https://api.example.com',
  
  routes: {
    // CRUD
    users: { method: 'GET', url: '/users' },
    createUser: { method: 'POST', url: '/users' },
    updateUser: { method: 'PUT', url: '/users/:id' },
    deleteUser: { method: 'DELETE', url: '/users/:id' },
    
    // Advanced
    dashboard: {
      method: 'GET',
      url: '/dashboard',
      cache: { ttl: 60 * 60 * 1000 }
    },
    
    // Real-time
    liveNotifications: {
      method: 'WS',
      url: 'notifications/live'
    }
  },
  
  auth: {
    enabled: true,
    tokenKey: 'accessToken',
    storage: 'cookie',
    refreshUrl: '/api/auth/refresh',
    tokenRefreshThreshold: 5 * 60 * 1000
  },
  
  cache: {
    type: 'persistent',
    ttl: 30 * 60 * 1000,
    maxSize: 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  },
  
  security: {
    sanitization: true,
    csrfProtection: true,
    inputValidation: true,
    encryption: true,
    rateLimiting: {
      enabled: true,
      requests: 1000,
      window: 60000
    },
    headers: {
      contentSecurityPolicy: "default-src 'self'",
      xFrameOptions: 'DENY',
      xContentTypeOptions: true,
      strictTransportSecurity: 'max-age=31536000; includeSubDomains'
    }
  },
  
  websocket: {
    enabled: true,
    url: 'wss://api.example.com/ws',
    reconnect: true,
    heartbeat: 30000,
    maxReconnectAttempts: 5
  },
  
  performance: {
    deduplication: true,
    batching: true,
    batchDelay: 50,
    retries: 5,
    retryDelay: 1000,
    timeout: 60000,
    compression: true,
    lazyLoading: true,
    monitoring: true
  },
  
  cors: {
    enabled: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  
  ssr: {
    enabled: true,
    hydrate: true
  },
  
  debug: {
    enabled: process.env.NODE_ENV === 'development',
    logLevel: 'debug',
    performance: true,
    devTools: true,
    networkLogs: true
  }
};

export default fullConfig;
