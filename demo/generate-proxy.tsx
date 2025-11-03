import React from 'react';
import { useProxy } from '../src/hooks/useEnvironment.js';

function ProxyGenerator() {
  const proxy = useProxy();
  
  const generateProxy = () => {
    // ✅ This generates the proxy code automatically
    const code = proxy.generateNextJSProxy();
    
    // Copy to clipboard
    navigator.clipboard.writeText(code);
    alert('✅ Proxy code copied! Create pages/api/minder-proxy/[...path].js');
  };
  
  return (
    <button onClick={generateProxy}>
      📋 Generate CORS Proxy
    </button>
  );
}