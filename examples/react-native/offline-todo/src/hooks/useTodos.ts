import { useState, useEffect, useCallback } from 'react';
import type { Todo, CreateTodoInput, UpdateTodoInput } from '../types';
import {
  getTodosFromStorage,
  getSyncQueue,
} from '../services/storage';
import {
  createTodoOffline,
  updateTodoOffline,
  deleteTodoOffline,
  processSyncQueue,
  syncFromServer,
} from '../services/sync';
import { useNetwork } from './useNetwork';

/**
 * useTodos Hook - Offline-First Todo Management
 * 
 * Why this pattern?
 * - Instant UI updates (optimistic)
 * - Works offline
 * - Auto-sync when online
 * - Simple API for components
 * 
 * Pattern:
 * 1. Load from local storage
 * 2. Update local storage on mutations
 * 3. Queue sync operations
 * 4. Process queue when online
 * 5. Fetch from server periodically
 */
export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const network = useNetwork();

  /**
   * Load todos from storage on mount
   */
  useEffect(() => {
    loadTodos();
  }, []);

  /**
   * Auto-sync when coming back online
   */
  useEffect(() => {
    if (network.isConnected && pendingCount > 0) {
      handleSync();
    }
  }, [network.isConnected, pendingCount]);

  /**
   * Load todos from local storage
   */
  const loadTodos = useCallback(async () => {
    try {
      setLoading(true);
      const storedTodos = await getTodosFromStorage();
      setTodos(storedTodos);

      // Check pending operations
      const queue = await getSyncQueue();
      setPendingCount(queue.length);

      // If online and no local data, fetch from server
      if (network.isConnected && storedTodos.length === 0) {
        const serverTodos = await syncFromServer();
        setTodos(serverTodos);
      }
    } catch (error) {
      console.error('Failed to load todos:', error);
    } finally {
      setLoading(false);
    }
  }, [network.isConnected]);

  /**
   * Create todo
   * 
   * Optimistic: Updates UI immediately
   */
  const createTodo = useCallback(
    async (input: CreateTodoInput) => {
      try {
        const newTodo = await createTodoOffline(input, network.isConnected);
        
        // Update UI optimistically
        setTodos((prev) => [newTodo, ...prev]);
        setPendingCount((prev) => prev + 1);

        return newTodo;
      } catch (error) {
        console.error('Failed to create todo:', error);
        throw error;
      }
    },
    [network.isConnected]
  );

  /**
   * Update todo
   * 
   * Optimistic: Updates UI immediately
   */
  const updateTodo = useCallback(
    async (id: string, updates: UpdateTodoInput) => {
      try {
        // Optimistic update
        setTodos((prev) =>
          prev.map((todo) =>
            todo.id === id
              ? { ...todo, ...updates, syncStatus: 'pending' as const }
              : todo
          )
        );

        await updateTodoOffline(id, updates, network.isConnected);
        setPendingCount((prev) => prev + 1);
      } catch (error) {
        console.error('Failed to update todo:', error);
        // Revert on error
        loadTodos();
        throw error;
      }
    },
    [network.isConnected, loadTodos]
  );

  /**
   * Toggle todo completion
   */
  const toggleTodo = useCallback(
    async (id: string) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) return;

      await updateTodo(id, { completed: !todo.completed });
    },
    [todos, updateTodo]
  );

  /**
   * Delete todo
   * 
   * Optimistic: Removes from UI immediately
   */
  const deleteTodo = useCallback(
    async (id: string) => {
      try {
        // Optimistic delete
        setTodos((prev) => prev.filter((todo) => todo.id !== id));

        await deleteTodoOffline(id, network.isConnected);
        setPendingCount((prev) => prev + 1);
      } catch (error) {
        console.error('Failed to delete todo:', error);
        // Revert on error
        loadTodos();
        throw error;
      }
    },
    [network.isConnected, loadTodos]
  );

  /**
   * Manual sync
   * 
   * Why manual sync?
   * - User can force sync
   * - Pull to refresh
   * - Retry failed operations
   */
  const handleSync = useCallback(async () => {
    if (!network.isConnected) {
      console.log('Cannot sync: offline');
      return;
    }

    try {
      setSyncing(true);

      // Process pending operations
      await processSyncQueue();

      // Fetch latest from server
      const serverTodos = await syncFromServer();
      setTodos(serverTodos);

      // Update pending count
      const queue = await getSyncQueue();
      setPendingCount(queue.length);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }, [network.isConnected]);

  return {
    // Data
    todos,
    loading,
    syncing,
    isOnline: network.isConnected,
    pendingCount,

    // Actions
    createTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    refresh: loadTodos,
    sync: handleSync,
  };
}
