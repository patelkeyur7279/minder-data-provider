// Feature Toggles Component
// Shows status of all Minder features

'use client';

import React from 'react';

interface Props {
  features: {
    offline: boolean;
    websocket: boolean;
    auth: boolean;
    upload: boolean;
    redux: boolean;
    ssr: boolean;
    devtools: boolean;
    plugins: string[];
  };
}

export function FeatureToggles({ features }: Props) {
  return (
    <div className="h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <span className="text-2xl mr-2">🎚️</span>
        Feature Status
      </h3>

      <div className="space-y-2">
        <FeatureToggle label="Authentication" enabled={features.auth} icon="🔐" />
        <FeatureToggle label="Caching" enabled={true} icon="💾" />
        <FeatureToggle label="WebSocket" enabled={features.websocket} icon="🔌" />
        <FeatureToggle label="Offline Support" enabled={features.offline} icon="📴" />
        <FeatureToggle label="File Upload" enabled={features.upload} icon="📤" />
        <FeatureToggle label="Redux" enabled={features.redux} icon="🔄" />
        <FeatureToggle label="SSR" enabled={features.ssr} icon="🖥️" />
        <FeatureToggle label="DevTools" enabled={features.devtools} icon="🛠️" />
      </div>

      {features.plugins && features.plugins.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm font-semibold text-gray-700 mb-2">
            Active Plugins ({features.plugins.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {features.plugins.map((plugin, idx) => (
              <span 
                key={idx}
                className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium"
              >
                {plugin}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureToggle({ label, enabled, icon }: { label: string; enabled: boolean; icon: string }) {
  return (
    <div className={`
      flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-200
      ${enabled 
        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
        : 'bg-gray-50 border-gray-200 opacity-60'
      }
    `}>
      <div className="flex items-center space-x-2">
        <span className="text-xl">{icon}</span>
        <span className={`text-sm font-medium ${enabled ? 'text-gray-800' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <div className={`
        w-10 h-5 rounded-full transition-all duration-200 flex items-center
        ${enabled ? 'bg-green-500' : 'bg-gray-300'}
      `}>
        <div className={`
          w-4 h-4 rounded-full bg-white shadow transition-all duration-200
          ${enabled ? 'ml-5' : 'ml-0.5'}
        `} />
      </div>
    </div>
  );
}
