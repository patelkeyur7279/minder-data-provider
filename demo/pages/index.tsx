import { CrudExample } from '../features/02-crud-operations.js';
import { SimplifiedConfigDemo } from '../features/08-simplified-config.js';
import { DebugToolsDemo } from '../features/09-debug-tools.js';
import { SSRCSRFlexibleDemo } from '../features/10-ssr-csr-flexible.js';
import { ModularImportsDemo } from '../features/11-modular-imports.js';

export default function HomePage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>🚀 Minder Data Provider Demo - Enhanced v2.0</h1>
      
      <div className="demo-navigation">
        <h2>📋 New Features & Improvements</h2>
        <ul>
          <li>🔧 Simplified Configuration</li>
          <li>🔍 Advanced Debug Tools</li>
          <li>🌐 Flexible SSR/CSR Support</li>
          <li>📦 Modular Imports (Tree-Shaking)</li>
          <li>🛡️ Enhanced Security</li>
          <li>⚡ Performance Optimizations</li>
        </ul>
      </div>
      
      <SimplifiedConfigDemo />
      <ModularImportsDemo />
      <DebugToolsDemo />
      <SSRCSRFlexibleDemo />
      <CrudExample />
    </div>
  );
}