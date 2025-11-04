// Network Activity Graph Component
// Displays network request activity with sparkline graph

'use client';

import React from 'react';

interface Props {
  network: {
    activeRequests: number;
    totalRequests: number;
    successRequests: number;
    errorRequests: number;
    cachedRequests: number;
    deduplicatedRequests: number;
    websocketConnections: number;
    bytesTransferred: number;
    requestTimeline: Array<{
      timestamp: number;
      duration: number;
      status: number;
    }>;
  };
}

export function NetworkActivityGraph({ network }: Props) {
  // Generate sparkline data from timeline
  const sparklineData = network.requestTimeline.slice(-20).map(r => r.duration);
  const maxDuration = Math.max(...sparklineData, 1);

  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="text-2xl mr-2">🌐</span>
        Network Activity
      </h3>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <NetworkStat label="Active" value={network.activeRequests} color="blue" pulse />
        <NetworkStat label="Total" value={network.totalRequests} color="gray" />
        <NetworkStat label="Success" value={network.successRequests} color="green" icon="✓" />
        <NetworkStat label="Errors" value={network.errorRequests} color="red" icon="✗" />
      </div>

      {/* Sparkline */}
      <div className="mb-4">
        <div className="text-xs text-gray-600 mb-2">Response Time (Last 20)</div>
        <div className="flex items-end justify-between h-16 bg-gradient-to-t from-blue-50 to-transparent rounded-lg p-2">
          {sparklineData.map((duration, i) => {
            const height = (duration / maxDuration) * 100;
            return (
              <div key={i} className="flex-1 mx-px">
                <div 
                  className="bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all duration-300"
                  style={{ height: `${height}%` }}
                  title={`${duration}ms`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="space-y-2 text-sm">
        <MetricRow label="Cached" value={network.cachedRequests} />
        <MetricRow label="Deduplicated" value={network.deduplicatedRequests} />
        <MetricRow label="WebSocket" value={network.websocketConnections} icon="🔌" />
        <MetricRow 
          label="Transferred" 
          value={`${(network.bytesTransferred / 1024).toFixed(1)} KB`} 
        />
      </div>
    </div>
  );
}

function NetworkStat({ 
  label, 
  value, 
  color, 
  icon, 
  pulse 
}: { 
  label: string; 
  value: number; 
  color: string; 
  icon?: string;
  pulse?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    gray: 'bg-gray-100 text-gray-800 border-gray-300',
    green: 'bg-green-100 text-green-800 border-green-300',
    red: 'bg-red-100 text-red-800 border-red-300'
  };

  return (
    <div className={`relative p-3 rounded-lg border ${colors[color]}`}>
      {pulse && value > 0 && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      )}
      <div className="text-xs font-medium">{label}</div>
      <div className="text-2xl font-bold flex items-center">
        {value}
        {icon && <span className="ml-2 text-lg">{icon}</span>}
      </div>
    </div>
  );
}

function MetricRow({ label, value, icon }: { label: string; value: number | string; icon?: string }) {
  return (
    <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-800 flex items-center">
        {value}
        {icon && <span className="ml-2">{icon}</span>}
      </span>
    </div>
  );
}
