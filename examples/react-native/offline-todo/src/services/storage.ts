import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Todo, SyncQueueItem } from '../types';

/**
 * Storage Keys
 * 
 * Why constants?
 * - Type-safe storage keys
 * - Easy to change
 * - Avoid typos
 */
const STORAGE_KEYS = {
  TODOS: '@minder_todos',
  SYNC_QUEUE: '@minder_sync_queue',
  LAST_SYNC: '@minder_last_sync',
} as const;

/**
 * Storage Service
 * 
 * Why separate service?
 * - Centralized storage logic
 * - Easy to test
 * - Can swap AsyncStorage for other storage
 * - Type-safe operations
 */

/**
 * Get all todos from storage
 */
export async function getTodosFromStorage(): Promise<Todo[]> {
  try {
    const todosJson = await AsyncStorage.getItem(STORAGE_KEYS.TODOS);
    return todosJson ? JSON.parse(todosJson) : [];
  } catch (error) {
    console.error('Failed to get todos from storage:', error);
    return [];
  }
}

/**
 * Save todos to storage
 */
export async function saveTodosToStorage(todos: Todo[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TODOS, JSON.stringify(todos));
  } catch (error) {
    console.error('Failed to save todos to storage:', error);
    throw error;
  }
}

/**
 * Get single todo by ID
 */
export async function getTodoFromStorage(id: string): Promise<Todo | null> {
  const todos = await getTodosFromStorage();
  return todos.find((todo) => todo.id === id) || null;
}

/**
 * Add todo to storage
 */
export async function addTodoToStorage(todo: Todo): Promise<void> {
  const todos = await getTodosFromStorage();
  todos.push(todo);
  await saveTodosToStorage(todos);
}

/**
 * Update todo in storage
 */
export async function updateTodoInStorage(
  id: string,
  updates: Partial<Todo>
): Promise<void> {
  const todos = await getTodosFromStorage();
  const index = todos.findIndex((todo) => todo.id === id);
  
  if (index !== -1) {
    todos[index] = { ...todos[index], ...updates };
    await saveTodosToStorage(todos);
  }
}

/**
 * Delete todo from storage
 */
export async function deleteTodoFromStorage(id: string): Promise<void> {
  const todos = await getTodosFromStorage();
  const filtered = todos.filter((todo) => todo.id !== id);
  await saveTodosToStorage(filtered);
}

/**
 * Get sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const queueJson = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
    return queueJson ? JSON.parse(queueJson) : [];
  } catch (error) {
    console.error('Failed to get sync queue:', error);
    return [];
  }
}

/**
 * Save sync queue
 */
export async function saveSyncQueue(queue: SyncQueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save sync queue:', error);
    throw error;
  }
}

/**
 * Add item to sync queue
 */
export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const queue = await getSyncQueue();
  queue.push(item);
  await saveSyncQueue(queue);
}

/**
 * Remove item from sync queue
 */
export async function removeFromSyncQueue(id: string): Promise<void> {
  const queue = await getSyncQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await saveSyncQueue(filtered);
}

/**
 * Get last sync time
 */
export async function getLastSyncTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
  } catch (error) {
    console.error('Failed to get last sync time:', error);
    return null;
  }
}

/**
 * Set last sync time
 */
export async function setLastSyncTime(time: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, time);
  } catch (error) {
    console.error('Failed to set last sync time:', error);
  }
}

/**
 * Clear all storage (for testing/debugging)
 */
export async function clearAllStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TODOS,
      STORAGE_KEYS.SYNC_QUEUE,
      STORAGE_KEYS.LAST_SYNC,
    ]);
  } catch (error) {
    console.error('Failed to clear storage:', error);
  }
}
