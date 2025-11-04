/**
 * Main Demo Page - Complete Feature Showcase
 * Integrates all 10 feature panels with live statistics dashboard
 */

'use client';

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { CrudPanel } from '../panels/CrudPanel';
import { AuthPanel } from '../panels/AuthPanel';
import { CachePanel } from '../panels/CachePanel';
import { WebSocketPanel } from '../panels/WebSocketPanel';
import { UploadPanel } from '../panels/UploadPanel';
import { OfflinePanel } from '../panels/OfflinePanel';
import { PerformancePanel } from '../panels/PerformancePanel';
import { SecurityPanel } from '../panels/SecurityPanel';
import { PlatformPanel } from '../panels/PlatformPanel';
import { ConfigPanel } from '../panels/ConfigPanel';

// Dynamically import components to avoid SSR issues
const LiveStatsDashboard = dynamic(() => import('../components/LiveStatsDashboard').then(mod => ({ default: mod.LiveStatsDashboard })), { ssr: false });

const FEATURES = [
  { id: 'crud', name: '👥 CRUD Operations', component: CrudPanel, color: 'blue' },
  { id: 'auth', name: '🔐 Authentication', component: AuthPanel, color: 'green' },
  { id: 'cache', name: '⚡ Caching', component: CachePanel, color: 'purple' },
  { id: 'websocket', name: '🔌 WebSocket', component: WebSocketPanel, color: 'indigo' },
  { id: 'upload', name: '📁 File Upload', component: UploadPanel, color: 'pink' },
  { id: 'offline', name: '📡 Offline Mode', component: OfflinePanel, color: 'orange' },
  { id: 'performance', name: '⚡ Performance', component: PerformancePanel, color: 'teal' },
  { id: 'security', name: '🛡️ Security', component: SecurityPanel, color: 'red' },
  { id: 'platform', name: '🌐 Platform Detection', component: PlatformPanel, color: 'cyan' },
  { id: 'config', name: '⚙️ Configuration', component: ConfigPanel, color: 'gray' },
] as const;

export default function DemoPage() {
  const [activeFeature, setActiveFeature] = useState<string>('crud');
  const [showStats, setShowStats] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading demo...</p>
        </div>
      </div>
    );
  }

  const ActiveComponent = FEATURES.find(f => f.id === activeFeature)?.component || FEATURES[0].component;

  return (
    <>
      <Head>
        <title>Minder Data Provider v2.1 - Complete Demo</title>
        <meta name="description" content="Interactive demo showcasing all Minder features" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Minder Data Provider
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  v2.1.1 - Complete Feature Demonstration
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    showStats
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {showStats ? '📊 Hide Stats' : '📈 Show Stats'}
                </button>
                
                <a
                  href="https://github.com/yourusername/minder-data-provider"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  ⭐ GitHub
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Live Statistics Dashboard */}
          {showStats && (
            <div className="mb-8 animate-fade-in">
              <LiveStatsDashboard />
            </div>
          )}

          {/* Feature Navigation */}
          <div className="bg-white rounded-lg shadow-lg p-4 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Interactive Feature Demos
              </h2>
              <span className="text-sm text-gray-500">
                {FEATURES.length} features available
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {FEATURES.map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className={`px-4 py-3 rounded-lg font-medium transition-all transform hover:scale-105 ${
                    activeFeature === feature.id
                      ? `bg-gradient-to-r from-${feature.color}-500 to-${feature.color}-600 text-white shadow-lg`
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {feature.name}
                </button>
              ))}
            </div>
          </div>

          {/* Active Feature Panel */}
          <div className="animate-fade-in">
            <ActiveComponent />
          </div>

          {/* Quick Info Card */}
          <div className="mt-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg p-6 text-white">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">🚀 Quick Start</h3>
                <p className="text-blue-100 text-sm">
                  All features are pre-configured and ready to test. Docker services provide real backend APIs.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">📚 Documentation</h3>
                <p className="text-blue-100 text-sm">
                  Check out the comprehensive API docs and migration guides in the /docs folder.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">💡 Live Stats</h3>
                <p className="text-blue-100 text-sm">
                  Monitor real-time performance metrics, cache hits, network activity, and more.
                </p>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">API Server</span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-600 font-medium">Online</span>
                </span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">WebSocket</span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-600 font-medium">Connected</span>
                </span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">PostgreSQL</span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-600 font-medium">Ready</span>
                </span>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Redis Cache</span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs text-green-600 font-medium">Active</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center text-sm text-gray-600">
              <p>
                Minder Data Provider v2.1.1 © 2024 | Built with ❤️ using Next.js, TypeScript, and TanStack Query
              </p>
              <p className="mt-2">
                <a href="/docs" className="text-blue-600 hover:underline">Documentation</a>
                {' • '}
                <a href="/examples" className="text-blue-600 hover:underline">Examples</a>
                {' • '}
                <a href="https://github.com" className="text-blue-600 hover:underline">GitHub</a>
              </p>
            </div>
          </div>
        </footer>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

// Disable SSR for this page
export async function getServerSideProps() {
  return { props: {} };
}
