// Live Statistics Dashboard
// Main container for all statistics panels

'use client';

import React, { useState, useEffect } from 'react';
import { useStatisticsCollector } from '../hooks/useStatisticsCollector';
import { RenderingModeIndicator } from './RenderingModeIndicator';
import { PerformanceMetrics } from './PerformanceMetrics';
import { CacheVisualization } from './CacheVisualization';
import { NetworkActivityGraph } from './NetworkActivityGraph';
import { FeatureToggles } from './FeatureToggles';
import { PlatformDetector } from './PlatformDetector';

export function LiveStatsDashboard() {
  const { stats, updateStats } = useStatisticsCollector();

  // Only render on client side to avoid hydration errors
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-center h-96">
          <div className="text-white text-xl">Loading statistics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              📊 Live Statistics Dashboard
            </h1>
            <p className="text-purple-100 text-sm sm:text-base">
              Real-time monitoring of Minder Data Provider
            </p>
          </div>
          <div className="text-right">
            <div className="text-purple-100 text-xs sm:text-sm">
              Last Update
            </div>
            <div className="text-white font-mono text-sm">
              {new Date(stats.realtime.lastUpdate).toLocaleTimeString()}
            </div>
            <div className="text-purple-200 text-xs mt-1">
              {stats.realtime.updateCount} updates
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Rendering Mode Indicator */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <RenderingModeIndicator 
            mode={stats.rendering.mode}
            counts={stats.rendering}
          />
        </div>

        {/* Performance Metrics */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <PerformanceMetrics 
            metrics={stats.performance}
          />
        </div>

        {/* Cache Visualization */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <CacheVisualization 
            cache={stats.cache}
          />
        </div>

        {/* Network Activity */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <NetworkActivityGraph 
            network={stats.network}
          />
        </div>

        {/* Feature Status */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <FeatureToggles 
            features={stats.features}
          />
        </div>

        {/* Platform Information */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <PlatformDetector 
            platform={stats.platform}
          />
        </div>

        {/* Error Tracking */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1 md:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="text-2xl mr-2">🐛</span>
            Error Tracking
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <ErrorStat label="Total" value={stats.errors.total} color="gray" />
            <ErrorStat label="Network" value={stats.errors.network} color="blue" />
            <ErrorStat label="Server" value={stats.errors.server} color="red" />
            <ErrorStat label="Client" value={stats.errors.client} color="orange" />
            <ErrorStat label="Validation" value={stats.errors.validation} color="yellow" />
          </div>
          {stats.errors.recent.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium text-gray-600 mb-2">Recent Errors</div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {stats.errors.recent.slice(0, 3).map((error, idx) => (
                  <div key={idx} className="text-xs bg-red-50 p-2 rounded border border-red-200">
                    <div className="font-medium text-red-800">{error.message}</div>
                    <div className="text-red-600 text-xs mt-1">
                      {new Date(error.timestamp).toLocaleTimeString()} • {error.type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Resources */}
        <div className="bg-white rounded-xl shadow-2xl p-6 hover:shadow-3xl transition-all duration-300 hover:-translate-y-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <span className="text-2xl mr-2">💾</span>
            Resources
          </h3>
          <div className="space-y-3">
            <ResourceBar 
              label="Memory"
              used={stats.resources.memory.used}
              total={stats.resources.memory.limit}
              formatter={(val) => `${(val / 1024 / 1024).toFixed(1)} MB`}
            />
            <ResourceBar 
              label="CPU"
              used={stats.resources.cpu.usage}
              total={100}
              formatter={(val) => `${val.toFixed(1)}%`}
            />
            <ResourceBar 
              label="Storage"
              used={stats.resources.storage.used}
              total={stats.resources.storage.available}
              formatter={(val) => `${(val / 1024 / 1024).toFixed(1)} MB`}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <div className="inline-flex items-center space-x-2 bg-white/10 backdrop-blur-sm rounded-full px-6 py-3 text-white">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">Live Monitoring Active</span>
          <span className="text-xs text-purple-200">• Updates every 5s</span>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function ErrorStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-800 border-gray-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    red: 'bg-red-100 text-red-800 border-red-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300'
  };

  return (
    <div className={`text-center p-3 rounded-lg border ${colorMap[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium mt-1">{label}</div>
    </div>
  );
}

function ResourceBar({ 
  label, 
  used, 
  total, 
  formatter 
}: { 
  label: string; 
  used: number; 
  total: number; 
  formatter: (val: number) => string;
}) {
  const percentage = total > 0 ? (used / total) * 100 : 0;
  const color = percentage > 80 ? 'bg-red-500' : percentage > 60 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-600">{formatter(used)} / {formatter(total)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className={`${color} h-2.5 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
    </div>
  );
}
