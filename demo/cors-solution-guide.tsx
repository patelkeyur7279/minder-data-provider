import React from 'react';
import { MinderDataProvider, MultiEnvironmentConfig } from '../src/index.js';

// 🌍 STEP 1: Create Multi-Environment Config
const envConfig: MultiEnvironmentConfig = {
  defaultEnvironment: 'development',
  autoDetect: true,
  environments: {
    development: {
      name: 'Development',
      apiBaseUrl: 'https://jsonplaceholder.typicode.com', // External API
      cors: {
        enabled: true,                    // ✅ Enable CORS proxy
        proxy: '/api/minder-proxy',       // ✅ Proxy route
        credentials: true
      },
      debug: true
    }
  }
};

// 🎯 STEP 2: Use Environment Config (NOT regular config)
export default function App() {
  return (
    <MinderDataProvider config={envConfig}>  {/* ← Use envConfig, not regular config */}
      <YourApp />
    </MinderDataProvider>
  );
}