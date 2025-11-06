import { configureMinder } from 'minder-data-provider';
import { 
  API_BASE_URLS, 
  getFakeStoreUrl,
  FAKESTORE_ENDPOINTS 
} from '../../../shared/config/api';

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
  baseURL: API_BASE_URLS.FAKESTORE,
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Re-export endpoints for backward compatibility
export const API_ENDPOINTS = {
  PRODUCTS: FAKESTORE_ENDPOINTS.PRODUCTS,
  PRODUCT_BY_ID: FAKESTORE_ENDPOINTS.PRODUCT_BY_ID,
  CATEGORIES: FAKESTORE_ENDPOINTS.CATEGORIES,
  PRODUCTS_BY_CATEGORY: FAKESTORE_ENDPOINTS.PRODUCTS_BY_CATEGORY,
  ORDERS: '/orders',
} as const;

// Export shared utilities
export { FAKESTORE_ENDPOINTS, getFakeStoreUrl };
