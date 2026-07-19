// Pure-Node app — both imports are React-free (the main entry re-exports the
// hooks, which require React as a peer):
//   - `minder` from `/node` (the data function).
//   - `configureMinder` from `/config` — the CURRENT unified config API
//     (`apiUrl` + routes), React-free and NOT deprecated. (Measured: /config
//     pulls no React.) They share the same global config, so configuring via
//     `/config` is picked up by `minder` from `/node`.
import { minder } from 'minder-data-provider/node';
import { configureMinder } from 'minder-data-provider/config';

/**
 * API Configuration
 * 
 * Environment-aware API endpoints:
 * - Production: Uses real JSONPlaceholder API
 * - Docker: Uses local mock API at port 3001
 * - Development: Configurable via API_URL env variable
 */

// Determine API base URL based on environment
const getApiBaseUrl = () => {
  // Check environment variable (Docker/Development)
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  // Default to JSONPlaceholder API
  return 'https://jsonplaceholder.typicode.com';
};

/**
 * Global Minder Configuration
 * 
 * Why configure globally?
 * - Consistent settings across all API calls
 * - Single source of truth
 * - Easy to modify base URL, headers, etc.
 */

/**
 * Configure Minder with default options
 */
// The `/config` entry's configureMinder is the current UnifiedMinderConfig API
// (`apiUrl` + routes + performance/auth/etc.), React-free and non-deprecated.
// Content-Type/Accept are default request headers now, so no headers map needed.
configureMinder({
  apiUrl: getApiBaseUrl(),
  performance: { timeout: 10000 }, // 10 seconds
});

/**
 * API Endpoints
 * Compatible with both JSONPlaceholder API and Mock API
 */
export const API_ENDPOINTS = {
  // Users
  USERS: '/users',
  USER_BY_ID: (id: string | number) => `/users/${id}`,
  
  // Posts
  POSTS: '/posts',
  POST_BY_ID: (id: string | number) => `/posts/${id}`,
  POSTS_BY_USER: (userId: string | number) => `/posts?userId=${userId}`,
} as const;

// Export base URL
export const API_BASE_URL = getApiBaseUrl();

// Export minder for use in routes
export { minder };
