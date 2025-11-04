// Cache Visualization Component
// Shows cache hit/miss statistics and visualization

'use client';

import React from 'react';

interface Props {
  cache: {
    hits: number;
    misses: number;
    size: number;
    entries: number;
    ttl: number;
    strategy: string;
    topKeys: Array<{ key: string; hits: number; size: number; lastAccess: string }>;
    evictions: number;
  };
}

export function CacheVisualization({ cache }: Props) {
  const total = cache.hits + cache.misses;
  const hitRate = total > 0 ? (cache.hits / total) * 100 : 0;

  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="text-2xl mr-2">💾</span>
        Cache Statistics
      </h3>

      {/* Hit Rate Circle */}
      <div className="text-center mb-6">
        <div className="relative inline-block">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle cx="64" cy="64" r="56" stroke="#E5E7EB" strokeWidth="8" fill="none" />
            <circle 
              cx="64" 
              cy="64" 
              r="56" 
              stroke="#10B981" 
              strokeWidth="8" 
              fill="none"
              strokeDasharray={`${2 * Math.PI * 56}`}
              strokeDashoffset={`${2 * Math.PI * 56 * (1 - hitRate / 100)}`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-green-600">{Math.round(hitRate)}%</span>
            <span className="text-xs text-gray-500">Hit Rate</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <CacheStat label="Hits" value={cache.hits} color="green" />
        <CacheStat label="Misses" value={cache.misses} color="red" />
        <CacheStat label="Entries" value={cache.entries} color="blue" />
        <CacheStat label="Evictions" value={cache.evictions} color="yellow" />
      </div>

      {/* Strategy */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 mb-4">
        <div className="text-xs text-gray-600 mb-1">Strategy</div>
        <div className="text-sm font-semibold text-purple-700">{cache.strategy}</div>
      </div>

      {/* Size Info */}
      <div className="text-sm text-gray-600">
        <div className="flex justify-between mb-1">
          <span>Cache Size:</span>
          <span className="font-semibold">{(cache.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        <div className="flex justify-between">
          <span>Avg TTL:</span>
          <span className="font-semibold">{Math.round(cache.ttl / 1000)}s</span>
        </div>
      </div>
    </div>
  );
}

function CacheStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-800 border-green-300',
    red: 'bg-red-100 text-red-800 border-red-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300'
  };

  return (
    <div className={`p-3 rounded-lg border ${colors[color]}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
