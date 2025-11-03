import React, { useState } from 'react';
import { MinderDataProvider } from '../src/index.js';
import { completeConfig } from './features/01-configuration.js';

// Import all feature examples
import { ConfigurationExample } from './features/01-configuration.js';
import { CrudOperationsExample } from './features/02-crud-operations.js';
import { AuthenticationExample } from './features/03-authentication.js';
import { CachingSystemExample } from './features/04-caching-system.js';
import { FileUploadExample } from './features/05-file-upload.js';
import { WebSocketRealTimeExample } from './features/06-websocket-realtime.js';

// 🚀 COMPLETE MINDER DATA PROVIDER DEMO
// Showcases all features with comprehensive examples

interface FeatureTab {
  id: string;
  title: string;
  icon: string;
  component: React.ComponentType;
  description: string;
}

const featureTabs: FeatureTab[] = [
  {
    id: 'configuration',
    title: 'Configuration',
    icon: '🏗️',
    component: ConfigurationExample,
    description: 'Complete configuration options with CORS, auth, caching, and performance settings'
  },
  {
    id: 'crud',
    title: 'CRUD Operations',
    icon: '🔄',
    component: CrudOperationsExample,
    description: 'One-touch CRUD with optimistic updates, validation, and business logic'
  },
  {
    id: 'auth',
    title: 'Authentication',
    icon: '🔐',
    component: AuthenticationExample,
    description: 'Complete auth system with JWT, roles, permissions, and multiple storage options'
  },
  {
    id: 'caching',
    title: 'Caching System',
    icon: '💾',
    component: CachingSystemExample,
    description: 'Advanced caching with TTL, invalidation, prefetching, and optimistic updates'
  },
  {
    id: 'upload',
    title: 'File Upload',
    icon: '📁',
    component: FileUploadExample,
    description: 'Complete file upload system with progress, drag & drop, and multiple formats'
  },
  {
    id: 'websocket',
    title: 'Real-Time',
    icon: '🔌',
    component: WebSocketRealTimeExample,
    description: 'WebSocket communication with chat, notifications, and presence system'
  }
];

function DemoApp() {
  const [activeTab, setActiveTab] = useState('configuration');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const activeFeature = featureTabs.find(tab => tab.id === activeTab);
  const ActiveComponent = activeFeature?.component || ConfigurationExample;
  
  return (
    <div className="demo-app">
      {/* 📱 HEADER */}
      <header className="demo-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? '◀️' : '▶️'}
            </button>
            <h1 className="demo-title">
              🚀 Minder Data Provider
            </h1>
            <span className="demo-subtitle">
              Complete Demo & Documentation
            </span>
          </div>
          
          <div className="header-right">
            <div className="feature-info">
              <span className="feature-icon">{activeFeature?.icon}</span>
              <div className="feature-details">
                <div className="feature-title">{activeFeature?.title}</div>
                <div className="feature-description">{activeFeature?.description}</div>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <div className="demo-layout">
        {/* 📋 SIDEBAR NAVIGATION */}
        <aside className={`demo-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <nav className="sidebar-nav">
            <div className="nav-header">
              <h3>🎯 Features</h3>
              <p>Explore all capabilities</p>
            </div>
            
            <ul className="nav-list">
              {featureTabs.map(tab => (
                <li key={tab.id} className="nav-item">
                  <button
                    className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="nav-icon">{tab.icon}</span>
                    <div className="nav-content">
                      <div className="nav-title">{tab.title}</div>
                      <div className="nav-description">{tab.description}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            
            {/* 📊 PACKAGE INFO */}
            <div className="package-info">
              <h4>📦 Package Info</h4>
              <div className="info-grid">
                <div className="info-item">
                  <strong>Version:</strong> 2.0.0
                </div>
                <div className="info-item">
                  <strong>Bundle Size:</strong> ~17KB
                </div>
                <div className="info-item">
                  <strong>Dependencies:</strong> 5
                </div>
                <div className="info-item">
                  <strong>TypeScript:</strong> ✅ Full Support
                </div>
              </div>
            </div>
            
            {/* 🔗 QUICK LINKS */}
            <div className="quick-links">
              <h4>🔗 Quick Links</h4>
              <div className="links-grid">
                <a href="#" className="quick-link">📖 Documentation</a>
                <a href="#" className="quick-link">🐛 Issues</a>
                <a href="#" className="quick-link">💬 Discord</a>
                <a href="#" className="quick-link">⭐ GitHub</a>
              </div>
            </div>
          </nav>
        </aside>
        
        {/* 📄 MAIN CONTENT */}
        <main className={`demo-main ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          <div className="content-container">
            {/* 🎯 FEATURE SHOWCASE */}
            <div className="feature-showcase">
              <ActiveComponent />
            </div>
            
            {/* 📚 GLOBAL FEATURES OVERVIEW */}
            <div className="global-features">
              <h2>📚 Complete Feature Overview</h2>
              
              <div className="features-grid">
                <div className="feature-category">
                  <h3>🏗️ Architecture</h3>
                  <ul>
                    <li>✅ Hybrid Redux + TanStack Query</li>
                    <li>✅ TypeScript with full type safety</li>
                    <li>✅ Modular and tree-shakeable</li>
                    <li>✅ Next.js SSR/SSG compatible</li>
                  </ul>
                </div>
                
                <div className="feature-category">
                  <h3>🔄 Data Management</h3>
                  <ul>
                    <li>✅ One-touch CRUD operations</li>
                    <li>✅ Optimistic updates with rollback</li>
                    <li>✅ Automatic model transformation</li>
                    <li>✅ Business logic encapsulation</li>
                  </ul>
                </div>
                
                <div className="feature-category">
                  <h3>💾 Caching & Performance</h3>
                  <ul>
                    <li>✅ Multi-level intelligent caching</li>
                    <li>✅ Request deduplication</li>
                    <li>✅ Background refetching</li>
                    <li>✅ Cache invalidation strategies</li>
                  </ul>
                </div>
                
                <div className="feature-category">
                  <h3>🔐 Security & Auth</h3>
                  <ul>
                    <li>✅ JWT token management</li>
                    <li>✅ Role-based access control</li>
                    <li>✅ Permission system</li>
                    <li>✅ Multiple storage strategies</li>
                  </ul>
                </div>
                
                <div className="feature-category">
                  <h3>🌐 Network & API</h3>
                  <ul>
                    <li>✅ CORS support built-in</li>
                    <li>✅ Automatic retry with backoff</li>
                    <li>✅ Request/response interceptors</li>
                    <li>✅ File upload with progress</li>
                  </ul>
                </div>
                
                <div className="feature-category">
                  <h3>🔌 Real-Time</h3>
                  <ul>
                    <li>✅ WebSocket integration</li>
                    <li>✅ Auto-reconnection</li>
                    <li>✅ Message subscription system</li>
                    <li>✅ Presence and notifications</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* 🎯 USAGE EXAMPLES */}
            <div className="usage-examples">
              <h2>🎯 Quick Usage Examples</h2>
              
              <div className="examples-grid">
                <div className="example-card">
                  <h3>🚀 Basic Setup</h3>
                  <pre><code>{`import { MinderDataProvider } from 'minder-data-provider';

const config = {
  apiBaseUrl: 'https://api.example.com',
  routes: {
    users: { method: 'GET', url: '/users' }
  }
};

<MinderDataProvider config={config}>
  <App />
</MinderDataProvider>`}</code></pre>
                </div>
                
                <div className="example-card">
                  <h3>🔄 CRUD Operations</h3>
                  <pre><code>{`const { data, loading, operations } = useOneTouchCrud('users');

// Create
await operations.create({ name: 'John', email: 'john@example.com' });

// Update (optimistic)
await operations.update(1, { name: 'Jane' });

// Delete (optimistic)
await operations.delete(1);`}</code></pre>
                </div>
                
                <div className="example-card">
                  <h3>🔐 Authentication</h3>
                  <pre><code>{`const auth = useAuth();
const currentUser = useCurrentUser();

// Login
auth.setToken('jwt-token');

// Check permissions
if (currentUser.hasPermission('admin')) {
  // Admin only content
}`}</code></pre>
                </div>
                
                <div className="example-card">
                  <h3>💾 Caching</h3>
                  <pre><code>{`const cache = useCache();

// Preload data
await cache.prefetchQuery('users', fetchUsers);

// Invalidate cache
await cache.invalidateQueries('users');

// Optimistic update
await cache.optimisticUpdate('users', updater);`}</code></pre>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      
      {/* 📱 FOOTER */}
      <footer className="demo-footer">
        <div className="footer-content">
          <div className="footer-left">
            <p>🚀 Minder Data Provider - Production-ready data management for Next.js</p>
          </div>
          <div className="footer-right">
            <span>Built with ❤️ for the React community</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// 🎯 ROOT APP WITH PROVIDER
export default function App() {
  return (
    <MinderDataProvider config={completeConfig}>
      <DemoApp />
    </MinderDataProvider>
  );
}