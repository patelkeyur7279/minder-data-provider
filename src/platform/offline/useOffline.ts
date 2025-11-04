/**
 * React Hooks for Offline Support
 * 
 * Provides hooks for managing offline state and queue in React components.
 * 
 * @module useOffline
 */

import { useState, useEffect, useCallback } from 'react';
import type { OfflineManager, NetworkState, QueuedRequest, SyncStats } from './OfflineManager.js';

/**
 * Hook return type for useOffline
 */
export interface UseOfflineResult {
  /**
   * Is currently online
   */
  isOnline: boolean;

  /**
   * Is currently syncing
   */
  isSyncing: boolean;

  /**
   * Current network state
   */
  networkState: NetworkState;

  /**
   * Queued requests
   */
  queue: QueuedRequest[];

  /**
   * Queue size
   */
  queueSize: number;

  /**
   * Add request to queue
   */
  addToQueue: (
    method: QueuedRequest['method'],
    url: string,
    options?: {
      headers?: Record<string, string>;
      body?: any;
      priority?: number;
      metadata?: Record<string, unknown>;
    }
  ) => Promise<string>;

  /**
   * Remove request from queue
   */
  removeFromQueue: (requestId: string) => Promise<boolean>;

  /**
   * Trigger manual sync
   */
  sync: () => Promise<SyncStats>;

  /**
   * Clear all queued requests
   */
  clearQueue: () => Promise<void>;

  /**
   * Refresh network state
   */
  refreshNetworkState: () => Promise<void>;
}

/**
 * Hook for offline support
 */
export function useOffline(offlineManager: OfflineManager): UseOfflineResult {
  const [isOnline, setIsOnline] = useState(offlineManager.isOnline());
  const [isSyncing, setIsSyncing] = useState(offlineManager.isSyncInProgress());
  const [networkState, setNetworkState] = useState(offlineManager.getNetworkState());
  const [queue, setQueue] = useState<QueuedRequest[]>(offlineManager.getQueue());
  const [queueSize, setQueueSize] = useState(offlineManager.getQueueSize());

  // Update state when network changes
  useEffect(() => {
    const updateState = () => {
      setIsOnline(offlineManager.isOnline());
      setNetworkState(offlineManager.getNetworkState());
      setQueue(offlineManager.getQueue());
      setQueueSize(offlineManager.getQueueSize());
    };

    // Poll for changes (since OfflineManager uses callbacks)
    const interval = setInterval(updateState, 1000);

    return () => clearInterval(interval);
  }, [offlineManager]);

  const addToQueue = useCallback(
    async (
      method: QueuedRequest['method'],
      url: string,
      options?: {
        headers?: Record<string, string>;
        body?: any;
        priority?: number;
        metadata?: Record<string, unknown>;
      }
    ) => {
      const id = await offlineManager.addToQueue(method, url, options);
      setQueue(offlineManager.getQueue());
      setQueueSize(offlineManager.getQueueSize());
      return id;
    },
    [offlineManager]
  );

  const removeFromQueue = useCallback(
    async (requestId: string) => {
      const removed = await offlineManager.removeFromQueue(requestId);
      if (removed) {
        setQueue(offlineManager.getQueue());
        setQueueSize(offlineManager.getQueueSize());
      }
      return removed;
    },
    [offlineManager]
  );

  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const stats = await offlineManager.sync();
      setQueue(offlineManager.getQueue());
      setQueueSize(offlineManager.getQueueSize());
      return stats;
    } finally {
      setIsSyncing(false);
    }
  }, [offlineManager]);

  const clearQueue = useCallback(async () => {
    await offlineManager.clearQueue();
    setQueue([]);
    setQueueSize(0);
  }, [offlineManager]);

  const refreshNetworkState = useCallback(async () => {
    const state = await offlineManager.checkNetworkState();
    setNetworkState(state);
    setIsOnline(state.isConnected);
  }, [offlineManager]);

  return {
    isOnline,
    isSyncing,
    networkState,
    queue,
    queueSize,
    addToQueue,
    removeFromQueue,
    sync,
    clearQueue,
    refreshNetworkState,
  };
}

/**
 * Hook for network state only
 */
export function useNetworkState(offlineManager: OfflineManager): {
  isOnline: boolean;
  networkState: NetworkState;
  refreshNetworkState: () => Promise<void>;
} {
  const [isOnline, setIsOnline] = useState(offlineManager.isOnline());
  const [networkState, setNetworkState] = useState(offlineManager.getNetworkState());

  useEffect(() => {
    const interval = setInterval(() => {
      setIsOnline(offlineManager.isOnline());
      setNetworkState(offlineManager.getNetworkState());
    }, 1000);

    return () => clearInterval(interval);
  }, [offlineManager]);

  const refreshNetworkState = useCallback(async () => {
    const state = await offlineManager.checkNetworkState();
    setNetworkState(state);
    setIsOnline(state.isConnected);
  }, [offlineManager]);

  return {
    isOnline,
    networkState,
    refreshNetworkState,
  };
}

/**
 * Hook for offline queue only
 */
export function useOfflineQueue(offlineManager: OfflineManager): {
  queue: QueuedRequest[];
  queueSize: number;
  addToQueue: UseOfflineResult['addToQueue'];
  removeFromQueue: UseOfflineResult['removeFromQueue'];
  clearQueue: UseOfflineResult['clearQueue'];
} {
  const [queue, setQueue] = useState<QueuedRequest[]>(offlineManager.getQueue());
  const [queueSize, setQueueSize] = useState(offlineManager.getQueueSize());

  useEffect(() => {
    const interval = setInterval(() => {
      setQueue(offlineManager.getQueue());
      setQueueSize(offlineManager.getQueueSize());
    }, 1000);

    return () => clearInterval(interval);
  }, [offlineManager]);

  const addToQueue = useCallback(
    async (
      method: QueuedRequest['method'],
      url: string,
      options?: {
        headers?: Record<string, string>;
        body?: any;
        priority?: number;
        metadata?: Record<string, unknown>;
      }
    ) => {
      const id = await offlineManager.addToQueue(method, url, options);
      setQueue(offlineManager.getQueue());
      setQueueSize(offlineManager.getQueueSize());
      return id;
    },
    [offlineManager]
  );

  const removeFromQueue = useCallback(
    async (requestId: string) => {
      const removed = await offlineManager.removeFromQueue(requestId);
      if (removed) {
        setQueue(offlineManager.getQueue());
        setQueueSize(offlineManager.getQueueSize());
      }
      return removed;
    },
    [offlineManager]
  );

  const clearQueue = useCallback(async () => {
    await offlineManager.clearQueue();
    setQueue([]);
    setQueueSize(0);
  }, [offlineManager]);

  return {
    queue,
    queueSize,
    addToQueue,
    removeFromQueue,
    clearQueue,
  };
}
