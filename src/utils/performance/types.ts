/**
 * Type definitions for performance utilities
 */

/**
 * Batched request record
 * @internal
 */
export interface BatchedRequest {
  route: string;
  resolve: (data: any) => void;
  reject: (error: any) => void;
}

/**
 * Pending request record
 * @internal
 */
export interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

/**
 * Performance metrics data
 */
export interface PerformanceMetrics {
  requestCount: number;
  averageLatency: number;
  cacheHitRate: number;
  errorRate: number;
  slowestRequests: Array<{ route: string; duration: number }>;
  memoryUsage?: number;
}
