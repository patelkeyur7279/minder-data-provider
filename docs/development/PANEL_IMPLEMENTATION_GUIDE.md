# Quick Implementation Guide for Remaining Panels

This guide shows how to implement each of the 8 remaining demo panels. Each follows the same pattern established by the Platform and CRUD panels.

## 📋 Common Pattern

```tsx
import React, { useState, useEffect } from 'react';
import { useHookName } from '../../src/hooks/useHookName';

export function PanelName() {
  // 1. Get data from hooks
  const { data, loading, error } = useHookName();
  
  // 2. Local state for UI
  const [localState, setLocalState] = useState(initialValue);
  
  // 3. Event handlers
  const handleAction = async () => {
    // Do something
  };
  
  // 4. Render UI
  return (
    <div className="panel">
      <h2>Panel Title</h2>
      {/* Content */}
    </div>
  );
}
```

## 🔐 1. Auth Panel Implementation

**File:** `demo/panels/AuthPanel.tsx`

**Required Hooks:** `useAuth()` from `../../src/hooks/useAuth`

**Key Features:**
- Login form (email + password)
- Display user info when authenticated
- Show/hide JWT token
- Decode and display token payload
- Logout button

**Minimal Implementation:**
```tsx
import React, { useState } from 'react';
import { useAuth } from '../../src/hooks/useAuth';

export function AuthPanel() {
  const { login, logout, isAuthenticated, user, token } = useAuth();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password123');
  
  if (!isAuthenticated) {
    return (
      <div className="panel">
        <h2>🔐 Login</h2>
        <input value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button onClick={() => login(email, password)}>Login</button>
      </div>
    );
  }
  
  return (
    <div className="panel">
      <h2>Welcome {user?.email}</h2>
      <pre>{token}</pre>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## 🔌 2. WebSocket Panel Implementation

**File:** `demo/panels/WebSocketPanel.tsx`

**Required Hooks:** `useWebSocket()` from `../../src/hooks/useWebSocket`

**Key Features:**
- Connect/disconnect button
- Send message input
- Display received messages
- Connection status indicator

**Minimal Implementation:**
```tsx
import React, { useState } from 'react';
import { useWebSocket } from '../../src/hooks/useWebSocket';

export function WebSocketPanel() {
  const { connect, disconnect, send, messages, isConnected } = useWebSocket('wss://echo.websocket.org');
  const [message, setMessage] = useState('');
  
  return (
    <div className="panel">
      <h2>🔌 WebSocket</h2>
      <div>Status: {isConnected ? '✅ Connected' : '❌ Disconnected'}</div>
      <button onClick={isConnected ? disconnect : connect}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </button>
      <input value={message} onChange={e => setMessage(e.target.value)} />
      <button onClick={() => { send(message); setMessage(''); }}>Send</button>
      <div>
        {messages.map((msg, i) => (
          <div key={i}>{msg}</div>
        ))}
      </div>
    </div>
  );
}
```

## 📤 3. Upload Panel Implementation

**File:** `demo/panels/UploadPanel.tsx`

**Required Hooks:** `useUpload()` from `../../src/hooks/useUpload`

**Key Features:**
- Drag & drop zone
- File list with previews
- Progress bars
- Upload button

**Minimal Implementation:**
```tsx
import React, { useState } from 'react';
import { useUpload } from '../../src/hooks/useUpload';

export function UploadPanel() {
  const { upload, progress, uploading } = useUpload();
  const [files, setFiles] = useState<File[]>([]);
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFiles(Array.from(e.dataTransfer.files));
  };
  
  const handleUpload = async () => {
    for (const file of files) {
      await upload(file);
    }
  };
  
  return (
    <div className="panel">
      <h2>📤 Upload</h2>
      <div 
        onDrop={handleDrop} 
        onDragOver={e => e.preventDefault()}
        style={{ border: '2px dashed #ccc', padding: '2rem' }}
      >
        Drop files here
      </div>
      <div>
        {files.map((file, i) => (
          <div key={i}>{file.name} - {progress}%</div>
        ))}
      </div>
      <button onClick={handleUpload} disabled={uploading}>
        Upload
      </button>
    </div>
  );
}
```

## 💾 4. Cache Panel Implementation

**File:** `demo/panels/CachePanel.tsx`

**Required Hooks:** `useCache()` from `../../src/hooks/useCache`

**Key Features:**
- List all cached queries
- Show cache statistics
- Clear cache button
- Invalidate specific queries

**Minimal Implementation:**
```tsx
import React from 'react';
import { useCache } from '../../src/hooks/useCache';

export function CachePanel() {
  const { queries, clear, invalidate, stats } = useCache();
  
  return (
    <div className="panel">
      <h2>💾 Cache</h2>
      <div>Total Queries: {stats.total}</div>
      <div>Hit Rate: {stats.hitRate}%</div>
      <button onClick={clear}>Clear All</button>
      <div>
        {queries.map((query, i) => (
          <div key={i}>
            {query.key}
            <button onClick={() => invalidate(query.key)}>Invalidate</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 📴 5. Offline Panel Implementation

**File:** `demo/panels/OfflinePanel.tsx`

**Required Hooks:** `useOffline()` from `../../src/hooks/useOffline`

**Key Features:**
- Show offline queue
- Sync button
- Network status toggle (for testing)
- Request retry

**Minimal Implementation:**
```tsx
import React from 'react';
import { useOffline } from '../../src/hooks/useOffline';

export function OfflinePanel() {
  const { queue, sync, isOnline, setOnline } = useOffline();
  
  return (
    <div className="panel">
      <h2>📴 Offline</h2>
      <div>Status: {isOnline ? '🟢 Online' : '🔴 Offline'}</div>
      <button onClick={() => setOnline(!isOnline)}>
        Toggle Network
      </button>
      <div>Queue: {queue.length} requests</div>
      <button onClick={sync}>Sync Now</button>
      <div>
        {queue.map((req, i) => (
          <div key={i}>{req.method} {req.url}</div>
        ))}
      </div>
    </div>
  );
}
```

## 🔒 6. Security Panel Implementation

**File:** `demo/panels/SecurityPanel.tsx`

**Required Hooks:** `useSecurity()` from `../../src/hooks/useSecurity`

**Key Features:**
- XSS input demo
- Show sanitized vs unsanitized
- Display security headers
- CSRF token display

**Minimal Implementation:**
```tsx
import React, { useState } from 'react';
import { useSecurity } from '../../src/hooks/useSecurity';

export function SecurityPanel() {
  const { sanitize, headers, csrfToken } = useSecurity();
  const [input, setInput] = useState('<script>alert("XSS")</script>');
  
  return (
    <div className="panel">
      <h2>🔒 Security</h2>
      <h3>XSS Protection</h3>
      <input value={input} onChange={e => setInput(e.target.value)} />
      <div>Unsafe: {input}</div>
      <div>Safe: {sanitize(input)}</div>
      <h3>Headers</h3>
      <pre>{JSON.stringify(headers, null, 2)}</pre>
      <h3>CSRF Token</h3>
      <div>{csrfToken}</div>
    </div>
  );
}
```

## ⚡ 7. Performance Panel Implementation

**File:** `demo/panels/PerformancePanel.tsx`

**Required Hooks:** `usePerformance()` from `../../src/hooks/usePerformance`

**Key Features:**
- Bundle size breakdown
- API call metrics
- Render performance
- Optimization tips

**Minimal Implementation:**
```tsx
import React from 'react';
import { usePerformance } from '../../src/hooks/usePerformance';

export function PerformancePanel() {
  const { bundles, apiCalls, renderTime } = usePerformance();
  
  return (
    <div className="panel">
      <h2>⚡ Performance</h2>
      <h3>Bundle Sizes</h3>
      {bundles.map((bundle, i) => (
        <div key={i}>{bundle.name}: {bundle.size}KB</div>
      ))}
      <h3>API Metrics</h3>
      <div>Average Response: {apiCalls.avgTime}ms</div>
      <h3>Render</h3>
      <div>Last Render: {renderTime}ms</div>
    </div>
  );
}
```

## ⚙️ 8. Config Panel Implementation

**File:** `demo/panels/ConfigPanel.tsx`

**Required Hooks:** `useConfig()` from `../../src/hooks/useConfig`

**Key Features:**
- Configuration form
- Live updates
- Environment switcher
- Feature toggles

**Minimal Implementation:**
```tsx
import React from 'react';
import { useConfig } from '../../src/hooks/useConfig';

export function ConfigPanel() {
  const { config, updateConfig, environment, setEnvironment } = useConfig();
  
  return (
    <div className="panel">
      <h2>⚙️ Configuration</h2>
      <h3>Environment</h3>
      <select value={environment} onChange={e => setEnvironment(e.target.value)}>
        <option value="development">Development</option>
        <option value="staging">Staging</option>
        <option value="production">Production</option>
      </select>
      <h3>API Base URL</h3>
      <input 
        value={config.baseURL} 
        onChange={e => updateConfig({ baseURL: e.target.value })}
      />
      <h3>Feature Toggles</h3>
      <label>
        <input 
          type="checkbox" 
          checked={config.features.cache}
          onChange={e => updateConfig({ features: { cache: e.target.checked }})}
        />
        Cache Enabled
      </label>
    </div>
  );
}
```

## 🎨 Styling

All panels automatically inherit styles from `globals.css`. Key classes:

- `.panel` - Main container
- `.card` - Card component
- `.btn` - Button
- `.btn-primary` - Primary button
- `.stat-card` - Statistic card
- `.alert` - Alert message

## 📝 Testing Checklist

For each panel:

- [ ] Component renders without errors
- [ ] Hook integration works correctly
- [ ] UI interactions trigger appropriate actions
- [ ] Loading states display properly
- [ ] Error states handled gracefully
- [ ] Responsive on mobile
- [ ] Accessible (keyboard navigation, ARIA labels)

## 🚀 Quick Start

1. Choose a panel from the list above
2. Open the corresponding file in `demo/panels/`
3. Replace stub code with minimal implementation
4. Test in browser at http://localhost:5100/comprehensive
5. Add features incrementally
6. Style using existing CSS classes
7. Move to next panel

## 💡 Pro Tips

- **Reuse patterns** from Platform and CRUD panels
- **Test frequently** in the browser
- **Use DevTools** to debug hook state
- **Check console** for errors
- **Mobile test** using browser dev tools
- **TypeScript** will help catch errors early

---

**Estimated Time Per Panel:** 30-60 minutes

**Total Remaining Work:** 4-8 hours for all 8 panels

**Priority Order:**
1. Auth (most commonly used)
2. Cache (essential for performance)
3. Upload (visible feature)
4. WebSocket (real-time demo)
5. Offline (important capability)
6. Security (best practices)
7. Performance (metrics/charts need data)
8. Config (administrative feature)
