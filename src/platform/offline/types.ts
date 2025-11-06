/**
 * Offline Module Types
 * Type definitions for offline support functionality
 */

import type { StorageAdapter } from '../adapters/storage/StorageAdapter.js';

/**
 * Network connection state
 */
export interface NetworkState {
  /**
   * Is connected to internet
   */
  isConnected: boolean;

  /**
   * Connection type (wifi, cellular, ethernet, etc.)
   */
  type?: string;

  /**
   * Is connection expensive (cellular data)
   */
  isExpensive?: boolean;

  /**
   * Is connection metered
   */
  isMetered?: boolean;
}

/**
 * Queued request configuration
 */
export interface QueuedRequest {
  /**
   * Unique request ID
   */
  id: string;

  /**
   * HTTP method
   */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /**
   * Request URL
   */
  url: string;

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Request body
   */
  body?: unknown;

  /**
   * Request priority (higher = processed first)
   * @default 0
   */
  priority?: number;

  /**
   * Timestamp when request was queued
   */
  queuedAt: number;

  /**
   * Number of retry attempts
   */
  retries: number;

  /**
   * Max retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Last error message
   */
  lastError?: string;

  /**
   * Metadata for application use
   */
  metadata?: Record<string, unknown>;
}

/**
 * Sync statistics
 */
export interface SyncStats {
  /**
   * Total requests in queue
   */
  total: number;

  /**
   * Successfully synced requests
   */
  successful: number;

  /**
   * Failed requests
   */
  failed: number;

  /**
   * Requests still pending
   */
  pending: number;

  /**
   * Sync duration in milliseconds
   */
  duration: number;

  /**
   * Error messages from failed requests
   */
  errors: Array<{ requestId: string; error: string }>;
}

/**
 * Offline configuration
 */
export interface OfflineConfig {
  /**
   * Enable offline support
   * @default true
   */
  enabled?: boolean;

  /**
   * Storage adapter for queue persistence
   */
  storage?: StorageAdapter;

  /**
   * Storage key for queue
   * @default 'minder_offline_queue'
   */
  storageKey?: string;

  /**
   * Max queue size
   * @default 100
   */
  maxQueueSize?: number;

  /**
   * Max retry attempts per request
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial retry delay in ms
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Auto-sync when coming online
   * @default true
   */
  autoSync?: boolean;

  /**
   * Sync only on WiFi (avoid cellular data)
   * @default false
   */
  syncOnWifiOnly?: boolean;

  /**
   * Batch size for sync operations
   * @default 5
   */
  syncBatchSize?: number;

  /**
   * Conflict resolution strategy
   * @default 'server-wins'
   */
  conflictResolution?: 'server-wins' | 'client-wins' | 'manual';

  /**
   * Callback when request is queued
   */
  onRequestQueued?: (request: QueuedRequest) => void;

  /**
   * Callback when request succeeds
   */
  onRequestSuccess?: (request: QueuedRequest, response: unknown) => void;

  /**
   * Callback when request fails
   */
  onRequestError?: (request: QueuedRequest, error: Error) => void;

  /**
   * Callback when sync starts
   */
  onSyncStart?: () => void;

  /**
   * Callback when sync completes
   */
  onSyncComplete?: (stats: SyncStats) => void;

  /**
   * Callback on network state change
   */
  onNetworkChange?: (state: NetworkState) => void;

  /**
   * Manual conflict resolver
   */
  onConflict?: (request: QueuedRequest, serverData: unknown) => Promise<unknown>;
}
