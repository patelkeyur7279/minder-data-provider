// config/standard.example.ts
// For most production applications (RECOMMENDED)
// Bundle size: ~90KB
// Features: CRUD + Auth + Cache + Security

import { createMinderConfig } from 'minder-data-provider/config';

export const standardConfig = createMinderConfig({
  preset: 'standard',
  apiUrl: 'https://api.example.com',
  dynamic: {}, // Required field
  
  // Authentication (stored in httpOnly cookies)
  auth: {
    storage: 'cookie' // More secure than localStorage
  },
  
  // Caching
  cache: {
    staleTime: 15 * 60 * 1000 // 15 minutes
  },
  
  // Routes auto-generate CRUD operations
  routes: {
    users: '/users',           // GET /users
    posts: '/posts',           // GET /posts, POST /posts, etc.
    comments: '/comments'      // Auto-generates all CRUD
  }
});

// Usage:
// const { data, loading, error, operations } = useOneTouchCrud('users');
// 
// Automatic operations:
// - operations.read()              // GET /users
// - operations.create({ ... })     // POST /users
// - operations.update(id, { ... }) // PUT /users/:id
// - operations.delete(id)          // DELETE /users/:id
//
// Authentication:
// - Token stored in httpOnly cookie
// - Auto-refreshed before expiry
// - XSS protection enabled
//
// Caching:
// - Hybrid cache (memory + IndexedDB)
// - 15-minute TTL
// - Auto-refetch on window focus
// - Auto-refetch when reconnected
