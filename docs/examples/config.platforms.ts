// config/platform-specific.example.ts
// Platform-specific configurations

// ========================================
// React Web App
// ========================================
import { createMinderConfig } from 'minder-data-provider/config';

export const reactWebConfig = createMinderConfig({
  preset: 'standard',
  apiUrl: process.env.REACT_APP_API_URL || 'https://api.example.com',
  auth: {
    storage: 'cookie'
  },
  cache: {
    refetchOnWindowFocus: true
  },
  routes: {
    users: '/users',
    posts: '/posts'
  },
  debug: {
    enabled: process.env.NODE_ENV === 'development'
  }
});

// ========================================
// Next.js
// ========================================
import { configureMinder } from 'minder-data-provider/platforms/nextjs';

export const nextjsConfig = configureMinder({
  preset: 'advanced',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com',
  auth: {
    storage: 'cookie'
  },
  cache: {
    type: 'persistent'
  },
  ssr: {
    enabled: true,
    hydrate: true
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// React Native
// ========================================
import { configureMinder as configureMinderNative } from 'minder-data-provider/platforms/native';

export const reactNativeConfig = configureMinderNative({
  preset: 'advanced',
  apiUrl: process.env.REACT_APP_API_URL || 'https://api.example.com',
  auth: {
    storage: 'memory' // No localStorage on native
  },
  cache: {
    type: 'persistent' // Uses device filesystem
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// Electron
// ========================================
import { configureMinder as configureMinderElectron } from 'minder-data-provider/platforms/electron';

export const electronConfig = configureMinderElectron({
  preset: 'advanced',
  apiUrl: 'http://localhost:3000', // Local API
  auth: {
    storage: 'cookie'
  },
  cache: {
    type: 'persistent' // Uses Electron store
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// Expo
// ========================================
import { configureMinder as configureMinderExpo } from 'minder-data-provider/platforms/expo';

export const expoConfig = configureMinderExpo({
  preset: 'advanced',
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.example.com',
  auth: {
    storage: 'memory'
  },
  cache: {
    type: 'persistent' // AsyncStorage
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});

// ========================================
// Node.js
// ========================================
import { configureMinder as configureMinderNode } from 'minder-data-provider/platforms/node';

export const nodeConfig = configureMinderNode({
  preset: 'standard',
  apiUrl: process.env.API_URL || 'https://api.example.com',
  auth: {
    storage: 'memory' // Server-side memory
  },
  cache: {
    type: 'memory' // Server-side caching
  },
  routes: {
    users: '/users',
    posts: '/posts'
  }
});
