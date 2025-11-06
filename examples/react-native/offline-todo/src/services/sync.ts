import { minder } from 'minder-data-provider';
import type { Todo, CreateTodoInput, UpdateTodoInput, SyncQueueItem } from '../types';
import {
  getTodosFromStorage,
  saveTodosToStorage,
  addTodoToStorage,
  updateTodoInStorage,
  deleteTodoFromStorage,
  getSyncQueue,
  addToSyncQueue,
  removeFromSyncQueue,
  setLastSyncTime,
} from './storage';

/**
 * Sync Service
 * 
 * Why separate sync service?
 * - Handles offline-first logic
 * - Background sync queue
 * - Conflict resolution
 * - Retry logic
 * 
 * Pattern: Optimistic UI + Background Sync
 * 1. Update local storage immediately
 * 2. Add to sync queue
 * 3. Show operation as "pending"
 * 4. Sync in background when online
 * 5. Update status to "synced" or "failed"
 */

const API_BASE = 'https://jsonplaceholder.typicode.com';

/**
 * Generate unique ID for local-only todos
 */
function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create todo (offline-first)
 * 
 * Flow:
 * 1. Create todo in local storage immediately
 * 2. Add to sync queue
 * 3. Return instantly (optimistic)
 * 4. Sync in background
 */
export async function createTodoOffline(
  input: CreateTodoInput,
  isOnline: boolean
): Promise<Todo> {
  const now = new Date().toISOString();
  
  const newTodo: Todo = {
    id: generateLocalId(),
    title: input.title,
    completed: false,
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline ? 'pending' : 'pending',
    localOnly: true,
  };

  // Save to local storage immediately
  await addTodoToStorage(newTodo);

  // Add to sync queue
  const queueItem: SyncQueueItem = {
    id: generateLocalId(),
    operation: 'create',
    todoId: newTodo.id,
    data: newTodo,
    timestamp: now,
    retryCount: 0,
  };
  await addToSyncQueue(queueItem);

  // If online, trigger sync immediately
  if (isOnline) {
    syncTodo(queueItem).catch(console.error);
  }

  return newTodo;
}

/**
 * Update todo (offline-first)
 */
export async function updateTodoOffline(
  id: string,
  updates: UpdateTodoInput,
  isOnline: boolean
): Promise<void> {
  const now = new Date().toISOString();

  // Update local storage immediately
  await updateTodoInStorage(id, {
    ...updates,
    updatedAt: now,
    syncStatus: 'pending',
  });

  // Add to sync queue
  const queueItem: SyncQueueItem = {
    id: generateLocalId(),
    operation: 'update',
    todoId: id,
    data: updates,
    timestamp: now,
    retryCount: 0,
  };
  await addToSyncQueue(queueItem);

  // If online, trigger sync
  if (isOnline) {
    syncTodo(queueItem).catch(console.error);
  }
}

/**
 * Delete todo (offline-first)
 */
export async function deleteTodoOffline(
  id: string,
  isOnline: boolean
): Promise<void> {
  const now = new Date().toISOString();

  // Mark as pending delete in storage
  await updateTodoInStorage(id, {
    syncStatus: 'pending',
  });

  // Add to sync queue
  const queueItem: SyncQueueItem = {
    id: generateLocalId(),
    operation: 'delete',
    todoId: id,
    timestamp: now,
    retryCount: 0,
  };
  await addToSyncQueue(queueItem);

  // If online, trigger sync
  if (isOnline) {
    syncTodo(queueItem).catch(console.error);
  }
}

/**
 * Sync single todo operation
 */
async function syncTodo(queueItem: SyncQueueItem): Promise<void> {
  try {
    switch (queueItem.operation) {
      case 'create':
        await syncCreate(queueItem);
        break;
      case 'update':
        await syncUpdate(queueItem);
        break;
      case 'delete':
        await syncDelete(queueItem);
        break;
    }

    // Remove from queue on success
    await removeFromSyncQueue(queueItem.id);
  } catch (error) {
    console.error('Sync failed:', error);
    // Keep in queue for retry
    // In production, implement exponential backoff
  }
}

/**
 * Sync create operation
 */
async function syncCreate(queueItem: SyncQueueItem): Promise<void> {
  const todo = queueItem.data as Todo;
  
  const { data, error, success } = await minder<Todo>(
    `${API_BASE}/todos`,
    {
      title: todo.title,
      completed: todo.completed,
      userId: 1,
    },
    { method: 'POST' }
  );

  if (success && data) {
    // Replace local ID with server ID
    await deleteTodoFromStorage(todo.id);
    await addTodoToStorage({
      ...data,
      syncStatus: 'synced',
      localOnly: false,
    });
  } else {
    // Mark as failed
    await updateTodoInStorage(todo.id, { syncStatus: 'failed' });
    throw new Error(error?.message || 'Create failed');
  }
}

/**
 * Sync update operation
 */
async function syncUpdate(queueItem: SyncQueueItem): Promise<void> {
  const updates = queueItem.data as UpdateTodoInput;
  const todo = await getTodosFromStorage().then((todos) =>
    todos.find((t) => t.id === queueItem.todoId)
  );

  if (!todo || todo.localOnly) {
    // Can't update if it doesn't exist on server yet
    return;
  }

  const { success, error } = await minder(
    `${API_BASE}/todos/${todo.id}`,
    updates,
    { method: 'PUT' }
  );

  if (success) {
    await updateTodoInStorage(todo.id, { syncStatus: 'synced' });
  } else {
    await updateTodoInStorage(todo.id, { syncStatus: 'failed' });
    throw new Error(error?.message || 'Update failed');
  }
}

/**
 * Sync delete operation
 */
async function syncDelete(queueItem: SyncQueueItem): Promise<void> {
  const todos = await getTodosFromStorage();
  const todo = todos.find((t) => t.id === queueItem.todoId);

  if (!todo) {
    // Already deleted locally
    return;
  }

  if (todo.localOnly) {
    // Never synced to server, just delete locally
    await deleteTodoFromStorage(todo.id);
    return;
  }

  const { success, error } = await minder(
    `${API_BASE}/todos/${todo.id}`,
    undefined,
    { method: 'DELETE' }
  );

  if (success) {
    await deleteTodoFromStorage(todo.id);
  } else {
    await updateTodoInStorage(todo.id, { syncStatus: 'failed' });
    throw new Error(error?.message || 'Delete failed');
  }
}

/**
 * Process entire sync queue
 * Call this when coming back online
 */
export async function processSyncQueue(): Promise<void> {
  const queue = await getSyncQueue();
  
  console.log(`Processing ${queue.length} queued operations...`);

  for (const item of queue) {
    try {
      await syncTodo(item);
    } catch (error) {
      console.error(`Failed to sync ${item.operation}:`, error);
      // Continue with next item
    }
  }

  await setLastSyncTime(new Date().toISOString());
}

/**
 * Fetch todos from server and merge with local
 * 
 * Conflict resolution strategy:
 * - Server data wins for synced todos
 * - Keep local-only todos
 * - Merge both
 */
export async function syncFromServer(): Promise<Todo[]> {
  const { data, error, success } = await minder<any[]>(`${API_BASE}/todos`);

  if (!success || error) {
    console.error('Failed to fetch from server:', error);
    return getTodosFromStorage();
  }

  const localTodos = await getTodosFromStorage();
  const localOnlyTodos = localTodos.filter((t) => t.localOnly);

  // Convert server todos to our format
  const serverTodos: Todo[] = (data || []).slice(0, 20).map((item) => ({
    id: item.id.toString(),
    title: item.title,
    completed: item.completed,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced' as const,
    localOnly: false,
  }));

  // Merge: server todos + local-only todos
  const mergedTodos = [...serverTodos, ...localOnlyTodos];
  await saveTodosToStorage(mergedTodos);

  return mergedTodos;
}
