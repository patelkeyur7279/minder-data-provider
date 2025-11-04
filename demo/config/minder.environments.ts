import type { MinderConfig } from 'minder-data-provider';
import type { EnvironmentConfigs } from './minder.types';

// 🌍 Environment-specific configurations
export const environmentConfigs: EnvironmentConfigs = {
  development: {
    name: 'Development',
    apiBaseUrl: 'http://localhost:8080/api',
    cors: {
      enabled: true,
      proxy: '/api/minder-proxy',
      origin: 'http://localhost:3000',
    },
    auth: {
      tokenKey: 'dev_token',
      storage: 'localStorage',
    },
    cache: {
      staleTime: 1 * 60 * 1000, // 1 minute
      gcTime: 2 * 60 * 1000,    // 2 minutes
    },
    debug: {
      enabled: true,
      logLevel: 'debug',
      performance: true,
      networkLogs: true,
    },
  },

  staging: {
    name: 'Staging',
    apiBaseUrl: 'https://staging-api.example.com',
    cors: {
      enabled: true,
      proxy: '/api/minder-proxy',
      origin: ['https://staging.example.com', 'https://dev.example.com'],
    },
    auth: {
      tokenKey: 'staging_token',
      storage: 'sessionStorage',
    },
    cache: {
      staleTime: 3 * 60 * 1000,  // 3 minutes
      gcTime: 5 * 60 * 1000,     // 5 minutes
    },
    debug: {
      enabled: true,
      logLevel: 'warn',
      performance: true,
    },
  },

  production: {
    name: 'Production',
    apiBaseUrl: 'https://api.example.com',
    cors: {
      enabled: false,  // Same domain in production
      credentials: true,
      origin: 'https://example.com',
    },
    auth: {
      tokenKey: 'prod_token',
      storage: 'cookie',  // Secure cookie storage
    },
    cache: {
      staleTime: 10 * 60 * 1000,  // 10 minutes
      gcTime: 30 * 60 * 1000,     // 30 minutes
    },
    debug: {
      enabled: false,
      logLevel: 'error',
    },
  },

  test: {
    name: 'Testing',
    apiBaseUrl: 'http://localhost:3001/mock-api',
    cors: {
      enabled: true,
      proxy: '/api/minder-proxy',
      credentials: false,
    },
    auth: {
      tokenKey: 'test_token',
      storage: 'memory',  // Memory storage for tests
    },
    cache: {
      staleTime: 0,  // No caching in tests
      gcTime: 0,
    },
    debug: {
      enabled: true,
      logLevel: 'debug',
      performance: true,
      networkLogs: true,
    },
  },
};