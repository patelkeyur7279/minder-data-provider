import { configureMinder } from 'minder-data-provider';

/**
 * API Configuration for Next.js Blog
 * 
 * Why configure globally?
 * - Consistent settings across all API calls
 * - DRY (Don't Repeat Yourself)
 * - Easy to update baseURL
 */

// Configure minder globally
configureMinder({
  baseURL: 'https://jsonplaceholder.typicode.com',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// API Endpoints
export const API_ENDPOINTS = {
  POSTS: '/posts',
  POST_BY_ID: (id: number | string) => `/posts/${id}`,
  USERS: '/users',
  USER_BY_ID: (id: number | string) => `/users/${id}`,
  COMMENTS: (postId: number | string) => `/posts/${postId}/comments`,
} as const;
