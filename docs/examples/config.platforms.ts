// config/platform-specific.example.ts
// Platform-specific configurations

// ========================================
// React Web App
// ========================================
import { createMinderConfig } from 'minder-data-provider/config';

export const reactWebConfig = createMinderConfig({
  preset: 'standard',
  apiUrl: process.env.REACT_APP_API_URL || 'https://api.example.com',
  dynamic: {},
  auth: {
    storage: 'cookie'
  },
  cache: {
    staleTime: 15 * 60 * 1000
  },
  routes: {
    users: '/users',
    posts: '/posts'
  },
  debug: process.env.NODE_ENV === 'development'
});

// ========================================
// Next.js
// ========================================
import { createMinderConfig as createNextConfig } from 'minder-data-provider/config';

export const nextjsConfig = createNextConfig({
  preset: 'advanced',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com',
  dynamic: {},
  auth: {
    storage: 'cookie'
  },
  cache: {
    staleTime: 30 * 60 * 1000
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// React Native
// ========================================
import { createMinderConfig as createNativeConfig } from 'minder-data-provider/config';

export const reactNativeConfig = createNativeConfig({
  preset: 'advanced',
  apiUrl: process.env.REACT_APP_API_URL || 'https://api.example.com',
  dynamic: {},
  auth: {
    storage: 'memory' // No localStorage on native
  },
  cache: {
    staleTime: 30 * 60 * 1000
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// Electron
// ========================================
import { createMinderConfig as createElectronConfig } from 'minder-data-provider/config';

export const electronConfig = createElectronConfig({
  preset: 'advanced',
  apiUrl: 'http://localhost:3000', // Local API
  dynamic: {},
  auth: {
    storage: 'cookie'
  },
  cache: {
    staleTime: 30 * 60 * 1000
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// Expo
// ========================================
import { createMinderConfig as createExpoConfig } from 'minder-data-provider/config';

export const expoConfig = createExpoConfig({
  preset: 'advanced',
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.example.com',
  dynamic: {},
  auth: {
    storage: 'memory'
  },
  cache: {
    staleTime: 30 * 60 * 1000
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// Node.js
// ========================================
import { createMinderConfig as createNodeConfig } from 'minder-data-provider/config';

export const nodeConfig = createNodeConfig({
  preset: 'standard',
  apiUrl: process.env.API_URL || 'https://api.example.com',
  dynamic: {},
  auth: {
    storage: 'memory' // Server-side memory
  },
  cache: {
    staleTime: 15 * 60 * 1000
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});
