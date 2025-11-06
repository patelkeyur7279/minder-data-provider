/**
 * Centralized API Configuration
 * 
 * Single source of truth for all API endpoints across all examples.
 * Import this in any example to use consistent endpoints.
 */

/**
 * API Base URLs
 */
export const API_BASE_URLS = {
  // JSONPlaceholder - Free fake API for testing
  JSONPLACEHOLDER: 'https://jsonplaceholder.typicode.com',
  
  // FakeStore API - E-commerce testing
  FAKESTORE: 'https://fakestoreapi.com',
  
  // Local development
  LOCAL: process.env.API_URL || 'http://localhost:3001',
} as const;

/**
 * API Endpoints - JSONPlaceholder
 */
export const JSONPLACEHOLDER_ENDPOINTS = {
  // Posts
  POSTS: '/posts',
  POST_BY_ID: (id: string | number) => `/posts/${id}`,
  POSTS_BY_USER: (userId: string | number) => `/posts?userId=${userId}`,
  
  // Users
  USERS: '/users',
  USER_BY_ID: (id: string | number) => `/users/${id}`,
  
  // Comments
  COMMENTS: '/comments',
  COMMENTS_BY_POST: (postId: string | number) => `/posts/${postId}/comments`,
  
  // Todos
  TODOS: '/todos',
  TODO_BY_ID: (id: string | number) => `/todos/${id}`,
  TODOS_BY_USER: (userId: string | number) => `/todos?userId=${userId}`,
} as const;

/**
 * API Endpoints - FakeStore
 */
export const FAKESTORE_ENDPOINTS = {
  // Products
  PRODUCTS: '/products',
  PRODUCT_BY_ID: (id: string | number) => `/products/${id}`,
  PRODUCTS_LIMIT: (limit: number) => `/products?limit=${limit}`,
  PRODUCTS_BY_CATEGORY: (category: string) => `/products/category/${category}`,
  CATEGORIES: '/products/categories',
  
  // Cart
  CARTS: '/carts',
  CART_BY_ID: (id: string | number) => `/carts/${id}`,
  USER_CARTS: (userId: string | number) => `/carts/user/${userId}`,
  
  // Auth
  LOGIN: '/auth/login',
} as const;

/**
 * Helper to build full URL
 */
export function buildUrl(base: string, endpoint: string): string {
  return `${base}${endpoint}`;
}

/**
 * Get full URL for JSONPlaceholder endpoint
 */
export function getJsonPlaceholderUrl(endpoint: string): string {
  return buildUrl(API_BASE_URLS.JSONPLACEHOLDER, endpoint);
}

/**
 * Get full URL for FakeStore endpoint
 */
export function getFakeStoreUrl(endpoint: string): string {
  return buildUrl(API_BASE_URLS.FAKESTORE, endpoint);
}

/**
 * Example usage:
 * 
 * // In any example:
 * import { getJsonPlaceholderUrl, JSONPLACEHOLDER_ENDPOINTS } from '@/shared/config/api';
 * 
 * const url = getJsonPlaceholderUrl(JSONPLACEHOLDER_ENDPOINTS.POSTS);
 * // Result: 'https://jsonplaceholder.typicode.com/posts'
 * 
 * const userUrl = getJsonPlaceholderUrl(JSONPLACEHOLDER_ENDPOINTS.USER_BY_ID(1));
 * // Result: 'https://jsonplaceholder.typicode.com/users/1'
 */
