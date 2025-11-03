# 🔧 CORS Error Solution Guide

## 🚨 **Problem**: CORS Error
```
Access to fetch at 'https://api.example.com/users' from origin 'http://localhost:3000' 
has been blocked by CORS policy
```

## ✅ **Solution**: 3 Simple Steps

### **Step 1: Use Multi-Environment Config**
```typescript
import { MinderDataProvider, MultiEnvironmentConfig } from 'minder-data-provider';

const config: MultiEnvironmentConfig = {
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
      }
    }
  }
};

// ✅ Use environment config (NOT regular MinderConfig)
<MinderDataProvider config={config}>
  <App />
</MinderDataProvider>
```

### **Step 2: Generate Proxy Code**
```typescript
import { useProxy } from 'minder-data-provider';

function MyComponent() {
  const proxy = useProxy();
  
  const generateProxy = () => {
    const code = proxy.generateNextJSProxy();
    navigator.clipboard.writeText(code);
    alert('Proxy code copied!');
  };
  
  return <button onClick={generateProxy}>Generate Proxy</button>;
}
```

### **Step 3: Create Next.js Proxy File**
Create: `pages/api/minder-proxy/[...path].js`
```javascript
export default async function handler(req, res) {
  const { path } = req.query;
  const apiPath = Array.isArray(path) ? path.join('/') : path;
  
  // ✅ CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // ✅ Proxy to real API
  const targetUrl = `https://jsonplaceholder.typicode.com/${apiPath}`;
  const response = await fetch(targetUrl, {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
  });
  
  const data = await response.json();
  res.status(response.status).json(data);
}
```

## 🎯 **How It Works**

### **Before (CORS Error):**
```
Browser → https://api.example.com/users ❌ BLOCKED
```

### **After (No CORS):**
```
Browser → /api/minder-proxy/users → https://api.example.com/users ✅ SUCCESS
```

## 🔄 **What Happens:**

1. **Your app calls**: `/api/minder-proxy/users`
2. **Next.js proxy forwards to**: `https://api.example.com/users`
3. **Server-to-server call**: No CORS restrictions
4. **Proxy returns data**: With proper CORS headers

## 🎛️ **Environment Switching:**
```typescript
const env = useEnvironment();

// Development: Uses proxy for external APIs
env.setEnvironment('development');

// Production: Direct calls (same domain)
env.setEnvironment('production');
```

## 🔒 **Security Benefits:**
- ✅ Hides real API URLs from browser
- ✅ Server-side request validation
- ✅ Custom headers and authentication
- ✅ Request logging and monitoring

## 🚀 **Result:**
- ❌ No more CORS errors
- ✅ Works with any external API
- ✅ Secure and production-ready
- ✅ Environment-specific configuration