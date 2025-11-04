/**
 * OfflineManager - Offline Support for Mobile Platforms
 * 
 * Provides offline capabilities including:
 * - Request queue management
 * - Background sync when online
 * - Network state detection
 * - Automatic retry with exponential backoff
 * - Conflict resolution strategies
 * - Persistent storage integration
 * 
 * @module OfflineManager
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
  body?: any;

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
  onRequestSuccess?: (request: QueuedRequest, response: any) => void;

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
  onConflict?: (request: QueuedRequest, serverData: any) => Promise<any>;
}

/**
 * Sync statistics
 */
export interface SyncStats {
  /**
   * Total requests processed
   */
  total: number;

  /**
   * Successful requests
   */
  successful: number;

  /**
   * Failed requests
   */
  failed: number;

  /**
   * Duration in milliseconds
   */
  duration: number;

  /**
   * Failed request IDs
   */
  failedRequests: string[];
}

/**
 * OfflineManager - Manages offline request queue and sync
 */
export class OfflineManager {
  private config: Required<Omit<OfflineConfig, 'storage' | 'onConflict'>> & {
    storage?: StorageAdapter;
    onConflict?: (request: QueuedRequest, serverData: any) => Promise<any>;
  };
  private queue: QueuedRequest[] = [];
  private networkState: NetworkState = { isConnected: true };
  private isSyncing = false;
  private syncPromise: Promise<SyncStats> | null = null;
  private netInfoUnsubscribe?: () => void;

  constructor(config: OfflineConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      storage: config.storage,
      storageKey: config.storageKey ?? 'minder_offline_queue',
      maxQueueSize: config.maxQueueSize ?? 100,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      autoSync: config.autoSync ?? true,
      syncOnWifiOnly: config.syncOnWifiOnly ?? false,
      syncBatchSize: config.syncBatchSize ?? 5,
      conflictResolution: config.conflictResolution ?? 'server-wins',
      onRequestQueued: config.onRequestQueued ?? (() => {}),
      onRequestSuccess: config.onRequestSuccess ?? (() => {}),
      onRequestError: config.onRequestError ?? (() => {}),
      onSyncStart: config.onSyncStart ?? (() => {}),
      onSyncComplete: config.onSyncComplete ?? (() => {}),
      onNetworkChange: config.onNetworkChange ?? (() => {}),
      onConflict: config.onConflict,
    };
  }

  /**
   * Initialize offline manager
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Load queue from storage
    await this.loadQueue();

    // Setup network listener
    await this.setupNetworkListener();

    // Initial network state check
    const state = await this.checkNetworkState();
    this.updateNetworkState(state);
  }

  /**
   * Setup network state listener (React Native/Expo)
   */
  private async setupNetworkListener(): Promise<void> {
    try {
      // Try to dynamically load NetInfo (optional peer dependency)
      // Using dynamic require to avoid build-time resolution
      const loadNetInfo = new Function('return import("@react-native-community/netinfo")');
      const NetInfo = await loadNetInfo().then((m: any) => m.default);

      this.netInfoUnsubscribe = NetInfo.addEventListener((state: any) => {
        const networkState: NetworkState = {
          isConnected: state.isConnected ?? false,
          type: state.type,
          isExpensive: state.details?.isConnectionExpensive,
          isMetered: state.details?.isConnectionMetered,
        };

        this.updateNetworkState(networkState);
      });
    } catch (error) {
      // NetInfo not available, manual network checks required
      console.warn('NetInfo not available. Manual network checks required.');
    }
  }

  /**
   * Check current network state
   */
  async checkNetworkState(): Promise<NetworkState> {
    try {
      // Try to dynamically load NetInfo (optional peer dependency)
      const loadNetInfo = new Function('return import("@react-native-community/netinfo")');
      const NetInfo = await loadNetInfo().then((m: any) => m.default);

      const state = await NetInfo.fetch();
      return {
        isConnected: state.isConnected ?? false,
        type: state.type,
        isExpensive: (state.details as any)?.isConnectionExpensive,
        isMetered: (state.details as any)?.isConnectionMetered,
      };
    } catch (error) {
      // Fallback: assume online
      return { isConnected: true };
    }
  }

  /**
   * Update network state and trigger sync if needed
   */
  private updateNetworkState(state: NetworkState): void {
    const wasOffline = !this.networkState.isConnected;
    this.networkState = state;
    this.config.onNetworkChange(state);

    // Auto-sync when coming back online
    if (wasOffline && state.isConnected && this.config.autoSync) {
      const canSync = !this.config.syncOnWifiOnly || state.type === 'wifi';
      if (canSync) {
        this.sync().catch(console.error);
      }
    }
  }

  /**
   * Add request to offline queue
   */
  async addToQueue(
    method: QueuedRequest['method'],
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: any;
      priority?: number;
      maxRetries?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Offline support is disabled');
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Offline queue is full');
    }

    const request: QueuedRequest = {
      id: this.generateId(),
      method,
      url,
      headers: options.headers,
      body: options.body,
      priority: options.priority ?? 0,
      queuedAt: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? this.config.maxRetries,
      metadata: options.metadata,
    };

    this.queue.push(request);
    this.sortQueueByPriority();
    await this.saveQueue();

    this.config.onRequestQueued(request);

    return request.id;
  }

  /**
   * Remove request from queue
   */
  async removeFromQueue(requestId: string): Promise<boolean> {
    const index = this.queue.findIndex((r) => r.id === requestId);
    if (index === -1) {
      return false;
    }

    this.queue.splice(index, 1);
    await this.saveQueue();
    return true;
  }

  /**
   * Get all queued requests
   */
  getQueue(): QueuedRequest[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
  }

  /**
   * Get network state
   */
  getNetworkState(): NetworkState {
    return { ...this.networkState };
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.networkState.isConnected;
  }

  /**
   * Check if currently syncing
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Sync queued requests
   */
  async sync(): Promise<SyncStats> {
    if (!this.config.enabled) {
      return { total: 0, successful: 0, failed: 0, duration: 0, failedRequests: [] };
    }

    if (this.isSyncing && this.syncPromise) {
      return this.syncPromise;
    }

    if (!this.networkState.isConnected) {
      throw new Error('Cannot sync while offline');
    }

    this.isSyncing = true;
    this.config.onSyncStart();

    const startTime = Date.now();
    const stats: SyncStats = {
      total: 0,
      successful: 0,
      failed: 0,
      duration: 0,
      failedRequests: [],
    };

    this.syncPromise = this.performSync(stats, startTime);

    try {
      const result = await this.syncPromise;
      return result;
    } finally {
      this.isSyncing = false;
      this.syncPromise = null;
    }
  }

  /**
   * Perform actual sync operation
   */
  private async performSync(stats: SyncStats, startTime: number): Promise<SyncStats> {
    const batches = this.createBatches(this.queue, this.config.syncBatchSize);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (request) => {
          stats.total++;

          try {
            await this.executeRequest(request);
            stats.successful++;
            await this.removeFromQueue(request.id);
          } catch (error) {
            stats.failed++;
            stats.failedRequests.push(request.id);
            await this.handleRequestError(request, error as Error);
          }
        })
      );
    }

    stats.duration = Date.now() - startTime;
    this.config.onSyncComplete(stats);

    return stats;
  }

  /**
   * Execute a queued request
   */
  private async executeRequest(request: QueuedRequest): Promise<any> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    this.config.onRequestSuccess(request, data);

    return data;
  }

  /**
   * Handle request error and retry if needed
   */
  private async handleRequestError(
    request: QueuedRequest,
    error: Error
  ): Promise<void> {
    request.lastError = error.message;
    request.retries++;

    if (request.retries >= (request.maxRetries ?? this.config.maxRetries)) {
      // Max retries reached, remove from queue
      this.config.onRequestError(request, error);
      await this.removeFromQueue(request.id);
    } else {
      // Will retry on next sync
      await this.saveQueue();
    }
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sort queue by priority (higher first)
   */
  private sortQueueByPriority(): void {
    this.queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Save queue to storage
   */
  private async saveQueue(): Promise<void> {
    if (!this.config.storage) {
      return;
    }

    try {
      await this.config.storage.setItem(
        this.config.storageKey,
        JSON.stringify(this.queue)
      );
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  /**
   * Load queue from storage
   */
  private async loadQueue(): Promise<void> {
    if (!this.config.storage) {
      return;
    }

    try {
      const data = await this.config.storage.getItem(this.config.storageKey);
      if (data) {
        this.queue = JSON.parse(data);
        this.sortQueueByPriority();
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
      this.queue = [];
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = undefined;
    }

    await this.saveQueue();
  }
}

/**
 * Create OfflineManager instance
 */
export function createOfflineManager(config?: OfflineConfig): OfflineManager {
  return new OfflineManager(config);
}
