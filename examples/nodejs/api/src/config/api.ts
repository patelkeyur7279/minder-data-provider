// Pure-Node app: import from the React-free `/node` entry so nothing pulls in
// React (the main entry re-exports the hooks, which require React as a peer).
import { minder, configureMinder } from 'minder-data-provider/node';

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
// The `/node` entry's configureMinder is the minimal, React-free URL-resolution
// configurator: MinderConfig = { baseURL, timeout, headers }. (The main entry's
// configureMinder takes the fuller UnifiedMinderConfig with `apiUrl` + routes,
// but the main entry re-exports the hooks and therefore requires React — not
// something a pure-Node API server should need.)
//
// Known gap (tracked as EXA-GAP-1): this core configurator logs a deprecation
// notice pointing at the main `configureMinder`, yet that one isn't available
// React-free. Until the framework exposes the unified config React-free from
// `/node`, this is the correct React-free choice for a Node server.
configureMinder({
  baseURL: getApiBaseUrl(),
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json',
  },
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
