// Rendering Mode Indicator Component
// Shows current rendering mode (SSR/CSR/SSG/ISR) with animation

'use client';

import React from 'react';

interface Props {
  mode: 'SSR' | 'CSR' | 'SSG' | 'ISR';
  counts: {
    ssr: number;
    csr: number;
    ssg: number;
    isr: number;
  };
}

const modeConfig = {
  SSR: {
    color: 'from-green-400 to-emerald-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    icon: '🖥️',
    title: 'Server-Side Rendering',
    description: 'Page rendered on server for optimal SEO and performance'
  },
  CSR: {
    color: 'from-blue-400 to-cyan-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    icon: '⚡',
    title: 'Client-Side Rendering',
    description: 'Page rendered in browser for rich interactions'
  },
  SSG: {
    color: 'from-purple-400 to-violet-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    icon: '📄',
    title: 'Static Site Generation',
    description: 'Pre-rendered at build time for maximum speed'
  },
  ISR: {
    color: 'from-orange-400 to-amber-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    icon: '🔄',
    title: 'Incremental Static Regeneration',
    description: 'Static pages that revalidate on demand'
  }
};

export function RenderingModeIndicator({ mode, counts }: Props) {
  const config = modeConfig[mode];

  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="text-2xl mr-2">🎨</span>
        Rendering Mode
      </h3>

      {/* Current Mode Badge */}
      <div className={`relative mb-6 p-6 rounded-xl bg-gradient-to-r ${config.color} overflow-hidden`}>
        {/* Animated background */}
        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
        
        <div className="relative z-10 text-center">
          <div className="text-4xl mb-2">{config.icon}</div>
          <div className="text-3xl font-bold text-white mb-1">{mode}</div>
          <div className="text-white/90 text-sm font-medium">{config.title}</div>
        </div>

        {/* Pulse animation */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 animate-ping opacity-20 bg-white rounded-xl"></div>
        </div>
      </div>

      {/* Description */}
      <div className={`${config.bgColor} rounded-lg p-3 mb-4`}>
        <p className={`text-sm ${config.textColor}`}>
          {config.description}
        </p>
      </div>

      {/* Mode Statistics */}
      <div className="grid grid-cols-2 gap-2">
        <ModeStat label="SSR" count={counts.ssr} active={mode === 'SSR'} />
        <ModeStat label="CSR" count={counts.csr} active={mode === 'CSR'} />
        <ModeStat label="SSG" count={counts.ssg} active={mode === 'SSG'} />
        <ModeStat label="ISR" count={counts.isr} active={mode === 'ISR'} />
      </div>

      {/* Live Indicator */}
      <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-gray-500">
        <div className={`w-2 h-2 rounded-full ${config.color} bg-gradient-to-r animate-pulse`}></div>
        <span>Live</span>
      </div>
    </div>
  );
}

function ModeStat({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <div className={`
      p-3 rounded-lg border-2 transition-all duration-200
      ${active 
        ? 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-300 shadow-md' 
        : 'bg-gray-50 border-gray-200'
      }
    `}>
      <div className={`text-xs font-semibold ${active ? 'text-purple-600' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-xl font-bold ${active ? 'text-purple-900' : 'text-gray-700'}`}>
        {count}
      </div>
    </div>
  );
}
