'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Wifi, WifiOff, RefreshCw, CheckCircle, XCircle, Clock, Trash2,
  AlertTriangle, Zap, Database, Cloud, ChevronRight, Play, Pause
} from 'lucide-react';

interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  resource: string;
  data: any;
  timestamp: Date;
  status: 'pending' | 'syncing' | 'success' | 'error' | 'conflict';
  retryCount: number;
  error?: string;
  conflictData?: any;
}

const OPERATIONS_TYPES = {
  create: { color: 'green', icon: '➕', label: 'Create' },
  update: { color: 'blue', icon: '✏️', label: 'Update' },
  delete: { color: 'red', icon: '🗑️', label: 'Delete' },
};

export function OfflineQueueManager() {
  const [isOnline, setIsOnline] = useState(true);
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [autoSync, setAutoSync] = useState(true);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);

  // Simulate network status
  const toggleNetwork = useCallback(() => {
    setIsOnline(prev => !prev);
  }, []);

  // Add sample operation
  const addOperation = useCallback((type: 'create' | 'update' | 'delete') => {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const resources = ['posts', 'users', 'comments', 'products'];
    const resource = resources[Math.floor(Math.random() * resources.length)];
    
    const operation: QueuedOperation = {
      id,
      type,
      resource,
      data: {
        title: `Sample ${type} operation`,
        content: `This is a ${type} operation on ${resource}`,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date(),
      status: isOnline ? 'pending' : 'pending',
      retryCount: 0,
    };

    setOperations(prev => [...prev, operation]);

    // Auto-sync if online
    if (isOnline && autoSync) {
      setTimeout(() => {
        syncOperation(id);
      }, 1000);
    }
  }, [isOnline, autoSync]);

  // Sync single operation
  const syncOperation = useCallback(async (opId: string) => {
    if (!isOnline) {
      return;
    }

    setOperations(prev => prev.map(op =>
      op.id === opId ? { ...op, status: 'syncing' as const } : op
    ));

    // Simulate sync (80% success, 10% error, 10% conflict)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const random = Math.random();
    if (random < 0.8) {
      // Success
      setOperations(prev => prev.map(op =>
        op.id === opId ? { ...op, status: 'success' as const } : op
      ));
      
      // Remove after delay
      setTimeout(() => {
        setOperations(prev => prev.filter(op => op.id !== opId));
      }, 3000);
    } else if (random < 0.9) {
      // Error
      setOperations(prev => prev.map(op =>
        op.id === opId ? {
          ...op,
          status: 'error' as const,
          retryCount: op.retryCount + 1,
          error: 'Network error. Will retry automatically.'
        } : op
      ));

      // Auto-retry after delay
      if (autoSync) {
        setTimeout(() => {
          syncOperation(opId);
        }, 5000);
      }
    } else {
      // Conflict
      setOperations(prev => prev.map(op =>
        op.id === opId ? {
          ...op,
          status: 'conflict' as const,
          conflictData: {
            server: { version: 2, updatedBy: 'John Doe' },
            local: { version: 1, updatedBy: 'Current User' }
          }
        } : op
      ));
    }
  }, [isOnline, autoSync]);

  // Sync all pending operations
  const syncAll = useCallback(() => {
    if (!isOnline) {
      alert('Cannot sync while offline');
      return;
    }

    const pendingOps = operations.filter(op => op.status === 'pending' || op.status === 'error');
    pendingOps.forEach(op => {
      syncOperation(op.id);
    });
  }, [isOnline, operations, syncOperation]);

  // Resolve conflict
  const resolveConflict = useCallback((opId: string, resolution: 'local' | 'server' | 'merge') => {
    setOperations(prev => prev.map(op =>
      op.id === opId ? { ...op, status: 'pending' as const, conflictData: undefined } : op
    ));
    
    // Auto-sync after resolution
    setTimeout(() => {
      syncOperation(opId);
    }, 500);
  }, [syncOperation]);

  // Delete operation
  const deleteOperation = useCallback((opId: string) => {
    setOperations(prev => prev.filter(op => op.id !== opId));
  }, []);

  // Clear all completed
  const clearCompleted = useCallback(() => {
    setOperations(prev => prev.filter(op => op.status !== 'success'));
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && autoSync) {
      const pendingOps = operations.filter(op => op.status === 'pending');
      if (pendingOps.length > 0) {
        setTimeout(() => {
          syncAll();
        }, 1000);
      }
    }
  }, [isOnline]); // Only trigger on online status change

  const stats = {
    total: operations.length,
    pending: operations.filter(op => op.status === 'pending').length,
    syncing: operations.filter(op => op.status === 'syncing').length,
    success: operations.filter(op => op.status === 'success').length,
    error: operations.filter(op => op.status === 'error').length,
    conflict: operations.filter(op => op.status === 'conflict').length,
  };

  return (
    <div className="space-y-6">
      {/* Network Status & Controls */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className={`p-6 ${isOnline ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-orange-500'}`}>
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-4">
              {isOnline ? (
                <Wifi className="w-8 h-8" />
              ) : (
                <WifiOff className="w-8 h-8" />
              )}
              <div>
                <h3 className="text-2xl font-bold">
                  {isOnline ? 'Online' : 'Offline'}
                </h3>
                <p className="text-white/90">
                  {isOnline ? 'All operations will sync automatically' : 'Operations queued for later'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleNetwork}
              className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">Quick Actions</h4>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Auto-sync
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <button
              onClick={() => addOperation('create')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
            >
              ➕ Create
            </button>
            <button
              onClick={() => addOperation('update')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
            >
              ✏️ Update
            </button>
            <button
              onClick={() => addOperation('delete')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors border border-red-200"
            >
              🗑️ Delete
            </button>
            <button
              onClick={syncAll}
              disabled={!isOnline || stats.pending === 0}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4" />
              Sync All
            </button>
            <button
              onClick={clearCompleted}
              disabled={stats.success === 0}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-yellow-700">Pending</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="text-2xl font-bold text-blue-600">{stats.syncing}</div>
          <div className="text-sm text-blue-700">Syncing</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="text-2xl font-bold text-green-600">{stats.success}</div>
          <div className="text-sm text-green-700">Success</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="text-2xl font-bold text-red-600">{stats.error}</div>
          <div className="text-sm text-red-700">Errors</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="text-2xl font-bold text-orange-600">{stats.conflict}</div>
          <div className="text-sm text-orange-700">Conflicts</div>
        </div>
      </div>

      {/* Operations Queue */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Operation Queue</h3>
          <p className="text-gray-600 text-sm mt-1">
            {operations.length === 0 ? 'No operations in queue' : `${operations.length} operation(s) in queue`}
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {operations.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              <Database className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Queue is empty</p>
              <p className="text-sm mt-1">Add operations using the buttons above</p>
            </div>
          )}

          {operations.map(operation => {
            const opType = OPERATIONS_TYPES[operation.type];
            const isSelected = selectedOperation === operation.id;

            return (
              <div
                key={operation.id}
                className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                  isSelected ? 'bg-blue-50' : ''
                }`}
                onClick={() => setSelectedOperation(isSelected ? null : operation.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Type Icon */}
                  <div className={`w-12 h-12 rounded-lg bg-${opType.color}-100 flex items-center justify-center text-2xl flex-shrink-0`}>
                    {opType.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">
                            {opType.label} {operation.resource}
                          </span>
                          <span className="text-xs text-gray-500">
                            {operation.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {operation.data.title || operation.data.content}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">
                        {operation.status === 'pending' && (
                          <div className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                            <Clock className="w-3 h-3" />
                            Pending
                          </div>
                        )}
                        {operation.status === 'syncing' && (
                          <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Syncing
                          </div>
                        )}
                        {operation.status === 'success' && (
                          <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Success
                          </div>
                        )}
                        {operation.status === 'error' && (
                          <div className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            <XCircle className="w-3 h-3" />
                            Error (Retry {operation.retryCount})
                          </div>
                        )}
                        {operation.status === 'conflict' && (
                          <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Conflict
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Error Message */}
                    {operation.error && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700 border border-red-200">
                        {operation.error}
                      </div>
                    )}

                    {/* Conflict Resolution */}
                    {operation.status === 'conflict' && operation.conflictData && (
                      <div className="mt-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
                        <h5 className="font-semibold text-orange-900 mb-2">Conflict Detected</h5>
                        <p className="text-sm text-orange-700 mb-3">
                          The server has a newer version. Choose how to resolve:
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resolveConflict(operation.id, 'local');
                            }}
                            className="px-3 py-2 bg-white text-orange-700 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium border border-orange-300"
                          >
                            Use Local
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resolveConflict(operation.id, 'server');
                            }}
                            className="px-3 py-2 bg-white text-orange-700 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium border border-orange-300"
                          >
                            Use Server
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resolveConflict(operation.id, 'merge');
                            }}
                            className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium"
                          >
                            Merge
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {isSelected && operation.status !== 'syncing' && (
                      <div className="mt-3 flex gap-2">
                        {operation.status === 'pending' && isOnline && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              syncOperation(operation.id);
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Sync Now
                          </button>
                        )}
                        {operation.status === 'error' && isOnline && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              syncOperation(operation.id);
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOperation(operation.id);
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium border border-red-200"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expand Icon */}
                  <ChevronRight
                    className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${
                      isSelected ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
