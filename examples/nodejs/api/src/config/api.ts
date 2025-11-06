import { minder } from 'minder-data-provider';

/**
 * Global Minder Configuration
 * 
 * Why configure globally?
 * - Consistent settings across all API calls
 * - Single source of truth
 * - Easy to modify base URL, headers, etc.
 */

const baseURL = 'https://jsonplaceholder.typicode.com';

/**
 * Configure Minder with default options
 */
minder.config({
  baseURL,
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * API Endpoints
 * 
 * Why constants?
 * - Type-safe endpoint URLs
 * - Easy to maintain
 * - Avoid typos
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

export { minder };
