/**
 * DevTools Component
 * Browser extension integration for debugging and monitoring
 */

import React, { useEffect, useState, useCallback } from 'react';
import { PerformanceMonitor } from '../utils/performance';
import type { DevToolsConfig, NetworkRequest, CacheEntry, StateSnapshot } from './types.js';

// Re-export types for backward compatibility
export type { DevToolsConfig, NetworkRequest, CacheEntry, StateSnapshot } from './types.js';

// Custom event type declarations for type-safe event listeners
declare global {
  interface WindowEventMap {
    'minder:network': CustomEvent;
    'minder:cache': CustomEvent;
    'minder:state': CustomEvent;
  }
}

/**
 * DevTools UI Component
 */
export function DevTools({ config = {} }: { config?: DevToolsConfig }) {
  const {
    enabled = process.env.NODE_ENV === 'development',
    position = 'bottom-right',
    defaultOpen = false,
    showNetworkTab = true,
    showCacheTab = true,
    showPerformanceTab = true,
    showStateTab = true
  } = config;

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState('network');
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [stateSnapshots, setStateSnapshots] = useState<StateSnapshot[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);

  // Listen to window events for data updates
  useEffect(() => {
    if (!enabled) return;

    const handleNetworkRequest = (event: CustomEvent) => {
      setNetworkRequests(prev => [event.detail, ...prev].slice(0, 100));
    };

    const handleCacheUpdate = (event: CustomEvent) => {
      setCacheEntries(prev => {
        const updated = [...prev];
        const index = updated.findIndex(e => e.key === event.detail.key);
        if (index >= 0) {
          updated[index] = event.detail;
        } else {
          updated.unshift(event.detail);
        }
        return updated.slice(0, 100);
      });
    };

    const handleStateUpdate = (event: CustomEvent) => {
      setStateSnapshots(prev => [event.detail, ...prev].slice(0, 50));
    };

    window.addEventListener('minder:network', handleNetworkRequest);
    window.addEventListener('minder:cache', handleCacheUpdate);
    window.addEventListener('minder:state', handleStateUpdate);

    return () => {
      window.removeEventListener('minder:network', handleNetworkRequest);
      window.removeEventListener('minder:cache', handleCacheUpdate);
      window.removeEventListener('minder:state', handleStateUpdate);
    };
  }, [enabled]);

  // Refresh performance metrics
  useEffect(() => {
    if (!enabled || !isOpen || activeTab !== 'performance') return;

    const interval = setInterval(() => {
      const metrics = window.__MINDER_DEBUG__?.getPerformanceMetrics?.();
      setPerformanceMetrics(metrics);
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, isOpen, activeTab]);

  const clearNetworkRequests = useCallback(() => {
    setNetworkRequests([]);
  }, []);

  const clearCache = useCallback(() => {
    const event = new CustomEvent('minder:cache:clear');
    window.dispatchEvent(event);
    setCacheEntries([]);
  }, []);

  if (!enabled) return null;

  const positionStyles = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' }
  };

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles[position],
        zIndex: 999999,
        fontFamily: 'monospace',
        fontSize: '12px'
      }}
    >
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            background: '#1e293b',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            fontWeight: 'bold'
          }}
        >
          🛠️ Minder DevTools
        </button>
      ) : (
        <div
          style={{
            background: '#1e293b',
            color: '#e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            width: '600px',
            maxHeight: '500px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid #334155'
            }}
          >
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
              🛠️ Minder DevTools
            </span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                color: '#e2e8f0',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              padding: '8px 16px',
              borderBottom: '1px solid #334155',
              overflowX: 'auto'
            }}
          >
            {showNetworkTab && (
              <TabButton
                active={activeTab === 'network'}
                onClick={() => setActiveTab('network')}
              >
                Network ({networkRequests.length})
              </TabButton>
            )}
            {showCacheTab && (
              <TabButton
                active={activeTab === 'cache'}
                onClick={() => setActiveTab('cache')}
              >
                Cache ({cacheEntries.length})
              </TabButton>
            )}
            {showPerformanceTab && (
              <TabButton
                active={activeTab === 'performance'}
                onClick={() => setActiveTab('performance')}
              >
                Performance
              </TabButton>
            )}
            {showStateTab && (
              <TabButton
                active={activeTab === 'state'}
                onClick={() => setActiveTab('state')}
              >
                State ({stateSnapshots.length})
              </TabButton>
            )}
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '16px'
            }}
          >
            {activeTab === 'network' && (
              <NetworkTab
                requests={networkRequests}
                onClear={clearNetworkRequests}
              />
            )}
            {activeTab === 'cache' && (
              <CacheTab entries={cacheEntries} onClear={clearCache} />
            )}
            {activeTab === 'performance' && (
              <PerformanceTab metrics={performanceMetrics} />
            )}
            {activeTab === 'state' && (
              <StateTab snapshots={stateSnapshots} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Tab Button Component
function TabButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#334155' : 'transparent',
        color: active ? '#fff' : '#94a3b8',
        border: 'none',
        padding: '6px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </button>
  );
}

// Network Tab
function NetworkTab({ requests, onClear }: any) {
  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 'bold' }}>Network Requests</span>
        <button
          onClick={onClear}
          style={{
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Clear
        </button>
      </div>
      {requests.length === 0 ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
          No network requests yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {requests.map((req: NetworkRequest) => (
            <div
              key={req.id}
              style={{
                background: '#334155',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '11px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: getStatusColor(req.status), fontWeight: 'bold' }}>
                  {req.method} {req.status}
                </span>
                <span style={{ color: '#64748b' }}>{req.duration}ms</span>
              </div>
              <div style={{ color: '#94a3b8', wordBreak: 'break-all' }}>
                {req.url}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px', marginTop: '4px' }}>
                {new Date(req.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cache Tab
function CacheTab({ entries, onClear }: any) {
  return (
    <div>
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 'bold' }}>Cache Entries</span>
        <button
          onClick={onClear}
          style={{
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Clear All
        </button>
      </div>
      {entries.length === 0 ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
          No cache entries
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map((entry: CacheEntry, index: number) => (
            <div
              key={index}
              style={{
                background: '#334155',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '11px'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                {entry.key}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px' }}>
                Cached: {new Date(entry.timestamp).toLocaleTimeString()}
                {entry.ttl && ` | TTL: ${entry.ttl}ms`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Performance Tab
function PerformanceTab({ metrics }: any) {
  if (!metrics) {
    return (
      <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
        No performance data available
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>Performance Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <MetricCard label="Total Requests" value={metrics.requestCount} />
        <MetricCard label="Avg Latency" value={`${metrics.averageLatency}ms`} />
        <MetricCard label="Cache Hit Rate" value={`${metrics.cacheHitRate}%`} />
        <MetricCard label="Error Rate" value={`${metrics.errorRate}%`} />
      </div>
      {metrics.slowestRequests?.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '11px' }}>
            Slowest Requests
          </div>
          {metrics.slowestRequests.slice(0, 5).map((req: any, i: number) => (
            <div
              key={i}
              style={{
                background: '#334155',
                padding: '6px 8px',
                borderRadius: '4px',
                marginBottom: '4px',
                fontSize: '10px',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>{req.route}</span>
              <span style={{ color: req.duration > 500 ? '#ef4444' : '#64748b' }}>
                {req.duration}ms
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// State Tab
function StateTab({ snapshots }: any) {
  return (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: '12px' }}>State Snapshots</div>
      {snapshots.length === 0 ? (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
          No state snapshots yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {snapshots.map((snapshot: StateSnapshot, index: number) => (
            <div
              key={index}
              style={{
                background: '#334155',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '11px'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                {snapshot.route}
              </div>
              <div style={{ color: '#64748b', fontSize: '10px' }}>
                {new Date(snapshot.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Metric Card
function MetricCard({ label, value }: { label: string; value: any }) {
  return (
    <div
      style={{
        background: '#334155',
        padding: '12px',
        borderRadius: '4px'
      }}
    >
      <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
        {value}
      </div>
    </div>
  );
}

// Helper function
function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return '#10b981';
  if (status >= 300 && status < 400) return '#3b82f6';
  if (status >= 400 && status < 500) return '#f59e0b';
  return '#ef4444';
}

/**
 * DevTools Event Emitters
 */
export const DevToolsEvents = {
  emitNetworkRequest(request: NetworkRequest) {
    if (typeof window === 'undefined') return;
    const event = new CustomEvent('minder:network', { detail: request });
    window.dispatchEvent(event);
  },

  emitCacheUpdate(entry: CacheEntry) {
    if (typeof window === 'undefined') return;
    const event = new CustomEvent('minder:cache', { detail: entry });
    window.dispatchEvent(event);
  },

  emitStateUpdate(snapshot: StateSnapshot) {
    if (typeof window === 'undefined') return;
    const event = new CustomEvent('minder:state', { detail: snapshot });
    window.dispatchEvent(event);
  }
};
