/**
 * 🎯 COMPREHENSIVE DEMO CONFIGURATION
 * All features enabled with cross-platform support
 */

import type { MinderConfig } from '../../src/core/types';

export const demoConfig: MinderConfig = {
  // ============================================================================
  // 🌐 API CONFIGURATION
  // ============================================================================
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || 'https://jsonplaceholder.typicode.com',
  
  // ============================================================================
  // 🔐 AUTHENTICATION
  // ============================================================================
  auth: {
    tokenKey: 'minder_demo_token',
    storage: 'localStorage',
    refreshUrl: '/auth/refresh',
  },

  // ============================================================================
  // 💾 CACHING SYSTEM
  // ============================================================================
  cache: {
    type: 'hybrid',
    ttl: 60000, // 1 minute
    maxSize: 100,
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },

  // ============================================================================
  // 🔄 CRUD ROUTES
  // ============================================================================
  routes: {
    // === USERS ===
    getUsers: {
      method: 'GET',
      url: '/users',
      cache: true,
    },
    getUser: {
      method: 'GET',
      url: '/users/:id',
      cache: true,
    },
    createUser: {
      method: 'POST',
      url: '/users',
      optimistic: true,
    },
    updateUser: {
      method: 'PUT',
      url: '/users/:id',
      optimistic: true,
    },
    deleteUser: {
      method: 'DELETE',
      url: '/users/:id',
    },

    // === POSTS ===
    getPosts: {
      method: 'GET',
      url: '/posts',
      cache: true,
    },
    getPost: {
      method: 'GET',
      url: '/posts/:id',
      cache: true,
    },
    createPost: {
      method: 'POST',
      url: '/posts',
      optimistic: true,
    },
    updatePost: {
      method: 'PUT',
      url: '/posts/:id',
      optimistic: true,
    },
    deletePost: {
      method: 'DELETE',
      url: '/posts/:id',
    },

    // === COMMENTS ===
    getComments: {
      method: 'GET',
      url: '/comments',
      cache: true,
    },
    getPostComments: {
      method: 'GET',
      url: '/posts/:postId/comments',
      cache: true,
    },
    createComment: {
      method: 'POST',
      url: '/comments',
      optimistic: true,
    },

    // === PHOTOS ===
    getPhotos: {
      method: 'GET',
      url: '/photos',
      cache: true,
    },
    uploadPhoto: {
      method: 'POST',
      url: '/photos',
    },

    // === TODOS ===
    getTodos: {
      method: 'GET',
      url: '/todos',
      cache: true,
    },
    toggleTodo: {
      method: 'PATCH',
      url: '/todos/:id',
      optimistic: true,
    },
  },

  // ============================================================================
  // 🌍 CORS CONFIGURATION
  // ============================================================================
  cors: {
    enabled: true,
    credentials: true,
    origin: ['http://localhost:5100', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  // ============================================================================
  // 🔌 WEBSOCKET CONFIGURATION
  // ============================================================================
  websocket: {
    url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080',
    protocols: ['v1.minder.protocol'],
    reconnect: true,
    heartbeat: 30000, // 30 seconds
  },

  // ============================================================================
  // 📦 REDUX CONFIGURATION
  // ============================================================================
  redux: {
    devTools: process.env.NODE_ENV === 'development',
    middleware: [],
  },

  // ============================================================================
  // 🐛 DEBUG CONFIGURATION
  // ============================================================================
  debug: {
    enabled: process.env.NODE_ENV === 'development',
    logLevel: 'debug',
    performance: true,
    devTools: true,
    networkLogs: true,
  },

  // ============================================================================
  // ⚡ PERFORMANCE OPTIMIZATION
  // ============================================================================
  performance: {
    deduplication: true,
    batching: true,
    batchDelay: 10,
    monitoring: true,
    retries: 3,
    retryDelay: 1000,
    timeout: 30000,
    compression: true,
    bundleAnalysis: false,
    lazyLoading: true,
  },

  // ============================================================================
  // 🔒 SECURITY
  // ============================================================================
  security: {
    encryption: false, // Disabled for demo (HTTPS handles this in production)
    sanitization: {
      enabled: true,
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      allowedAttributes: {
        'a': ['href', 'title', 'target'],
      },
    },
    csrfProtection: {
      enabled: true,
      tokenLength: 32,
      headerName: 'X-CSRF-Token',
      cookieName: 'csrf_token',
    },
    rateLimiting: {
      requests: 100,
      window: 60000, // 1 minute
      storage: 'memory',
    },
    headers: {
      contentSecurityPolicy: "default-src 'self'",
      xFrameOptions: 'DENY',
      xContentTypeOptions: true,
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    },
    inputValidation: true,
  },

  // ============================================================================
  // 🖥️ SSR CONFIGURATION
  // ============================================================================
  ssr: {
    enabled: true,
    prefetch: ['getUsers', 'getPosts'],
    hydrate: true,
    fallback: null,
  },

  // ============================================================================
  // 🌐 ENVIRONMENT OVERRIDES
  // ============================================================================
  environments: {
    development: {
      apiBaseUrl: 'http://localhost:3001',
      debug: true,
      cors: {
        enabled: true,
        credentials: true,
      },
    },
    staging: {
      apiBaseUrl: 'https://staging-api.example.com',
      debug: false,
    },
    production: {
      apiBaseUrl: 'https://jsonplaceholder.typicode.com',
      debug: false,
      cache: {
        ttl: 300000, // 5 minutes in production
      },
    },
  },
  defaultEnvironment: 'development',
  autoDetectEnvironment: true,

  // ============================================================================
  // 🚨 ERROR HANDLING
  // ============================================================================
  onError: (error) => {
    console.error('Minder Error:', error);
    // You can add global error handling here
    // e.g., show toast notification, log to error tracking service, etc.
  },
  
  // ============================================================================
  // Dynamic property for any additional configuration
  // ============================================================================
  dynamic: {},
};

// ============================================================================
// Feature Flags for Demo
// ============================================================================
export const featureFlags = {
  platform: true,
  crud: true,
  auth: true,
  websocket: true,
  upload: true,
  cache: true,
  offline: true,
  security: true,
  performance: true,
  config: true,
};
