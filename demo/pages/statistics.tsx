/**
 * Statistics Dashboard Page
 * Dedicated page for live statistics monitoring
 */

'use client';

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useStatisticsCollector } from '../hooks/useStatisticsCollector';

// Dynamically import to avoid SSR issues
const LiveStatsDashboard = dynamic(() => import('../components/LiveStatsDashboard').then(mod => ({ default: mod.LiveStatsDashboard })), { ssr: false });

export default function StatisticsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading statistics...</p>
        </div>
      </div>
    );
  }

  return <StatisticsContent />;
}

function StatisticsContent() {
  const { stats } = useStatisticsCollector();

  return (
    <>
      <Head>
        <title>Live Statistics - Minder Data Provider</title>
        <meta name="description" content="Real-time performance monitoring and statistics" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <header className="bg-black bg-opacity-30 backdrop-blur-md border-b border-white border-opacity-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  href="/"
                  className="text-white hover:text-blue-300 transition-colors"
                >
                  ← Back to Home
                </Link>
                <div className="h-6 w-px bg-white bg-opacity-20" />
                <h1 className="text-2xl font-bold text-white">
                  📊 Live Statistics Dashboard
                </h1>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm text-green-300">Live Updates Active</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Dashboard */}
          <LiveStatsDashboard />

          {/* Additional Stats Grid */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Requests */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 border border-white border-opacity-20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Total Requests</h3>
                <span className="text-2xl">📡</span>
              </div>
              <p className="text-4xl font-bold text-white">
                {stats.network.totalRequests.toLocaleString()}
              </p>
              <p className="text-sm text-blue-300 mt-2">
                {stats.network.activeRequests} active
              </p>
            </div>

            {/* Cache Hit Rate */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 border border-white border-opacity-20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Cache Hit Rate</h3>
                <span className="text-2xl">⚡</span>
              </div>
              <p className="text-4xl font-bold text-white">
                {((stats.cache.hits / Math.max(stats.cache.hits + stats.cache.misses, 1)) * 100).toFixed(1)}%
              </p>
              <p className="text-sm text-green-300 mt-2">
                {stats.cache.hits.toLocaleString()} hits
              </p>
            </div>

            {/* Average Latency */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 border border-white border-opacity-20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Avg Latency</h3>
                <span className="text-2xl">⏱️</span>
              </div>
              <p className="text-4xl font-bold text-white">
                {stats.performance.p50.toFixed(0)}ms
              </p>
              <p className="text-sm text-yellow-300 mt-2">
                P95: {stats.performance.p95.toFixed(0)}ms
              </p>
            </div>

            {/* Error Rate */}
            <div className="bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 border border-white border-opacity-20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-white">Error Rate</h3>
                <span className="text-2xl">⚠️</span>
              </div>
              <p className="text-4xl font-bold text-white">
                {((stats.errors.total / Math.max(stats.network.totalRequests, 1)) * 100).toFixed(2)}%
              </p>
              <p className="text-sm text-red-300 mt-2">
                {stats.errors.total} total errors
              </p>
            </div>
          </div>

          {/* Performance Insights */}
          <div className="mt-8 bg-white bg-opacity-10 backdrop-blur-md rounded-lg p-6 border border-white border-opacity-20">
            <h2 className="text-xl font-bold text-white mb-4">
              🔍 Performance Insights
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Core Web Vitals */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Core Web Vitals</h3>
                <div className="space-y-3">
                  {[
                    { name: 'LCP', value: stats.performance.lcp, good: 2500, poor: 4000, unit: 'ms' },
                    { name: 'FID', value: stats.performance.fid, good: 100, poor: 300, unit: 'ms' },
                    { name: 'CLS', value: stats.performance.cls, good: 0.1, poor: 0.25, unit: '' },
                  ].map((metric) => {
                    const status =
                      metric.value <= metric.good
                        ? 'good'
                        : metric.value <= metric.poor
                        ? 'needs-improvement'
                        : 'poor';
                    
                    return (
                      <div key={metric.name} className="flex items-center justify-between">
                        <span className="text-white font-medium">{metric.name}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-mono">
                            {metric.value.toFixed(metric.unit === 'ms' ? 0 : 3)}
                            {metric.unit}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              status === 'good'
                                ? 'bg-green-500 text-white'
                                : status === 'needs-improvement'
                                ? 'bg-yellow-500 text-white'
                                : 'bg-red-500 text-white'
                            }`}
                          >
                            {status === 'good' ? '✓' : status === 'needs-improvement' ? '!' : '✗'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feature Usage */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Active Features</h3>
                <div className="space-y-2">
                  {Object.entries(stats.features).map(([feature, isActive]) => (
                    <div key={feature} className="flex items-center justify-between">
                      <span className="text-white capitalize">{feature}</span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isActive
                            ? 'bg-green-500 bg-opacity-30 text-green-300'
                            : 'bg-gray-500 bg-opacity-30 text-gray-300'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-8 flex items-center justify-center space-x-4">
            <Link
              href="/demo"
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              🎮 Try Interactive Demo
            </Link>
            <Link
              href="/docs"
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors font-medium"
            >
              📚 Read Documentation
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// Disable SSR for this page to avoid React Query issues
export async function getServerSideProps() {
  return { props: {} };
}
