import React from 'react';

export function ModularImportsDemo() {
  return (
    <div className="demo-section">
      <h2>📦 Modular Imports (Tree-Shaking)</h2>
      <p>Import only what you need to reduce bundle size:</p>

      <div className="import-examples">
        <div className="import-comparison">
          <div className="full-import">
            <h3>❌ Full Import (Large Bundle)</h3>
            <pre>{`// Imports everything (~150KB)
import { 
  useOneTouchCrud, 
  useAuth, 
  useCache,
  useWebSocket,
  useMediaUpload 
} from 'minder-data-provider';`}</pre>
          </div>

          <div className="modular-import">
            <h3>✅ Modular Import (Small Bundle)</h3>
            <pre>{`// Import only CRUD (~45KB)
import { useOneTouchCrud } from 'minder-data-provider/crud';

// Import only Auth (~25KB)  
import { useAuth } from 'minder-data-provider/auth';

// Import only Cache (~20KB)
import { useCache } from 'minder-data-provider/cache';

// Import only WebSocket (~15KB)
import { useWebSocket } from 'minder-data-provider/websocket';

// Import only Upload (~10KB)
import { useMediaUpload } from 'minder-data-provider/upload';`}</pre>
          </div>
        </div>

        <div className="bundle-analysis">
          <h3>Bundle Size Comparison:</h3>
          <table className="size-table">
            <thead>
              <tr>
                <th>Import Method</th>
                <th>Bundle Size</th>
                <th>Savings</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Full Import</td>
                <td>~150KB</td>
                <td>-</td>
              </tr>
              <tr>
                <td>CRUD Only</td>
                <td>~45KB</td>
                <td>70% smaller</td>
              </tr>
              <tr>
                <td>Auth Only</td>
                <td>~25KB</td>
                <td>83% smaller</td>
              </tr>
              <tr>
                <td>Cache Only</td>
                <td>~20KB</td>
                <td>87% smaller</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="available-modules">
          <h3>Available Modules:</h3>
          <div className="modules-grid">
            <div className="module">
              <h4>📊 CRUD</h4>
              <code>minder-data-provider/crud</code>
              <p>Data operations and state management</p>
            </div>
            
            <div className="module">
              <h4>🔐 Auth</h4>
              <code>minder-data-provider/auth</code>
              <p>Authentication and user management</p>
            </div>
            
            <div className="module">
              <h4>💾 Cache</h4>
              <code>minder-data-provider/cache</code>
              <p>Caching and performance optimization</p>
            </div>
            
            <div className="module">
              <h4>🌐 WebSocket</h4>
              <code>minder-data-provider/websocket</code>
              <p>Real-time communication</p>
            </div>
            
            <div className="module">
              <h4>📁 Upload</h4>
              <code>minder-data-provider/upload</code>
              <p>File upload with progress tracking</p>
            </div>
            
            <div className="module">
              <h4>🔍 Debug</h4>
              <code>minder-data-provider/debug</code>
              <p>Development tools and debugging</p>
            </div>
            
            <div className="module">
              <h4>⚙️ Config</h4>
              <code>minder-data-provider/config</code>
              <p>Simplified configuration helpers</p>
            </div>
            
            <div className="module">
              <h4>🌐 SSR</h4>
              <code>minder-data-provider/ssr</code>
              <p>Server-side rendering utilities</p>
            </div>
          </div>
        </div>

        <div className="webpack-config">
          <h3>Webpack Configuration:</h3>
          <pre>{`// webpack.config.js
module.exports = {
  optimization: {
    usedExports: true,
    sideEffects: false
  },
  resolve: {
    alias: {
      'minder-data-provider/crud': 'minder-data-provider/dist/crud',
      'minder-data-provider/auth': 'minder-data-provider/dist/auth',
      // ... other modules
    }
  }
};`}</pre>
        </div>

        <div className="performance-tips">
          <h3>Performance Tips:</h3>
          <ul>
            <li>🎯 Use modular imports in production builds</li>
            <li>📊 Analyze bundle size with webpack-bundle-analyzer</li>
            <li>⚡ Enable tree-shaking in your bundler</li>
            <li>🔄 Use dynamic imports for rarely used features</li>
            <li>📦 Consider code splitting for large applications</li>
          </ul>
        </div>
      </div>
    </div>
  );
}