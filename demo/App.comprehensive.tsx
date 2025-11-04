/**
 * 🎯 COMPREHENSIVE MINDER DEMO APPLICATION
 * Full-featured demo with ALL capabilities:
 * - CRUD Operations with Optimistic Updates
 * - Authentication & Authorization
 * - Real-time WebSocket
 * - File Upload with Preview
 * - Advanced Caching
 * - Offline Support
 * - Security Features
 * - Platform Detection
 * - DevTools Integration
 * - SSR/SSG Support
 */

'use client';

import React, { useState, useEffect } from 'react';
import { MinderDataProvider } from '../src/index';
import { demoConfig, featureFlags } from './config/demo.config';

// Import feature components
import { DemoLayout } from './components/DemoLayout.js';
import { DemoHeader } from './components/DemoHeader.js';
import { DemoSidebar } from './components/DemoSidebar.js';
import { DemoDevTools } from './components/DemoDevTools.js';

// Import feature panels
import { PlatformPanel } from './panels/PlatformPanel.js';
import { CrudPanel } from './panels/CrudPanel.js';
import { AuthPanel } from './panels/AuthPanel.js';
import { WebSocketPanel } from './panels/WebSocketPanel.js';
import { UploadPanel } from './panels/UploadPanel.js';
import { CachePanel } from './panels/CachePanel.js';
import { OfflinePanel } from './panels/OfflinePanel.js';
import { SecurityPanel } from './panels/SecurityPanel.js';
import { PerformancePanel } from './panels/PerformancePanel.js';
import { ConfigPanel } from './panels/ConfigPanel.js';

// ============================================================================
// 🎯 FEATURE REGISTRY
// ============================================================================
export interface Feature {
  id: string;
  title: string;
  icon: string;
  description: string;
  category: string;
  enabled: boolean;
  component: React.ComponentType;
  badge?: string;
}

const features: Feature[] = [
  {
    id: 'platform',
    title: 'Platform Detection',
    icon: '🖥️',
    description: 'Auto-detect and optimize for Web, Next.js, React Native, Expo, Electron',
    category: 'Core',
    enabled: true,
    component: PlatformPanel,
    badge: 'New',
  },
  {
    id: 'crud',
    title: 'CRUD Operations',
    icon: '🔄',
    description: 'Complete CRUD with optimistic updates, validation, and business logic',
    category: 'Data',
    enabled: featureFlags.crud,
    component: CrudPanel,
  },
  {
    id: 'auth',
    title: 'Authentication',
    icon: '🔐',
    description: 'JWT auth, role-based access, permissions, and secure storage',
    category: 'Security',
    enabled: featureFlags.auth,
    component: AuthPanel,
  },
  {
    id: 'websocket',
    title: 'Real-time (WebSocket)',
    icon: '🔌',
    description: 'WebSocket connection with auto-reconnect, subscriptions, and presence',
    category: 'Real-time',
    enabled: featureFlags.websocket,
    component: WebSocketPanel,
  },
  {
    id: 'upload',
    title: 'File Upload',
    icon: '📤',
    description: 'Image upload with preview, validation, progress tracking, and chunking',
    category: 'Media',
    enabled: featureFlags.upload,
    component: UploadPanel,
  },
  {
    id: 'cache',
    title: 'Caching System',
    icon: '💾',
    description: 'Multi-level cache with LRU, persistence, and invalidation strategies',
    category: 'Performance',
    enabled: featureFlags.cache,
    component: CachePanel,
  },
  {
    id: 'offline',
    title: 'Offline Support',
    icon: '📡',
    description: 'Queue requests offline, sync on reconnect, and offline-first patterns',
    category: 'Network',
    enabled: featureFlags.offline,
    component: OfflinePanel,
    badge: 'New',
  },
  {
    id: 'security',
    title: 'Security',
    icon: '🛡️',
    description: 'XSS/CSRF protection, input sanitization, CSP headers, and encryption',
    category: 'Security',
    enabled: featureFlags.security,
    component: SecurityPanel,
    badge: 'New',
  },
  {
    id: 'performance',
    title: 'Performance',
    icon: '⚡',
    description: 'Request deduplication, prefetching, lazy loading, and monitoring',
    category: 'Performance',
    enabled: featureFlags.performance,
    component: PerformancePanel,
  },
  {
    id: 'config',
    title: 'Configuration',
    icon: '⚙️',
    description: 'Complete configuration overview and dynamic updates',
    category: 'Core',
    enabled: true,
    component: ConfigPanel,
  },
];

// ============================================================================
// 🎯 MAIN DEMO APP
// ============================================================================
function DemoApp() {
  const [activeFeature, setActiveFeature] = useState<string>('platform');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const currentFeature = features.find(f => f.id === activeFeature);
  const ActivePanel = currentFeature?.component || PlatformPanel;

  // Group features by category
  const categories = features.reduce((acc, feature) => {
    if (!acc[feature.category]) {
      acc[feature.category] = [];
    }
    acc[feature.category].push(feature);
    return acc;
  }, {} as Record<string, Feature[]>);

  useEffect(() => {
    // Load dark mode preference
    const isDark = localStorage.getItem('minder_demo_dark_mode') === 'true';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('minder_demo_dark_mode', String(newMode));
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className={`demo-app ${darkMode ? 'dark' : ''}`}>
      {/* Header */}
      <DemoHeader
        currentFeature={currentFeature}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleDevTools={() => setDevToolsOpen(!devToolsOpen)}
        sidebarOpen={sidebarOpen}
        devToolsOpen={devToolsOpen}
      />

      {/* Main Layout */}
      <DemoLayout sidebarOpen={sidebarOpen}>
        {/* Sidebar */}
        <DemoSidebar
          features={features}
          categories={categories}
          activeFeature={activeFeature}
          onSelectFeature={setActiveFeature}
          isOpen={sidebarOpen}
        />

        {/* Main Content */}
        <main className="demo-main">
          <div className="demo-content">
            {/* Active Feature Panel */}
            <div className="feature-panel">
              <ActivePanel />
            </div>

            {/* Feature Stats */}
            <div className="feature-stats">
              <div className="stat-card">
                <div className="stat-icon">✨</div>
                <div className="stat-content">
                  <div className="stat-value">{features.length}</div>
                  <div className="stat-label">Total Features</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {features.filter(f => f.enabled).length}
                  </div>
                  <div className="stat-label">Enabled</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🆕</div>
                <div className="stat-content">
                  <div className="stat-value">
                    {features.filter(f => f.badge === 'New').length}
                  </div>
                  <div className="stat-label">New Features</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">🎯</div>
                <div className="stat-content">
                  <div className="stat-value">100%</div>
                  <div className="stat-label">TypeScript</div>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="quick-links-section">
              <h3>📚 Resources</h3>
              <div className="quick-links-grid">
                <a href="https://github.com/your-repo" className="quick-link-card" target="_blank" rel="noopener noreferrer">
                  <span className="link-icon">📖</span>
                  <span className="link-title">Documentation</span>
                  <span className="link-arrow">→</span>
                </a>
                <a href="https://github.com/your-repo/issues" className="quick-link-card" target="_blank" rel="noopener noreferrer">
                  <span className="link-icon">🐛</span>
                  <span className="link-title">Report Issues</span>
                  <span className="link-arrow">→</span>
                </a>
                <a href="https://github.com/your-repo/examples" className="quick-link-card" target="_blank" rel="noopener noreferrer">
                  <span className="link-icon">💡</span>
                  <span className="link-title">Examples</span>
                  <span className="link-arrow">→</span>
                </a>
                <a href="https://github.com/your-repo" className="quick-link-card" target="_blank" rel="noopener noreferrer">
                  <span className="link-icon">⭐</span>
                  <span className="link-title">Star on GitHub</span>
                  <span className="link-arrow">→</span>
                </a>
              </div>
            </div>
          </div>
        </main>
      </DemoLayout>

      {/* DevTools */}
      {devToolsOpen && <DemoDevTools onClose={() => setDevToolsOpen(false)} />}

      {/* Footer */}
      <footer className="demo-footer">
        <div className="footer-content">
          <div className="footer-left">
            <span>🚀 Minder Data Provider v2.1</span>
            <span className="separator">•</span>
            <span>Built with ❤️ for React</span>
          </div>
          <div className="footer-right">
            <span>
              {features.filter(f => f.enabled).length} of {features.length} features enabled
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// 🎯 ROOT APP WITH PROVIDER
// ============================================================================
export default function App() {
  return (
    <MinderDataProvider config={demoConfig}>
      <DemoApp />
    </MinderDataProvider>
  );
}
