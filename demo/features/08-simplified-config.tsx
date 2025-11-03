import React from 'react';
import { createMinderConfig } from '../../src/config/index.js';

// Simplified configuration example
const simpleConfig = createMinderConfig({
  apiUrl: 'https://jsonplaceholder.typicode.com',
  routes: {
    users: '/users',
    posts: '/posts'
  },
  auth: true,
  cache: { staleTime: 300000 },
  cors: true,
  websocket: true,
  debug: true
});

export function SimplifiedConfigDemo() {
  return (
    <div className="demo-section">
      <h2>🔧 Simplified Configuration</h2>
      <p>Create complete configuration with minimal setup:</p>
      
      <div className="code-block">
        <pre>{`const config = createMinderConfig({
  apiUrl: 'https://api.example.com',
  routes: {
    users: '/users',    // Auto-generates CRUD
    posts: '/posts'     // Auto-generates CRUD
  },
  auth: true,           // Auto-configures auth
  cache: true,          // Auto-configures cache
  cors: true,           // Auto-configures CORS
  websocket: true,      // Auto-configures WebSocket
  debug: true           // Enables debug mode
});`}</pre>
      </div>

      <div className="feature-info">
        <h3>Auto-Generated Features:</h3>
        <ul>
          <li>✅ CRUD operations for each route</li>
          <li>✅ Authentication with localStorage</li>
          <li>✅ Intelligent caching with 5min stale time</li>
          <li>✅ CORS handling with credentials</li>
          <li>✅ WebSocket with auto-reconnection</li>
          <li>✅ Performance optimizations</li>
          <li>✅ Environment detection</li>
        </ul>
      </div>

      <div className="generated-config">
        <h3>Generated Configuration:</h3>
        <pre>{JSON.stringify(simpleConfig, null, 2)}</pre>
      </div>
    </div>
  );
}