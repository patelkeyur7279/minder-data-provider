"use client";

/**
 * React Hooks for Offline Support
 * 
 * Provides hooks for managing offline state and queue in React components.
 * 
 * @module useOffline
 */

import { useState, useEffect, useCallback } from 'react';
import type { OfflineManager, OfflineManagerSnapshot } from './OfflineManager.js';
import type { NetworkState, QueuedRequest, SyncStats } from './types.js';

/**
 * Shallow-compare two NetworkState objects field by field.
 */
function isNetworkStateEqual(a: NetworkState, b: NetworkState): boolean {
  return (
    a === b ||
    (a.isConnected === b.isConnected &&
      a.type === b.type &&
      a.isExpensive === b.isExpensive &&
      a.isMetered === b.isMetered)
  );
}

/**
 * Shallow-compare two queue arrays by length and per-index reference.
 * OfflineManager.getQueue() always returns a fresh array copy, so reference
 * equality alone would never match even when the contents are unchanged.
 */
function isQueueEqual(a: QueuedRequest[], b: QueuedRequest[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve current browser connectivity, falling back to "online" when
 * `navigator` isn't available (SSR / non-browser environments).
 */
function getBrowserOnlineStatus(): boolean {
  return typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true;
}

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

  // Subscribe to manager-driven state changes (network, sync, queue) instead
  // of polling. Each setState is guarded by an equality check so no-op
  // notifications don't trigger a re-render.
  useEffect(() => {
    const applySnapshot = (snapshot: OfflineManagerSnapshot) => {
      setIsOnline((prev) => (prev === snapshot.isOnline ? prev : snapshot.isOnline));
      setIsSyncing((prev) => (prev === snapshot.isSyncing ? prev : snapshot.isSyncing));
      setNetworkState((prev) =>
        isNetworkStateEqual(prev, snapshot.networkState) ? prev : snapshot.networkState
      );
      setQueue((prev) => (isQueueEqual(prev, snapshot.queue) ? prev : snapshot.queue));
      setQueueSize((prev) => (prev === snapshot.queueSize ? prev : snapshot.queueSize));
    };

    const handleManagerChange = () => applySnapshot(offlineManager.getSnapshot());
    const unsubscribe = offlineManager.subscribe(handleManagerChange);

    // Fallback: listen directly to the browser's connectivity events in case
    // this OfflineManager instance hasn't wired up its own window listeners
    // (e.g. initialize() hasn't been called yet).
    const handleWindowConnectivityChange = () => {
      const isOnlineNow = getBrowserOnlineStatus();
      const snapshot = offlineManager.getSnapshot();
      applySnapshot({
        ...snapshot,
        isOnline: isOnlineNow,
        networkState: {
          ...snapshot.networkState,
          isConnected: isOnlineNow,
          type: isOnlineNow ? snapshot.networkState.type ?? 'unknown' : 'none',
        },
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleWindowConnectivityChange);
      window.addEventListener('offline', handleWindowConnectivityChange);
    }

    // Reconcile any state change that happened between initial render and
    // this effect's mount.
    handleManagerChange();

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleWindowConnectivityChange);
        window.removeEventListener('offline', handleWindowConnectivityChange);
      }
    };
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
    const applySnapshot = (nextIsOnline: boolean, nextNetworkState: NetworkState) => {
      setIsOnline((prev) => (prev === nextIsOnline ? prev : nextIsOnline));
      setNetworkState((prev) => (isNetworkStateEqual(prev, nextNetworkState) ? prev : nextNetworkState));
    };

    const handleManagerChange = (snapshot: OfflineManagerSnapshot) =>
      applySnapshot(snapshot.isOnline, snapshot.networkState);
    const unsubscribe = offlineManager.subscribe(handleManagerChange);

    // Fallback: listen directly to the browser's connectivity events in case
    // this OfflineManager instance hasn't wired up its own window listeners.
    const handleWindowConnectivityChange = () => {
      const isOnlineNow = getBrowserOnlineStatus();
      const currentNetworkState = offlineManager.getNetworkState();
      applySnapshot(isOnlineNow, {
        ...currentNetworkState,
        isConnected: isOnlineNow,
        type: isOnlineNow ? currentNetworkState.type ?? 'unknown' : 'none',
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleWindowConnectivityChange);
      window.addEventListener('offline', handleWindowConnectivityChange);
    }

    // Reconcile any state change that happened between initial render and
    // this effect's mount.
    applySnapshot(offlineManager.isOnline(), offlineManager.getNetworkState());

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleWindowConnectivityChange);
        window.removeEventListener('offline', handleWindowConnectivityChange);
      }
    };
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
    const applySnapshot = (nextQueue: QueuedRequest[], nextQueueSize: number) => {
      setQueue((prev) => (isQueueEqual(prev, nextQueue) ? prev : nextQueue));
      setQueueSize((prev) => (prev === nextQueueSize ? prev : nextQueueSize));
    };

    const handleManagerChange = (snapshot: OfflineManagerSnapshot) =>
      applySnapshot(snapshot.queue, snapshot.queueSize);
    const unsubscribe = offlineManager.subscribe(handleManagerChange);

    // Reconcile any state change that happened between initial render and
    // this effect's mount.
    applySnapshot(offlineManager.getQueue(), offlineManager.getQueueSize());

    return () => {
      unsubscribe();
    };
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
