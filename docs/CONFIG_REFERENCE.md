# Configuration Examples & Reference

## Quick Overview

The **minder-data-provider** has **4 presets** + **unlimited custom options**. Start with a preset, customize as needed.

---

## 📊 4 Configuration Presets

| Preset | Size | Use Case | Auth | Cache | WebSocket | Features |
|--------|------|----------|------|-------|-----------|----------|
| **Minimal** | 45KB | Prototypes, MVPs | ❌ | Memory | ❌ | CRUD only |
| **Standard** | 90KB | Most apps ⭐ | ✅ | Hybrid | ❌ | CRUD + Auth + Security |
| **Advanced** | 120KB | Large apps | ✅ | Persistent | ❌ | Standard + Offline + SSR |
| **Enterprise** | 150KB | Real-time, enterprise | ✅ | Persistent | ✅ | Everything + Monitoring |

---

## 🔧 How to Use

### Option 1: Use a Preset (Easiest)
```typescript
const config = createMinderConfig({
  preset: 'standard',  // 'minimal' | 'standard' | 'advanced' | 'enterprise'
  apiUrl: 'https://api.example.com',
  routes: { users: '/users' }
});
```

### Option 2: Customize a Preset
```typescript
const config = createMinderConfig({
  preset: 'standard',
  apiUrl: 'https://api.example.com',
  auth: { storage: 'cookie' },      // Override preset
  cache: { staleTime: 30 * 60 * 1000 },
  routes: { users: '/users' }
});
```

### Option 3: Manual Configuration
See `docs/CONFIG_GUIDE.md` for full manual config options.

---

## 🎯 Why & How Each Option Works

### **apiUrl**
**Why:** Base endpoint for all API calls  
**How:** Prepended to all route URLs  
```typescript
apiUrl: 'https://api.example.com'
// GET /users → https://api.example.com/users
```

### **routes**
**Why:** Define API endpoints  
**How:** Auto-generates CRUD operations from route strings  
```typescript
routes: { users: '/users' }
// Automatically creates:
// - users: GET /users
// - createUsers: POST /users
// - updateUsers: PUT /users/:id
// - deleteUsers: DELETE /users/:id
```

### **auth**
**Why:** Handle user authentication  
**How:** Stores JWT token in cookie/localStorage  
```typescript
auth: { storage: 'cookie' }  // Recommended (XSS protection)
// - Auto-refreshes token before expiry
// - Handles login/logout
// - Encrypts sensitive data
```

### **cache**
**Why:** Reduce server requests  
**How:** Stores responses locally  
```typescript
cache: { staleTime: 15 * 60 * 1000 }  // 15 minutes
// - Returns cached if fresh
// - Auto-refetch if stale
// - Persists across browser refresh
```

### **websocket**
**Why:** Real-time updates  
**How:** Maintains persistent connection  
```typescript
websocket: 'wss://api.example.com/ws'
// - Auto-reconnect if disconnected
// - Send/receive live data
// - 30-second heartbeat
```

### **security**
**Why:** Protect user data  
**How:** Multiple layers of protection  
```typescript
// Includes:
// - CSRF protection
// - Input sanitization
// - Rate limiting
// - Secure headers
// - Encryption
```

### **performance**
**Why:** Optimize speed & responsiveness  
**How:** Batching, deduplication, compression  
```typescript
// Includes:
// - Request batching (50ms window)
// - Deduplication (same request = 1 call)
// - Compression
// - Auto-retry (3 times)
```

### **debug**
**Why:** Troubleshoot issues  
**How:** Log network activity & performance  
```typescript
debug: {
  enabled: process.env.NODE_ENV === 'development',
  logLevel: 'info',     // 'error' | 'warn' | 'info' | 'debug'
  networkLogs: true,    // Log all requests/responses
  performance: true     // Log timing data
}
```

---

## 📋 Complete Option Reference

### Core Options
```typescript
{
  apiUrl: string,              // Required: Base API URL
  preset: 'standard',          // Optional: Config preset
  routes: { [key]: string },   // API endpoints
}
```

### Authentication (auth)
```typescript
{
  storage: 'cookie',           // 'cookie' | 'localStorage' | 'sessionStorage' | 'memory'
  tokenKey: 'accessToken',     // Key to store token
  refreshUrl: '/auth/refresh', // Endpoint to refresh token
  tokenRefreshThreshold: 5min, // Refresh before expiry
}
```

### Caching (cache)
```typescript
{
  staleTime: 15 * 60 * 1000,   // How long cached data is fresh (ms)
  type: 'hybrid',              // 'memory' | 'hybrid' | 'persistent'
  maxSize: 200,                // Max items to cache
  refetchOnWindowFocus: true,  // Refetch when tab focused
  refetchOnReconnect: true,    // Refetch when back online
}
```

### Security (security)
```typescript
{
  sanitization: true,          // Clean HTML output
  csrfProtection: true,        // CSRF token handling
  inputValidation: true,       // Validate input
  encryption: false,           // E2E encryption (enterprise only)
  rateLimiting: {
    requests: 100,             // Max requests
    window: 60000,             // Time window (ms)
  }
}
```

### Performance (performance)
```typescript
{
  deduplication: true,         // Dedupe identical requests
  batching: true,              // Batch requests
  batchDelay: 50,              // Batch window (ms)
  retries: 3,                  // Retry failed requests
  retryDelay: 1000,            // Delay between retries
  timeout: 30000,              // Request timeout (ms)
  compression: true,           // Enable compression
  lazyLoading: true,           // Lazy load features
}
```

### WebSocket (websocket)
```typescript
{
  url: 'wss://...',            // WebSocket URL
  reconnect: true,             // Auto-reconnect
  heartbeat: 30000,            // Heartbeat interval (ms)
  maxReconnectAttempts: 5,     // Max retries
}
```

### Server-Side Rendering (ssr)
```typescript
{
  enabled: false,              // Enable SSR support
  hydrate: true,               // Hydrate on client
}
```

### Debug (debug)
```typescript
{
  enabled: isDev,              // Enable debugging
  logLevel: 'info',            // 'error' | 'warn' | 'info' | 'debug'
  performance: true,           // Log performance metrics
  devTools: true,              // Enable dev tools
  networkLogs: true,           // Log network activity
}
```

---

## 💡 Common Patterns

### Simple CRUD App
```typescript
createMinderConfig({
  preset: 'minimal',
  apiUrl: 'https://api.example.com',
  routes: { items: '/items' }
})
```

### App with Auth
```typescript
createMinderConfig({
  preset: 'standard',
  apiUrl: 'https://api.example.com',
  auth: { storage: 'cookie' },
  routes: { users: '/users' }
})
```

### Offline-First App
```typescript
createMinderConfig({
  preset: 'advanced',
  apiUrl: 'https://api.example.com',
  cache: { type: 'persistent' },
  routes: { items: '/items' }
})
```

### Real-Time App
```typescript
createMinderConfig({
  preset: 'enterprise',
  apiUrl: 'https://api.example.com',
  websocket: 'wss://api.example.com/ws',
  routes: { messages: '/messages' }
})
```

---

## ✅ Total Configuration Options

- **4 Presets** (minimal, standard, advanced, enterprise)
- **15+ Root Options** (apiUrl, routes, preset, etc.)
- **Authentication**: 4 options
- **Caching**: 5+ options
- **Security**: 5+ options
- **Performance**: 8+ options
- **WebSocket**: 4 options
- **Debug**: 5 options

**Total: 50+ configuration options** - But 90% of apps need only 3-5!

---

## 📖 Full Documentation

See **docs/CONFIG_GUIDE.md** for:
- ✅ Complete option reference
- ✅ All 4 preset details
- ✅ Manual configuration guide
- ✅ Platform-specific setup
- ✅ Real-world examples

---

## 🚀 Example Config Files

Located in `docs/examples/`:

| File | Purpose |
|------|---------|
| `config.minimal.ts` | Minimal preset example |
| `config.standard.ts` | Standard preset example |
| `config.advanced.ts` | Advanced preset example |
| `config.enterprise.ts` | Enterprise preset example |
| `config.custom.ts` | Custom configurations |
| `config.platforms.ts` | Platform-specific setups |

