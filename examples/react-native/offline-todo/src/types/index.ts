/**
 * Todo type
 */
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  // Offline sync metadata
  syncStatus: 'synced' | 'pending' | 'failed';
  localOnly?: boolean; // Created offline, not yet on server
}

/**
 * Create todo input
 */
export interface CreateTodoInput {
  title: string;
}

/**
 * Update todo input
 */
export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
}

/**
 * Sync queue item
 * Stores pending operations to sync when online
 */
export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  todoId: string;
  data?: Todo | UpdateTodoInput;
  timestamp: string;
  retryCount: number;
}

/**
 * Network status
 */
export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
}
