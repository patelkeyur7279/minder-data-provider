/**
 * 🛠️ COMPREHENSIVE DEVTOOLS COMPONENT
 * Raw debugging interface for end users to observe everything
 */

import React, { useState, useEffect } from 'react';
import {
  useMinderContext,
  PlatformDetector,
  useCache,
  useAuth,
  useWebSocket,
} from '../../src/index';

interface DemoDevToolsProps {
  onClose: () => void;
}

export function DemoDevTools({ onClose }: DemoDevToolsProps) {
  const [activeTab, setActiveTab] = useState<string>('platform');
  const [logs, setLogs] = useState<any[]>([]);
  const [networkRequests, setNetworkRequests] = useState<any[]>([]);
  const [cacheStats, setCacheStats] = useState<any>({});

  const context = useMinderContext();
  const [platformInfo, setPlatformInfo] = useState<any>(null);
  const cache = useCache();
  const auth = useAuth();
  const ws = useWebSocket();

  // Get platform info
  useEffect(() => {
    const info = PlatformDetector.getInfo();
    setPlatformInfo(info);
  }, []);

  // Monitor network requests
  useEffect(() => {
    const interceptor = (request: any) => {
      setNetworkRequests(prev => [
        {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          method: request.method,
          url: request.url,
          status: 'pending',
        },
        ...prev.slice(0, 49), // Keep last 50
      ]);
      return request;
    };

    // Add interceptor
    // Note: This is a simplified version
    return () => {
      // Cleanup
    };
  }, []);

  // Monitor cache stats
  useEffect(() => {
    const interval = setInterval(() => {
      if (cache) {
        const queries = cache.getAllCachedQueries();
        setCacheStats({
          size: queries.length,
          hits: 0, // Not exposed by current API
          misses: 0,
          hitRate: 0,
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cache]);

  const tabs = [
    { id: 'platform', label: '🖥️ Platform', icon: '🖥️' },
    { id: 'network', label: '🌐 Network', icon: '🌐' },
    { id: 'cache', label: '💾 Cache', icon: '💾' },
    { id: 'state', label: '📊 State', icon: '📊' },
    { id: 'auth', label: '🔐 Auth', icon: '🔐' },
    { id: 'websocket', label: '🔌 WebSocket', icon: '🔌' },
    { id: 'performance', label: '⚡ Performance', icon: '⚡' },
    { id: 'logs', label: '📝 Logs', icon: '📝' },
  ];

  return (
    <div className="devtools-overlay">
      <div className="devtools-container">
        {/* Header */}
        <div className="devtools-header">
          <div className="devtools-title">
            <span className="devtools-icon">🛠️</span>
            <h3>Minder DevTools</h3>
            <span className="devtools-badge">LIVE</span>
          </div>
          <button className="devtools-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="devtools-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`devtools-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="devtools-content">
          {/* Platform Info */}
          {activeTab === 'platform' && (
            <div className="devtools-panel">
              <h4>Platform Detection</h4>
              <div className="devtools-grid">
                <div className="devtools-item">
                  <strong>Platform:</strong>
                  <span>{platformInfo?.platform || 'Unknown'}</span>
                </div>
                <div className="devtools-item">
                  <strong>Is Web:</strong>
                  <span>{String(platformInfo?.isWeb)}</span>
                </div>
                <div className="devtools-item">
                  <strong>Is Server:</strong>
                  <span>{String(platformInfo?.isServer)}</span>
                </div>
                <div className="devtools-item">
                  <strong>Is Mobile:</strong>
                  <span>{String(platformInfo?.isMobile)}</span>
                </div>
                <div className="devtools-item">
                  <strong>User Agent:</strong>
                  <pre className="user-agent">{platformInfo?.userAgent || 'N/A'}</pre>
                </div>
              </div>
            </div>
          )}

          {/* Network Monitor */}
          {activeTab === 'network' && (
            <div className="devtools-panel">
              <h4>Network Requests ({networkRequests.length})</h4>
              <div className="devtools-table">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Method</th>
                      <th>URL</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkRequests.map((req) => (
                      <tr key={req.id}>
                        <td>{new Date(req.timestamp).toLocaleTimeString()}</td>
                        <td><span className={`method-badge ${req.method}`}>{req.method}</span></td>
                        <td>{req.url}</td>
                        <td><span className={`status-badge ${req.status}`}>{req.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cache Inspector */}
          {activeTab === 'cache' && (
            <div className="devtools-panel">
              <h4>Cache Statistics</h4>
              <div className="devtools-stats">
                <div className="stat-card">
                  <div className="stat-label">Cache Size</div>
                  <div className="stat-value">{cacheStats.size || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Cache Hits</div>
                  <div className="stat-value">{cacheStats.hits || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Cache Misses</div>
                  <div className="stat-value">{cacheStats.misses || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Hit Rate</div>
                  <div className="stat-value">
                    {((cacheStats.hitRate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="devtools-actions">
                <button onClick={() => cache?.clearCache()}>Clear Cache</button>
                <button onClick={() => cache?.invalidateQueries()}>Invalidate All</button>
              </div>
            </div>
          )}

          {/* State Viewer */}
          {activeTab === 'state' && (
            <div className="devtools-panel">
              <h4>Application State</h4>
              <div className="devtools-json">
                <pre>{JSON.stringify(context || {}, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Auth Info */}
          {activeTab === 'auth' && (
            <div className="devtools-panel">
              <h4>Authentication</h4>
              <div className="devtools-grid">
                <div className="devtools-item">
                  <strong>Authenticated:</strong>
                  <span>{String(auth?.isAuthenticated)}</span>
                </div>
                <div className="devtools-item">
                  <strong>Token:</strong>
                  <span className="token-display">
                    {auth?.getToken() ? '•'.repeat(20) : 'None'}
                  </span>
                </div>
                <div className="devtools-item">
                  <strong>Refresh Token:</strong>
                  <span className="token-display">
                    {auth?.getRefreshToken() ? '•'.repeat(20) : 'None'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* WebSocket Info */}
          {activeTab === 'websocket' && (
            <div className="devtools-panel">
              <h4>WebSocket Connection</h4>
              <div className="devtools-grid">
                <div className="devtools-item">
                  <strong>Status:</strong>
                  <span className={`ws-status ${ws?.isConnected() ? 'connected' : 'disconnected'}`}>
                    {ws?.isConnected() ? '🟢 Connected' : '🔴 Disconnected'}
                  </span>
                </div>
                <div className="devtools-item">
                  <strong>Available:</strong>
                  <span>{ws ? 'Yes' : 'No'}</span>
                </div>
              </div>
              <div className="devtools-actions">
                {ws?.isConnected() ? (
                  <button onClick={() => ws?.disconnect()}>Disconnect</button>
                ) : (
                  <button onClick={() => ws?.connect()}>Connect</button>
                )}
              </div>
            </div>
          )}

          {/* Performance Monitor */}
          {activeTab === 'performance' && (
            <div className="devtools-panel">
              <h4>Performance Metrics</h4>
              <div className="devtools-stats">
                <div className="stat-card">
                  <div className="stat-label">Total Requests</div>
                  <div className="stat-value">{networkRequests.length}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Avg Response Time</div>
                  <div className="stat-value">--ms</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Cache Hit Rate</div>
                  <div className="stat-value">
                    {((cacheStats.hitRate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Memory Usage</div>
                  <div className="stat-value">--MB</div>
                </div>
              </div>
            </div>
          )}

          {/* Logs */}
          {activeTab === 'logs' && (
            <div className="devtools-panel">
              <h4>Console Logs</h4>
              <div className="devtools-logs">
                {logs.length === 0 ? (
                  <div className="logs-empty">No logs yet</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`log-entry log-${log.level}`}>
                      <span className="log-time">{log.time}</span>
                      <span className="log-level">{log.level}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="devtools-actions">
                <button onClick={() => setLogs([])}>Clear Logs</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
