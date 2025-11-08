// config/advanced.example.ts
// For large applications, PWAs, multi-platform apps
// Bundle size: ~120KB
// Features: Standard + Offline + SSR + Advanced Security

import { createMinderConfig } from 'minder-data-provider/config';

export const advancedConfig = createMinderConfig({
  preset: 'advanced',
  apiUrl: 'https://api.example.com',
  dynamic: {}, // Required field
  
  // Authentication
  auth: {
    storage: 'cookie'
  },
  
  // Persistent caching for offline support
  cache: {
    staleTime: 30 * 60 * 1000 // 30 minutes
  },
  
  // Routes
  routes: {
    users: '/users',
    posts: '/posts',
    comments: '/comments',
    
    // Complex routes with custom options
    userProfile: {
      method: 'GET',
      url: '/users/:userId/profile'
    },
    
    searchUsers: {
      method: 'GET',
      url: '/users/search'
    }
  }
});

// Features enabled:
// - Persistent cache (IndexedDB) for offline support
// - SSR ready for Next.js
// - Advanced security headers
// - Input validation
// - Performance monitoring
// - Dev tools integration
// - Custom cache per route
//
// Usage:
// const { data, loading, error, operations, isOffline } = useOneTouchCrud('users');
// 
// if (isOffline) {
//   // Show cached data
// } else {
//   // Show fresh data
// }
