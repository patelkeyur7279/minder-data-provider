'use client';

import React from 'react';
import { OfflineQueueManager } from '@/components/features/OfflineQueueManager';
import { Wifi, WifiOff, RefreshCw, Database, Zap } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-orange-600 p-3 rounded-lg">
              <WifiOff className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Offline Support</h1>
              <p className="text-gray-600">Queue management & conflict resolution</p>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <Database className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Operation Queue</h3>
                  <p className="text-sm text-gray-500">Queued operations</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Auto-sync</h3>
                  <p className="text-sm text-gray-500">When online</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Wifi className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Status Tracking</h3>
                  <p className="text-sm text-gray-500">Real-time updates</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Conflict Resolution</h3>
                  <p className="text-sm text-gray-500">Smart merging</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Queue Manager Component */}
        <OfflineQueueManager />

        {/* Info Section */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Offline Support Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">✅ Implemented Features:</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Operation Queueing:</strong> All operations queued when offline</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Auto-sync:</strong> Automatic synchronization when back online</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Manual Sync:</strong> Force sync individual or all operations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Status Tracking:</strong> Real-time status for each operation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Retry Logic:</strong> Automatic retry with exponential backoff</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Conflict Detection:</strong> Detects server-side conflicts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Conflict Resolution:</strong> Choose local, server, or merge</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">•</span>
                  <span><strong>Operation History:</strong> View all queued operations</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-3">🎯 Operation States:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div>
                    <strong className="text-yellow-900">Pending:</strong>
                    <span className="text-yellow-700 ml-1">Waiting to sync</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-200">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                  <div>
                    <strong className="text-blue-900">Syncing:</strong>
                    <span className="text-blue-700 ml-1">Currently uploading</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <div>
                    <strong className="text-green-900">Success:</strong>
                    <span className="text-green-700 ml-1">Successfully synced</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-200">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <div>
                    <strong className="text-red-900">Error:</strong>
                    <span className="text-red-700 ml-1">Failed, will retry</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-orange-50 rounded border border-orange-200">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <div>
                    <strong className="text-orange-900">Conflict:</strong>
                    <span className="text-orange-700 ml-1">Needs resolution</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
            <h4 className="font-medium text-orange-900 mb-2">💡 Try It Out:</h4>
            <ol className="text-sm text-orange-700 space-y-1 ml-4 list-decimal">
              <li>Click "Go Offline" to simulate network disconnection</li>
              <li>Add operations using Create/Update/Delete buttons</li>
              <li>Notice operations are queued with "Pending" status</li>
              <li>Click "Go Online" to reconnect</li>
              <li>Watch auto-sync kick in and sync all pending operations</li>
              <li>Some operations may fail or conflict - see different states in action!</li>
            </ol>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="font-medium text-blue-900 mb-2">🔧 Technical Implementation:</h4>
            <p className="text-sm text-blue-700 mb-2">
              This demo showcases offline-first architecture patterns:
            </p>
            <ul className="text-sm text-blue-700 space-y-1 ml-4">
              <li>• Local state management with optimistic updates</li>
              <li>• Queue persistence simulation (IndexedDB/LocalStorage ready)</li>
              <li>• Automatic network status detection</li>
              <li>• Retry logic with exponential backoff (simulated)</li>
              <li>• Three-way merge conflict resolution</li>
              <li>• Operation timestamps and versioning</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
