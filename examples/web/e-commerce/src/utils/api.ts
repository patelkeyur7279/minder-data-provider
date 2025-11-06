import { configureMinder } from 'minder-data-provider';

/**
 * API Configuration
 * 
 * Environment-aware API endpoints:
 * - Production: Uses real FakeStore API
 * - Docker: Uses local mock API at port 3001
 * - Development: Configurable via VITE_API_URL
 */

// Determine API base URL based on environment
const getApiBaseUrl = () => {
  // Check if running in Docker (mock API available)
  if (import.meta.env.VITE_USE_MOCK_API === 'true') {
    return 'http://localhost:3001';
  }
  // Use environment variable if set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Default to FakeStore API
  return 'https://fakestoreapi.com';
};

/**
 * Global API Configuration
 * 
 * Why configure globally?
 * - Single source of truth for API settings
 * - Consistent behavior across all requests
 * - Easy to modify base URL, headers, timeout, etc.
 */

// Configure minder with default options
configureMinder({
  baseURL: getApiBaseUrl(),
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * API Endpoints
 * Compatible with both FakeStore API and Mock API
 */
export const API_ENDPOINTS = {
  PRODUCTS: '/products',
  PRODUCT_BY_ID: (id: number) => `/products/${id}`,
  CATEGORIES: '/products/categories',
  PRODUCTS_BY_CATEGORY: (category: string) => `/products/category/${category}`,
  ORDERS: '/orders',
} as const;

// Export base URL for components that need it
export const API_BASE_URL = getApiBaseUrl();
