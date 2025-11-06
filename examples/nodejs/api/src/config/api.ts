import { configureMinder } from 'minder-data-provider';
import {
  API_BASE_URLS,
  JSONPLACEHOLDER_ENDPOINTS,
  getJsonPlaceholderUrl,
} from '../../../shared/config/api';

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
configureMinder({
  baseURL: API_BASE_URLS.JSONPLACEHOLDER,
  timeout: 10000, // 10 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Export shared endpoints and utilities
 */
export { 
  JSONPLACEHOLDER_ENDPOINTS as API_ENDPOINTS,
  getJsonPlaceholderUrl,
};
