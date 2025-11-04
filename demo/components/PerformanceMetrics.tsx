// Performance Metrics Component
// Displays Core Web Vitals and performance statistics

'use client';

import React from 'react';

interface Props {
  metrics: {
    apiLatency: number;
    cacheHitRate: number;
    bundleSize: number;
    loadTime: number;
    ttfb: number;
    fcp: number;
    lcp: number;
    cls: number;
    fid: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

export function PerformanceMetrics({ metrics }: Props) {
  // Calculate Core Web Vitals score
  const getCoreWebVitalsScore = () => {
    let score = 0;
    
    // LCP (Largest Contentful Paint)
    if (metrics.lcp < 2500) score += 33;
    else if (metrics.lcp < 4000) score += 17;
    
    // FID (First Input Delay)
    if (metrics.fid < 100) score += 33;
    else if (metrics.fid < 300) score += 17;
    
    // CLS (Cumulative Layout Shift)
    if (metrics.cls < 0.1) score += 34;
    else if (metrics.cls < 0.25) score += 17;
    
    return score;
  };

  const score = getCoreWebVitalsScore();
  const scoreColor = score >= 80 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const scoreGradient = score >= 80 
    ? 'conic-gradient(#10B981 0% ' + score + '%, #E5E7EB ' + score + '% 100%)'
    : score >= 50
    ? 'conic-gradient(#F59E0B 0% ' + score + '%, #E5E7EB ' + score + '% 100%)'
    : 'conic-gradient(#EF4444 0% ' + score + '%, #E5E7EB ' + score + '% 100%)';

  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="text-2xl mr-2">⚡</span>
        Performance
      </h3>

      {/* Core Web Vitals Score Circle */}
      <div className="flex justify-center mb-6">
        <div 
          className="relative w-32 h-32 rounded-full flex items-center justify-center"
          style={{ background: scoreGradient }}
        >
          <div className="w-28 h-28 rounded-full bg-white flex flex-col items-center justify-center">
            <span className={`text-4xl font-bold ${scoreColor}`}>{score}</span>
            <span className="text-xs text-gray-500 font-medium">Score</span>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="space-y-2 mb-4">
        <MetricRow 
          label="API Latency" 
          value={`${metrics.apiLatency}ms`} 
          good={metrics.apiLatency < 100} 
        />
        <MetricRow 
          label="Cache Hit Rate" 
          value={`${metrics.cacheHitRate}%`} 
          good={metrics.cacheHitRate > 80} 
        />
        <MetricRow 
          label="Bundle Size" 
          value={`${metrics.bundleSize || 47}KB`} 
          good={(metrics.bundleSize || 47) < 100} 
        />
        <MetricRow 
          label="Page Load" 
          value={`${metrics.loadTime}ms`} 
          good={metrics.loadTime < 2000} 
        />
      </div>

      {/* Core Web Vitals */}
      <div className="border-t border-gray-200 pt-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">Core Web Vitals</div>
        <div className="space-y-2">
          <WebVital 
            label="TTFB" 
            value={metrics.ttfb} 
            unit="ms" 
            thresholds={[800, 1800]} 
            tooltip="Time to First Byte"
          />
          <WebVital 
            label="FCP" 
            value={metrics.fcp} 
            unit="ms" 
            thresholds={[1800, 3000]} 
            tooltip="First Contentful Paint"
          />
          <WebVital 
            label="LCP" 
            value={metrics.lcp} 
            unit="ms" 
            thresholds={[2500, 4000]} 
            tooltip="Largest Contentful Paint"
          />
          <WebVital 
            label="CLS" 
            value={metrics.cls} 
            unit="" 
            thresholds={[0.1, 0.25]} 
            tooltip="Cumulative Layout Shift"
            decimals={3}
          />
          <WebVital 
            label="FID" 
            value={metrics.fid} 
            unit="ms" 
            thresholds={[100, 300]} 
            tooltip="First Input Delay"
          />
        </div>
      </div>

      {/* Percentiles */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <div className="text-sm font-semibold text-gray-700 mb-2">Latency Percentiles</div>
        <div className="grid grid-cols-3 gap-2">
          <PercentileStat label="P50" value={metrics.p50} />
          <PercentileStat label="P95" value={metrics.p95} />
          <PercentileStat label="P99" value={metrics.p99} />
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <div className="flex items-center space-x-2">
        <span className={`text-sm font-semibold ${good ? 'text-green-600' : 'text-yellow-600'}`}>
          {value}
        </span>
        <span className="text-base">
          {good ? '✓' : '⚠️'}
        </span>
      </div>
    </div>
  );
}

function WebVital({ 
  label, 
  value, 
  unit, 
  thresholds, 
  tooltip,
  decimals = 0
}: { 
  label: string; 
  value: number; 
  unit: string; 
  thresholds: [number, number];
  tooltip: string;
  decimals?: number;
}) {
  const [good, medium] = thresholds;
  const status = value < good ? 'good' : value < medium ? 'medium' : 'poor';
  
  const statusConfig = {
    good: { color: 'text-green-600', bg: 'bg-green-100', icon: '✓' },
    medium: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '⚠️' },
    poor: { color: 'text-red-600', bg: 'bg-red-100', icon: '✗' }
  };

  const config = statusConfig[status];
  const displayValue = decimals > 0 ? value.toFixed(decimals) : Math.round(value);

  return (
    <div className="flex items-center justify-between group" title={tooltip}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="flex items-center space-x-1">
        <span className={`text-xs font-semibold ${config.color}`}>
          {displayValue}{unit}
        </span>
        <span className={`text-xs w-5 h-5 rounded-full ${config.bg} flex items-center justify-center`}>
          {config.icon}
        </span>
      </div>
    </div>
  );
}

function PercentileStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      <div className="text-lg font-bold text-indigo-700">{Math.round(value)}</div>
      <div className="text-xs text-gray-500">ms</div>
    </div>
  );
}
