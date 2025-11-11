# 📘 Configuration Examples - Simple to Enterprise

Complete examples showing how to configure Minder Data Provider for different use cases, from prototypes to enterprise applications.

---

## Table of Contents

1. [Simple Setup (Prototype/MVP)](#1-simple-setup-prototypemvp)
2. [Standard Setup (Startup/SaaS)](#2-standard-setup-startupsaas)
3. [Advanced Setup (Scale-up)](#3-advanced-setup-scale-up)
4. [Enterprise Setup (Production-grade)](#4-enterprise-setup-production-grade)
5. [Platform-Specific Examples](#5-platform-specific-examples)

---

## 1. Simple Setup (Prototype/MVP)

**Use Case:** Quick prototypes, MVPs, learning, small apps (<1000 users)

**Features:** Basic CRUD only

**Bundle Size:** ~48 KB

```typescript
// config/minder.ts
import { createMinderConfig } from "minder-data-provider/config";

export const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: {
    users: "/users",
    posts: "/posts",
    comments: "/comments",
  },
});

// App.tsx
import { MinderDataProvider } from "minder-data-provider";
import { config } from "./config/minder";

export default function App({ children }) {
  return <MinderDataProvider config={config}>{children}</MinderDataProvider>;
}

// components/UserList.tsx
import { useMinder } from "minder-data-provider";

export function UserList() {
  const { data: users, loading, operations } = useMinder("users");

  if (loading.fetch) return <div>Loading...</div>;

  return (
    <div>
      <button
        onClick={() =>
          operations.create({ name: "John Doe", email: "john@example.com" })
        }>
        Add User
      </button>

      {users.map((user) => (
        <div key={user.id}>
          {user.name} - {user.email}
          <button
            onClick={() =>
              operations.update(user.id, { name: user.name + " (Updated)" })
            }>
            Update
          </button>
          <button onClick={() => operations.delete(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

**What you get:**

- ✅ Full CRUD operations
- ✅ Automatic caching
- ✅ Loading states
- ✅ Error handling
- ✅ Optimistic updates
- ✅ Type safety

---

## 2. Standard Setup (Startup/SaaS)

**Use Case:** Growing startups, SaaS products, production apps (<100K users)

**Features:** CRUD + Authentication + Caching

**Bundle Size:** ~145 KB

```typescript
// config/minder.ts
import { createMinderConfig } from "minder-data-provider/config";

export const config = createMinderConfig({
  apiUrl: "https://api.example.com",

  routes: {
    users: "/users",
    posts: "/posts",
    products: "/products",
    orders: "/orders",
  },

  // Enable authentication
  auth: {
    endpoints: {
      login: "/auth/login",
      logout: "/auth/logout",
      refresh: "/auth/refresh",
    },
    storage: "cookie", // Secure httpOnly cookies
    refreshBefore: 300, // Refresh 5 minutes before expiry
  },

  // Enable smart caching
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    strategy: "stale-while-revalidate",
  },

  // CORS handling
  cors: {
    enabled: true,
    credentials: true,
  },

  // Performance
  performance: {
    deduplication: true,
    retries: 3,
    timeout: 30000,
  },
});

// App.tsx with authentication
import { MinderDataProvider } from "minder-data-provider";
import { config } from "./config/minder";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  const { auth } = useMinder("users");

  if (!auth.isAuthenticated()) {
    return <LoginPage />;
  }

  return (
    <MinderDataProvider config={config}>
      <Dashboard />
    </MinderDataProvider>
  );
}

// pages/LoginPage.tsx
import { useMinder } from "minder-data-provider";

export function LoginPage() {
  const { auth } = useMinder("users");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      await auth.login({ email, password });
      // Redirects automatically after successful login
    } catch (error) {
      alert("Login failed: " + error.message);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <input
        type='email'
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder='Email'
      />
      <input
        type='password'
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder='Password'
      />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}

// pages/Dashboard.tsx
import { useMinder } from "minder-data-provider";

export function Dashboard() {
  const { data: products, cache } = useMinder("products");
  const { auth } = useMinder("users");

  const currentUser = auth.getCurrentUser();

  // Check cache stats
  console.log("Cache hit rate:", cache.getStats().hitRate);

  return (
    <div>
      <h1>Welcome, {currentUser?.name}!</h1>
      <button onClick={() => auth.logout()}>Logout</button>

      <h2>Products ({products.length})</h2>
      {products.map((product) => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  );
}
```

**What you get additionally:**

- ✅ JWT authentication with auto-refresh
- ✅ Secure token storage (httpOnly cookies)
- ✅ Multi-level caching (memory + storage)
- ✅ Cache invalidation strategies
- ✅ Request deduplication
- ✅ CORS handling

---

## 3. Advanced Setup (Scale-up)

**Use Case:** Scale-ups, high-traffic apps, real-time features (<10M users)

**Features:** Everything + WebSocket + File Upload + Debug Tools

**Bundle Size:** ~195 KB

```typescript
// config/minder.ts
import { createMinderConfig } from "minder-data-provider/config";

export const config = createMinderConfig({
  apiUrl: "https://api.example.com",

  routes: {
    users: "/users",
    posts: "/posts",
    messages: "/messages",
    files: "/files",
    upload: "/upload",
  },

  // Authentication
  auth: {
    endpoints: {
      login: "/auth/login",
      logout: "/auth/logout",
      refresh: "/auth/refresh",
    },
    storage: "cookie",
    refreshBefore: 300,
  },

  // Advanced caching
  cache: {
    enabled: true,
    memory: {
      ttl: 300000,
      max: 1000,
    },
    storage: {
      ttl: 3600000,
      max: 10000,
    },
    strategy: "stale-while-revalidate",
  },

  // WebSocket for real-time
  websocket: {
    url: "wss://ws.example.com",
    reconnect: true,
    heartbeat: 30000, // 30 seconds
  },

  // File upload
  upload: {
    endpoint: "/upload",
    maxSize: 10485760, // 10MB
    chunked: true,
  },

  // CORS
  cors: {
    enabled: true,
    credentials: true,
    origin: ["https://app.example.com", "https://admin.example.com"],
  },

  // Performance
  performance: {
    deduplication: true,
    compression: true,
    retries: 3,
    timeout: 30000,
    lazyLoading: true,
  },

  // Security
  security: {
    sanitization: true,
    csrfProtection: true,
    rateLimiting: {
      requests: 100,
      window: 60000,
    },
  },

  // Debug in development
  debug: {
    enabled: process.env.NODE_ENV === "development",
    logLevel: "info",
    performance: true,
    networkLogs: true,
  },
});

// Usage: Real-time chat with WebSocket
import { useMinder } from "minder-data-provider";

export function ChatRoom() {
  const { websocket } = useMinder("messages");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Connect to WebSocket
    websocket.connect();

    // Subscribe to new messages
    const unsubscribe = websocket.subscribe("new-message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Cleanup
    return () => {
      unsubscribe();
      websocket.disconnect();
    };
  }, []);

  const sendMessage = (text) => {
    websocket.send("chat-message", { text });
  };

  return (
    <div>
      <h2>Chat Room</h2>
      <div>
        {messages.map((msg, index) => (
          <div key={index}>
            {msg.user}: {msg.text}
          </div>
        ))}
      </div>
      <input
        type='text'
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            sendMessage(e.target.value);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

// Usage: File upload with progress
export function FileUploader() {
  const { upload } = useMinder("files");
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file) => {
    try {
      const result = await upload.uploadFile(file, {
        onProgress: (prog) => {
          setProgress(prog.percentage);
          console.log(
            `${prog.percentage}% - ${prog.speed} bytes/sec - ${prog.estimatedTimeRemaining}s remaining`
          );
        },
      });

      console.log("Upload complete:", result.url);
    } catch (error) {
      console.error("Upload failed:", error);
    }
  };

  return (
    <div>
      <input type='file' onChange={(e) => handleUpload(e.target.files[0])} />
      {progress > 0 && (
        <progress value={progress} max='100'>
          {progress}%
        </progress>
      )}
    </div>
  );
}

// Usage: Image upload with optimization
export function ImageUploader() {
  const { upload } = useMinder("files");

  const handleImageUpload = async (file) => {
    const result = await upload.uploadImage(file, {
      resize: {
        width: 800,
        height: 800,
        fit: "cover",
      },
      format: "webp",
      quality: 90,
      onProgress: (prog) => console.log(`${prog.percentage}%`),
    });

    console.log("Optimized image uploaded:", result.url);
  };

  return (
    <input
      type='file'
      accept='image/*'
      onChange={(e) => handleImageUpload(e.target.files[0])}
    />
  );
}

// Usage: Debug tools
import { useDebug } from "minder-data-provider/debug";

export function PerformanceMonitor() {
  const debug = useDebug();

  const measureOperation = async () => {
    debug.startTimer("api-call");
    // ... do something
    debug.endTimer("api-call");

    const metrics = debug.getPerformanceMetrics();
    console.log("Performance metrics:", metrics);
  };

  return <button onClick={measureOperation}>Measure Performance</button>;
}
```

**What you get additionally:**

- ✅ WebSocket with auto-reconnection
- ✅ Real-time subscriptions
- ✅ File upload with progress tracking
- ✅ Image optimization (resize, format conversion)
- ✅ Chunked uploads for large files
- ✅ Performance monitoring
- ✅ Advanced debugging tools
- ✅ Security layers (XSS, CSRF, rate limiting)

---

## 4. Enterprise Setup (Production-grade)

**Use Case:** Enterprise applications, high-scale (10M+ users)

**Features:** Everything optimized for scale

**Bundle Size:** ~250 KB (full package)

```typescript
// config/minder.enterprise.ts
import { createFromPreset } from "minder-data-provider/config";

export const config = createFromPreset("enterprise", {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://api.example.com",

  routes: {
    users: "/api/v1/users",
    posts: "/api/v1/posts",
    products: "/api/v1/products",
    orders: "/api/v1/orders",
    analytics: "/api/v1/analytics",
    notifications: "/api/v1/notifications",
    files: "/api/v1/files",
  },

  // Production-grade authentication
  auth: {
    endpoints: {
      login: "/api/v1/auth/login",
      logout: "/api/v1/auth/logout",
      refresh: "/api/v1/auth/refresh",
      verify: "/api/v1/auth/verify",
    },
    storage: "cookie", // Secure httpOnly cookies
    refreshBefore: 300, // 5 minutes
    autoRefresh: true,
    enableCSRF: true,
    rateLimiting: {
      maxAttempts: 5,
      windowMs: 900000, // 15 minutes
    },
  },

  // Multi-level caching
  cache: {
    enabled: true,
    memory: {
      ttl: 300000, // 5 minutes
      max: 1000,
    },
    storage: {
      ttl: 3600000, // 1 hour
      max: 10000,
    },
    strategy: "stale-while-revalidate",
    invalidation: {
      smart: true,
      relationships: {
        users: ["posts", "comments"],
        posts: ["comments"],
        products: ["orders", "cart"],
      },
    },
  },

  // WebSocket with failover
  websocket: {
    url: process.env.NEXT_PUBLIC_WS_URL || "wss://ws.example.com",
    protocols: ["v1.websocket.example.com"],
    reconnect: true,
    heartbeat: 30000,
    maxReconnectAttempts: 10,
  },

  // Enterprise file upload
  upload: {
    endpoint: "/api/v1/upload",
    maxSize: 104857600, // 100MB
    chunked: {
      enabled: true,
      chunkSize: 1048576, // 1MB chunks
    },
    retry: {
      attempts: 3,
      delay: 1000,
    },
    allowedTypes: ["image/*", "application/pdf", "text/*"],
  },

  // CORS
  cors: {
    enabled: true,
    credentials: true,
    origin: [
      "https://app.example.com",
      "https://admin.example.com",
      "https://mobile.example.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    headers: ["Content-Type", "Authorization", "X-Request-ID"],
  },

  // Performance optimizations
  performance: {
    deduplication: true,
    compression: true,
    batching: true,
    batchDelay: 50,
    retries: 3,
    retryDelay: 1000,
    timeout: 30000,
    lazyLoading: true,
    bundleAnalysis: true,
    monitoring: true,
  },

  // Enterprise security
  security: {
    sanitization: true,
    csrfProtection: true,
    xssProtection: true,
    rateLimiting: {
      requests: 1000,
      window: 60000,
      strategy: "sliding-window",
    },
    encryption: {
      enabled: true,
      algorithm: "AES-256-GCM",
    },
    contentSecurityPolicy: {
      enabled: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  },

  // Advanced debugging
  debug: {
    enabled: process.env.NODE_ENV === "development",
    logLevel: process.env.NODE_ENV === "production" ? "error" : "info",
    performance: true,
    networkLogs: process.env.NODE_ENV !== "production",
  },

  // SSR/SSG support
  ssr: {
    enabled: true,
    prefetch: ["users", "posts", "products"],
    hydrate: true,
    cacheControl: {
      maxAge: 3600,
      staleWhileRevalidate: 86400,
    },
  },

  // Offline support
  offline: {
    enabled: true,
    queue: {
      maxSize: 1000,
      strategy: "fifo",
      retryAttempts: 3,
    },
    persistence: true,
  },

  // Multi-environment
  environments: {
    development: {
      apiBaseUrl: "http://localhost:3000",
      debug: true,
    },
    staging: {
      apiBaseUrl: "https://staging-api.example.com",
      debug: true,
    },
    production: {
      apiBaseUrl: "https://api.example.com",
      debug: false,
    },
  },

  defaultEnvironment: process.env.NODE_ENV || "development",
  autoDetectEnvironment: true,
});

// App with enterprise features
import { MinderDataProvider, DevTools } from "minder-data-provider";
import {
  PluginManager,
  LoggerPlugin,
  MetricsPlugin,
  RetryPlugin,
} from "minder-data-provider/plugins";

const pluginManager = new PluginManager();
pluginManager.register(LoggerPlugin);
pluginManager.register(MetricsPlugin);
pluginManager.register(RetryPlugin);

export default function App({ children }) {
  return (
    <MinderDataProvider config={config}>
      {children}

      {/* DevTools in development only */}
      {process.env.NODE_ENV === "development" && (
        <DevTools position='bottom-right' defaultOpen={false} />
      )}
    </MinderDataProvider>
  );
}

// Enterprise dashboard with all features
export function EnterpriseDashboard() {
  const {
    data: analytics,
    auth,
    cache,
    websocket,
    upload,
    operations,
  } = useMinder("analytics");

  const currentUser = auth.getCurrentUser();
  const cacheStats = cache.getStats();
  const wsInfo = websocket.getInfo();

  useEffect(() => {
    // Connect WebSocket for real-time updates
    websocket.connect();
    websocket.subscribe("analytics-update", (data) => {
      cache.invalidate(["analytics"]);
    });

    return () => websocket.disconnect();
  }, []);

  return (
    <div className='dashboard'>
      <header>
        <h1>Enterprise Dashboard</h1>
        <p>
          Welcome, {currentUser?.name} ({currentUser?.role})
        </p>
        <button onClick={() => auth.logout()}>Logout</button>
      </header>

      <div className='stats'>
        <div>Cache Hit Rate: {cacheStats.hitRate}%</div>
        <div>
          WebSocket: {wsInfo.connected ? "🟢 Connected" : "🔴 Disconnected"}
        </div>
        <div>Queued Messages: {wsInfo.queueSize}</div>
      </div>

      <div className='analytics'>
        <h2>Analytics</h2>
        {analytics.map((item) => (
          <div key={item.id}>
            {item.metric}: {item.value}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**What you get additionally:**

- ✅ Plugin system for extensibility
- ✅ Multi-environment support
- ✅ SSR/SSG with hydration
- ✅ Offline queue with persistence
- ✅ Advanced metrics & monitoring
- ✅ Content Security Policy
- ✅ Encryption at rest
- ✅ DevTools panel
- ✅ Smart cache invalidation
- ✅ Distributed cache support

---

## 5. Platform-Specific Examples

### Next.js (Pages Router)

```typescript
// pages/_app.tsx
import { MinderDataProvider } from "minder-data-provider";
import dynamic from "next/dynamic";
import { createMinderConfig } from "minder-data-provider/config";

const config = createMinderConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  dynamic: dynamic, // ⚠️ REQUIRED for Next.js
  routes: { users: "/users" },
});

export default function App({ Component, pageProps }) {
  return (
    <MinderDataProvider config={config}>
      <Component {...pageProps} />
    </MinderDataProvider>
  );
}

// pages/users.tsx - With SSR
import { prefetchData } from "minder-data-provider/ssr";

export async function getServerSideProps() {
  const data = await prefetchData(config, ["users"]);

  return {
    props: { initialData: data },
  };
}

export default function UsersPage({ initialData }) {
  const { data: users } = useMinder("users", { initialData });

  return <UsersList users={users} />;
}
```

### Next.js (App Router)

```typescript
// app/layout.tsx
import { MinderDataProvider } from "minder-data-provider";
import dynamic from "next/dynamic";

const config = createMinderConfig({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  dynamic: dynamic,
  routes: { users: "/users" },
});

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <MinderDataProvider config={config}>{children}</MinderDataProvider>
      </body>
    </html>
  );
}

// app/users/page.tsx
import { prefetchData } from "minder-data-provider/ssr";

export default async function UsersPage() {
  const data = await prefetchData(config, ["users"]);

  return <UsersList initialData={data} />;
}
```

### React Native

```typescript
// App.tsx
import { MinderDataProvider } from "minder-data-provider/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: { users: "/users" },
  auth: {
    storage: "AsyncStorage", // Uses React Native AsyncStorage
  },
  cache: {
    storage: {
      adapter: AsyncStorage,
    },
  },
});

export default function App() {
  return (
    <MinderDataProvider config={config}>
      <Navigation />
    </MinderDataProvider>
  );
}
```

### Expo

```typescript
// App.tsx
import { MinderDataProvider } from "minder-data-provider/expo";
import * as SecureStore from "expo-secure-store";

const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: { users: "/users" },
  auth: {
    storage: "SecureStore", // Uses Expo SecureStore
    secureStore: SecureStore,
  },
});

export default function App() {
  return (
    <MinderDataProvider config={config}>
      <AppContent />
    </MinderDataProvider>
  );
}
```

### Electron

```typescript
// main.tsx
import { MinderDataProvider } from "minder-data-provider/electron";

const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: { users: "/users" },
  auth: {
    storage: "electron-store", // Uses Electron secure storage
  },
});

export default function App() {
  return (
    <MinderDataProvider config={config}>
      <MainWindow />
    </MinderDataProvider>
  );
}
```

---

## Summary Comparison

| Feature         | Simple | Standard | Advanced    | Enterprise     |
| --------------- | ------ | -------- | ----------- | -------------- |
| **Bundle Size** | ~48 KB | ~145 KB  | ~195 KB     | ~250 KB        |
| **CRUD**        | ✅     | ✅       | ✅          | ✅             |
| **Auth**        | ❌     | ✅       | ✅          | ✅             |
| **Cache**       | Basic  | ✅       | ✅ Advanced | ✅ Multi-level |
| **WebSocket**   | ❌     | ❌       | ✅          | ✅             |
| **Upload**      | ❌     | ❌       | ✅          | ✅ Chunked     |
| **Security**    | Basic  | ✅       | ✅ Advanced | ✅ Enterprise  |
| **Debug Tools** | ❌     | ❌       | ✅          | ✅ Advanced    |
| **SSR/SSG**     | ❌     | ❌       | ❌          | ✅             |
| **Offline**     | ❌     | ❌       | ❌          | ✅             |
| **Plugins**     | ❌     | ❌       | ❌          | ✅             |

Choose the configuration that matches your needs and scale up as you grow! 🚀
