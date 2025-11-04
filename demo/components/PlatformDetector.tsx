// Platform Detector Component
// Displays platform and device information

'use client';

import React from 'react';

interface Props {
  platform: {
    type: 'web' | 'nextjs' | 'native' | 'expo' | 'electron' | 'node';
    browser: string;
    browserVersion: string;
    os: string;
    device: 'mobile' | 'tablet' | 'desktop';
    screen: { width: number; height: number };
    orientation: 'portrait' | 'landscape';
    connection: {
      type: string;
      effectiveType: string;
      downlink: number;
      rtt: number;
    };
  };
}

const platformIcons: Record<string, string> = {
  web: '🌐',
  nextjs: '▲',
  native: '📱',
  expo: '⚛️',
  electron: '💻',
  node: '🟢'
};

const deviceIcons: Record<string, string> = {
  mobile: '📱',
  tablet: '📲',
  desktop: '💻'
};

export function PlatformDetector({ platform }: Props) {
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="text-2xl mr-2">💻</span>
        Platform Info
      </h3>

      {/* Platform Type */}
      <div className="mb-4 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-600 mb-1">Platform</div>
            <div className="text-xl font-bold text-indigo-700 capitalize">{platform.type}</div>
          </div>
          <div className="text-4xl">{platformIcons[platform.type]}</div>
        </div>
      </div>

      {/* Device Info */}
      <div className="space-y-3 mb-4">
        <InfoRow 
          label="Browser" 
          value={`${platform.browser} ${platform.browserVersion}`} 
          icon="🌐"
        />
        <InfoRow 
          label="OS" 
          value={platform.os} 
          icon="💿"
        />
        <InfoRow 
          label="Device" 
          value={platform.device} 
          icon={deviceIcons[platform.device]}
        />
        <InfoRow 
          label="Screen" 
          value={`${platform.screen.width}×${platform.screen.height}`} 
          icon="📐"
        />
        <InfoRow 
          label="Orientation" 
          value={platform.orientation} 
          icon={platform.orientation === 'landscape' ? '↔️' : '↕️'}
        />
      </div>

      {/* Connection Info */}
      {platform.connection.effectiveType && (
        <div className="pt-4 border-t border-gray-200">
          <div className="text-sm font-semibold text-gray-700 mb-2">Connection</div>
          <div className="grid grid-cols-2 gap-2">
            <ConnectionStat label="Type" value={platform.connection.effectiveType.toUpperCase()} />
            <ConnectionStat label="Speed" value={`${platform.connection.downlink} Mbps`} />
            <ConnectionStat label="Latency" value={`${platform.connection.rtt} ms`} className="col-span-2" />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
      <div className="flex items-center space-x-2">
        <span>{icon}</span>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <span className="text-sm font-semibold text-gray-800 capitalize">{value}</span>
    </div>
  );
}

function ConnectionStat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-gradient-to-br from-blue-50 to-cyan-50 p-2 rounded-lg text-center ${className}`}>
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-sm font-bold text-blue-700">{value}</div>
    </div>
  );
}
