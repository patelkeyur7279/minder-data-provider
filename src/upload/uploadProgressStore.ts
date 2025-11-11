/**
 * Shared Upload Progress Store
 * 
 * Allows all useMinder() instances to share upload progress state.
 * Uses a simple state management approach without external dependencies.
 * 
 * Usage:
 * ```typescript
 * const progress = getUploadProgress('media-upload');
 * setUploadProgress('media-upload', { loaded: 50, total: 100, percentage: 50 });
 * ```
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadProgressStore {
  uploads: Record<string, UploadProgress>;
  listeners: Record<string, Set<(progress: UploadProgress) => void>>;
}

// Global store
const store: UploadProgressStore = {
  uploads: {},
  listeners: {},
};

/**
 * Get upload progress for a specific upload ID
 */
export function getUploadProgress(uploadId: string): UploadProgress {
  return store.uploads[uploadId] || { loaded: 0, total: 0, percentage: 0 };
}

/**
 * Set upload progress and notify listeners
 */
export function setUploadProgress(uploadId: string, progress: UploadProgress): void {
  store.uploads[uploadId] = progress;

  // Notify all listeners for this upload
  const listeners = store.listeners[uploadId];
  if (listeners) {
    listeners.forEach((callback) => callback(progress));
  }
}

/**
 * Subscribe to upload progress changes
 * Returns unsubscribe function
 */
export function subscribeToUploadProgress(
  uploadId: string,
  callback: (progress: UploadProgress) => void
): () => void {
  if (!store.listeners[uploadId]) {
    store.listeners[uploadId] = new Set();
  }

  store.listeners[uploadId].add(callback);

  // Return unsubscribe function
  return () => {
    store.listeners[uploadId]?.delete(callback);
    if (store.listeners[uploadId]?.size === 0) {
      delete store.listeners[uploadId];
    }
  };
}

/**
 * Clear upload progress
 */
export function clearUploadProgress(uploadId: string): void {
  delete store.uploads[uploadId];
  
  // Notify listeners about cleared state
  const listeners = store.listeners[uploadId];
  if (listeners) {
    const clearedProgress: UploadProgress = { loaded: 0, total: 0, percentage: 0 };
    listeners.forEach((callback) => callback(clearedProgress));
  }
}

/**
 * Get all active uploads
 */
export function getAllUploadProgress(): Record<string, UploadProgress> {
  return { ...store.uploads };
}

/**
 * Clear all upload progress
 */
export function clearAllUploadProgress(): void {
  const uploadIds = Object.keys(store.uploads);
  uploadIds.forEach((uploadId) => clearUploadProgress(uploadId));
}
