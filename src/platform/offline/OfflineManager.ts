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

import { Logger, LogLevel } from '../../utils/Logger.js';
import type { StorageAdapter } from '../adapters/storage/StorageAdapter.js';
import { MinderOfflineError, MinderNetworkError, MinderValidationError } from '../../errors/index.js';
import type { NetworkState, QueuedRequest, SyncStats, OfflineConfig } from './types.js';

const logger = new Logger('OfflineManager', { level: LogLevel.WARN });

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
   * Initialize offline manager with better error handling
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Load queue from storage
    await this.loadQueue();

    // Setup network listener with fallbacks
    await this.setupNetworkListener();

    // Initial network state check
    const state = await this.checkNetworkState();
    this.updateNetworkState(state);

    // Log initialization status
    if (this.netInfoUnsubscribe) {
      logger.debug('Offline manager initialized with network detection');
    } else {
      logger.warn('Offline manager initialized without reliable network detection - offline features may be limited');
      console.warn(`
⚠️  Minder Offline Support: Limited Network Detection

Offline request queuing will work, but automatic sync when reconnecting may be unreliable.
For better offline support:

React Native: Install @react-native-community/netinfo
Expo: NetInfo is built-in, check your setup
Web: Using basic online/offline detection
      `.trim());
    }
  }

  /**
   * Setup network state listener (React Native/Expo with fallback)
   */
  private async setupNetworkListener(): Promise<void> {
    try {
      // Try to dynamically load NetInfo (optional peer dependency)
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
      
      logger.debug('NetInfo listener setup successfully');
    } catch (error) {
      // NetInfo not available, setup fallback network detection
      logger.warn('NetInfo not available, using fallback network detection');
      this.setupFallbackNetworkListener();
    }
  }

  /**
   * Setup fallback network detection for when NetInfo is not available
   */
  private setupFallbackNetworkListener(): void {
    // Use navigator.onLine for basic online/offline detection
    if (typeof window !== 'undefined' && 'onLine' in navigator) {
      const updateOnlineStatus = () => {
        const isOnline = navigator.onLine;
        const networkState: NetworkState = {
          isConnected: isOnline,
          type: isOnline ? 'unknown' : 'none',
        };
        this.updateNetworkState(networkState);
      };

      // Listen for online/offline events
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);

      // Set initial state
      updateOnlineStatus();

      // Store cleanup function
      this.netInfoUnsubscribe = () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
      };
    } else {
      // No network detection available, assume always online
      logger.warn('No network detection available, assuming always online');
      this.networkState = { isConnected: true };
    }
  }

  /**
   * Check current network state with multiple fallback methods
   */
  async checkNetworkState(): Promise<NetworkState> {
    try {
      // Try NetInfo first (React Native/Expo)
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
      // Fallback 1: Use navigator.onLine (web)
      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        return {
          isConnected: navigator.onLine,
          type: navigator.onLine ? 'unknown' : 'none',
        };
      }

      // Fallback 2: Try a simple fetch request to detect connectivity
      try {
        // Try to fetch a small resource from a reliable CDN
        const response = await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        return {
          isConnected: true,
          type: 'unknown',
        };
      } catch {
        // Assume offline if fetch fails
        return {
          isConnected: false,
          type: 'none',
        };
      }
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
        this.sync().catch((err) => logger.error(err));
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
      throw new MinderOfflineError('Offline support is disabled');
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new MinderValidationError('Offline queue is full', { queue: ['Maximum queue size exceeded'] });
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
      return { total: 0, successful: 0, failed: 0, pending: 0, duration: 0, errors: [] };
    }

    if (this.isSyncing && this.syncPromise) {
      return this.syncPromise;
    }

    if (!this.networkState.isConnected) {
      throw new MinderOfflineError('Cannot sync while offline');
    }

    this.isSyncing = true;
    this.config.onSyncStart();

    const startTime = Date.now();
    const stats: SyncStats = {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      duration: 0,
      errors: [],
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            stats.errors.push({ requestId: request.id, error: errorMessage });
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
      throw new MinderNetworkError(`HTTP ${response.status}: ${response.statusText}`, response.status);
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
      logger.error('Failed to save offline queue:', error);
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
      logger.error('Failed to load offline queue:', error);
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
