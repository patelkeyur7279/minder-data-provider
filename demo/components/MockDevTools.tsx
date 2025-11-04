import React, { useState, useEffect } from 'react';

interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
}

interface MockDevToolsProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  defaultOpen?: boolean;
}

// Simple event emitter for demo purposes
class SimpleEventEmitter {
  private listeners: { [key: string]: Function[] } = {};

  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string, callback: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event: string, data: any) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }
}

export const mockDevToolsEvents = new SimpleEventEmitter();

export function MockDevTools({ position = 'bottom-right', defaultOpen = true }: MockDevToolsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<'network' | 'cache' | 'performance' | 'state'>('network');
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalRequests: 0,
    avgLatency: 0,
    cacheHitRate: 0,
  });

  useEffect(() => {
    const handleNetworkRequest = (request: NetworkRequest) => {
      setNetworkRequests(prev => [...prev.slice(-19), request]);
      setPerformanceMetrics(prev => ({
        totalRequests: prev.totalRequests + 1,
        avgLatency: Math.round((prev.avgLatency * prev.totalRequests + request.duration) / (prev.totalRequests + 1)),
        cacheHitRate: prev.cacheHitRate,
      }));
    };

    mockDevToolsEvents.on('network:request', handleNetworkRequest);

    return () => {
      mockDevToolsEvents.off('network:request', handleNetworkRequest);
    };
  }, []);

  const positionStyles = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return '#10b981';
    if (status >= 300 && status < 400) return '#3b82f6';
    if (status >= 400 && status < 500) return '#f59e0b';
    return '#ef4444';
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          ...positionStyles[position],
          padding: '12px 16px',
          background: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 10000,
        }}
      >
        🛠️ DevTools
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        ...positionStyles[position],
        width: '600px',
        maxHeight: '500px',
        background: 'white',
        border: '1px solid #e0e0e0',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>🛠️</span>
          <span style={{ fontWeight: 'bold', fontSize: '16px' }}>Minder DevTools</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
          borderBottom: '1px solid #e0e0e0',
          background: '#f9fafb',
        }}
      >
        {(['network', 'cache', 'performance', 'state'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 12px',
              border: 'none',
              background: activeTab === tab ? '#0070f3' : 'transparent',
              color: activeTab === tab ? 'white' : '#666',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {activeTab === 'network' && (
          <div>
            <div style={{ marginBottom: '12px', color: '#666', fontSize: '14px' }}>
              Total Requests: <strong>{networkRequests.length}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {networkRequests.length === 0 ? (
                <div style={{ color: '#999', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>
                  No network requests yet. Build a query or test plugins to see requests here.
                </div>
              ) : (
                networkRequests.slice().reverse().map(req => (
                  <div
                    key={req.id}
                    style={{
                      padding: '12px',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      borderLeft: `3px solid ${getStatusColor(req.status)}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: getStatusColor(req.status),
                            background: 'white',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {req.method}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: getStatusColor(req.status),
                          }}
                        >
                          {req.status}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#999' }}>{formatTime(req.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#333', marginBottom: '4px', wordBreak: 'break-all' }}>
                      {req.url}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      Duration: <strong>{req.duration}ms</strong>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'cache' && (
          <div style={{ color: '#666', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>
            Cache entries will appear here when cache is used.
          </div>
        )}

        {activeTab === 'performance' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '16px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Total Requests</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>
                  {performanceMetrics.totalRequests}
                </div>
              </div>
              <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Avg Latency</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
                  {performanceMetrics.avgLatency}ms
                </div>
              </div>
              <div style={{ padding: '16px', background: '#dcfce7', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Cache Hit Rate</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>
                  {performanceMetrics.cacheHitRate}%
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'state' && (
          <div style={{ color: '#666', fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>
            State changes will be tracked here.
          </div>
        )}
      </div>
    </div>
  );
}
