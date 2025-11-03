import React, { useState } from 'react';
import { useDebug, useOneTouchCrud } from '../../src/index.js';

export function DebugToolsDemo() {
  const debug = useDebug();
  const { data: users, operations } = useOneTouchCrud('users');
  const [logs, setLogs] = useState<any[]>([]);

  const handleApiCall = async () => {
    debug.startTimer('fetch-users');
    debug.log('api', 'Starting user fetch operation');
    
    try {
      await operations.fetch();
      debug.log('api', 'User fetch completed successfully', { count: users.length });
    } catch (error) {
      debug.log('api', 'User fetch failed', error);
    } finally {
      debug.endTimer('fetch-users');
    }
  };

  const showLogs = () => {
    setLogs(debug.getLogs());
  };

  const showPerformance = () => {
    const metrics = debug.getPerformanceMetrics();
    console.table(metrics);
    alert('Performance metrics logged to console');
  };

  return (
    <div className="demo-section">
      <h2>🔍 Advanced Debug Tools</h2>
      <p>Comprehensive debugging and performance monitoring:</p>

      <div className="debug-controls">
        <button onClick={handleApiCall}>Make API Call with Debug</button>
        <button onClick={showLogs}>Show Debug Logs</button>
        <button onClick={showPerformance}>Show Performance Metrics</button>
        <button onClick={() => debug.clearLogs()}>Clear Logs</button>
      </div>

      <div className="debug-features">
        <h3>Debug Features:</h3>
        <ul>
          <li>🕐 Performance timing for all operations</li>
          <li>📝 Detailed API request/response logging</li>
          <li>🔍 Cache hit/miss tracking</li>
          <li>🌐 WebSocket connection monitoring</li>
          <li>🔐 Authentication flow debugging</li>
          <li>⚡ Bundle size analysis</li>
          <li>🎯 Component render tracking</li>
        </ul>
      </div>

      {logs.length > 0 && (
        <div className="debug-logs">
          <h3>Debug Logs:</h3>
          <div className="logs-container">
            {logs.map((log, index) => (
              <div key={index} className={`log-entry log-${log.type}`}>
                <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="log-type">[{log.type.toUpperCase()}]</span>
                <span className="log-message">{log.message}</span>
                {log.data && (
                  <pre className="log-data">{JSON.stringify(log.data, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="debug-window-access">
        <h3>Global Debug Access:</h3>
        <p>Access debug tools from browser console:</p>
        <code>window.__MINDER_DEBUG__.getLogs()</code>
      </div>
    </div>
  );
}