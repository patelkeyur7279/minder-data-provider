/**
 * Type definitions for DevTools
 */

/**
 * DevTools configuration
 */
export interface DevToolsConfig {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  defaultOpen?: boolean;
  showNetworkTab?: boolean;
  showCacheTab?: boolean;
  showPerformanceTab?: boolean;
  showStateTab?: boolean;
}

/**
 * Network request record
 */
export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
  request?: any;
  response?: any;
}

/**
 * Cache entry record
 */
export interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl?: number;
}

/**
 * State snapshot record
 */
export interface StateSnapshot {
  route: string;
  data: any;
  timestamp: number;
}
