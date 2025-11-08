// config/enterprise.example.ts
// For production-grade, real-time systems, enterprise apps
// Bundle size: ~150KB
// Features: All features including WebSocket, monitoring, encryption

import { createMinderConfig } from 'minder-data-provider/config';

export const enterpriseConfig = createMinderConfig({
  preset: 'enterprise',
  apiUrl: 'https://api.example.com',
  
  // Authentication
  auth: {
    storage: 'cookie'
  },
  
  // Persistent caching
  cache: {
    staleTime: 60 * 60 * 1000 // 1 hour
  },
  
  // Real-time WebSocket support
  websocket: 'wss://api.example.com/ws',
  
  // Routes with advanced options
  routes: {
    users: '/users',
    posts: '/posts',
    comments: '/comments',
    
    // Real-time updates
    userUpdates: {
      method: 'WS',
      url: 'users/updates',
      cache: true
    },
    
    postNotifications: {
      method: 'WS',
      url: 'posts/notifications',
      cache: false
    },
    
    // Complex endpoint
    analyticsData: {
      method: 'GET',
      url: '/analytics',
      cache: { ttl: 60 * 60 * 1000 },
      retries: 5,
      timeout: 60000 // Long running query
    }
  }
});

// Features enabled:
// - WebSocket for real-time updates
// - End-to-end encryption
// - Advanced monitoring & analytics
// - Network logging
// - Performance analytics
// - Custom security headers
// - Request signing
// - Multiple retry strategies
//
// Usage:
// const { data, loading, error, operations } = useOneTouchCrud('users');
// 
// // Real-time subscriptions
// const { subscribe } = useWebSocket('users/updates');
// subscribe(message => {
//   console.log('User updated:', message);
// });
//
// // Encrypted communication
// operations.create({ 
//   sensitive: 'data' 
// }); // Automatically encrypted
//
// // Monitor performance
// const metrics = usePerformanceMetrics();
// console.log('Average response time:', metrics.averageResponseTime);
