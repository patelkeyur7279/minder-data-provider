// config/custom.example.ts
// For custom configurations that don't fit presets
// Mix and match features as needed

import { createMinderConfig } from 'minder-data-provider/config';
import type { MinderConfig } from 'minder-data-provider';

// Example 1: Lightweight app with offline support
export const lightweightWithOffline = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: {},
  cache: {
    staleTime: 30 * 60 * 1000 // 30 min
  },
  routes: {
    items: '/items'
  }
});

// Example 2: Real-time app without auth
export const realtimeNoAuth = createMinderConfig({
  apiUrl: 'https://api.example.com',
  dynamic: {},
  websocket: 'wss://api.example.com/ws',
  cache: {
    staleTime: 5 * 60 * 1000 // 5 min
  },
  routes: {
    messages: '/messages',
    notifications: '/notifications'
  }
});

// Example 3: Secure app with everything (using preset)
export const fullFeaturedConfig = createMinderConfig({
  preset: 'enterprise',
  apiUrl: 'https://api.example.com',
  dynamic: {},
  
  auth: {
    storage: 'cookie'
  },
  
  cache: {
    staleTime: 60 * 60 * 1000 // 1 hour
  },
  
  websocket: 'wss://api.example.com/ws',
  
  routes: {
    users: '/users',
    posts: '/posts',
    dashboard: '/dashboard',
    notifications: '/notifications'
  },
  
  debug: process.env.NODE_ENV === 'development'
});

export default fullFeaturedConfig;
