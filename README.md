# 🚀 Minder Data Provider

A comprehensive, production-ready data management solution for Next.js applications that automatically generates React hooks, Redux slices, and handles client/server state with performance, security, and CORS optimizations.

[![npm version](https://badge.fury.io/js/minder-data-provider.svg)](https://badge.fury.io/js/minder-data-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

## ✨ Features

- **🔄 One-Touch CRUD Operations**: Complete CRUD with a single hook call
- **🏪 Hybrid State Management**: TanStack Query + Redux integration
- **🌐 CORS Support**: Built-in CORS handling for cross-origin requests
- **🔌 WebSocket Integration**: Real-time communication with auto-reconnection
- **💾 Advanced Caching**: Multi-level caching with TTL and invalidation
- **🔐 Authentication Management**: Token storage with multiple strategies
- **📁 File Upload Support**: Progress tracking and multiple formats
- **⚡ Optimistic Updates**: Instant UI updates with rollback
- **🛡️ Type Safety**: Full TypeScript support with auto-generated types
- **🎯 Next.js Optimized**: SSR/SSG compatible with hydration support

## 📦 Installation

```bash
npm install minder-data-provider
# or
yarn add minder-data-provider
# or
pnpm add minder-data-provider
```

## 🚀 Quick Start

### 1. Create Configuration

```typescript
// config/minder.config.ts
import { MinderConfig } from 'minder-data-provider';
import { UserModel } from '../models/UserModel';

export const config: MinderConfig = {
  apiBaseUrl: 'https://api.example.com',
  
  // CORS Configuration
  cors: {
    credentials: true,
    origin: ['http://localhost:3000', 'https://yourdomain.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  },
  
  // API Routes with Models
  routes: {
    users: {
      method: 'GET',
      url: '/users',
      model: UserModel,
      optimistic: true,
      cache: true,
    },
    createUser: {
      method: 'POST',
      url: '/users',
      model: UserModel,
      optimistic: true,
    },
    updateUser: {
      method: 'PUT',
      url: '/users/:id',
      model: UserModel,
      optimistic: true,
    },
    deleteUser: {
      method: 'DELETE',
      url: '/users/:id',
      optimistic: true,
    },
    uploadFile: {
      method: 'POST',
      url: '/upload',
      optimistic: false,
    },
  },
  
  // Authentication
  auth: {
    tokenKey: 'accessToken',
    storage: 'localStorage', // 'localStorage' | 'sessionStorage' | 'memory' | 'cookie'
  },
  
  // Advanced Caching
  cache: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
    refetchOnWindowFocus: false,
  },
  
  // WebSocket (Optional)
  websocket: {
    url: 'wss://api.example.com/ws',
    reconnect: true,
    heartbeat: 30000,
  },
  
  // Performance Optimizations
  performance: {
    deduplication: true,
    retries: 3,
    retryDelay: 1000,
    timeout: 30000,
  },
};
```

### 2. Define Models

```typescript
// models/UserModel.ts
import { BaseModel } from 'minder-data-provider';

export class UserModel extends BaseModel {
  public name!: string;
  public email!: string;
  public avatar?: string;
  public role: 'admin' | 'user' = 'user';
  
  public fromJSON(data: any): this {
    super.fromJSON(data);
    this.name = data.name || '';
    this.email = data.email || '';
    this.avatar = data.avatar;
    this.role = data.role || 'user';
    return this;
  }
  
  public validate() {
    const errors: string[] = [];
    if (!this.name) errors.push('Name is required');
    if (!this.email) errors.push('Email is required');
    return { isValid: errors.length === 0, errors };
  }
  
  public getDisplayName(): string {
    return this.name || 'Unknown User';
  }
}
```

### 3. Setup Provider

```typescript
// pages/_app.tsx (Next.js Pages Router)
// or app/layout.tsx (Next.js App Router)
import { MinderDataProvider } from 'minder-data-provider';
import { config } from '../config/minder.config';

export default function App({ children }) {
  return (
    <MinderDataProvider config={config}>
      {children}
    </MinderDataProvider>
  );
}
```

### 4. Use in Components

```typescript
// components/UserManager.tsx
import { useOneTouchCrud, useAuth, useCache } from 'minder-data-provider';
import { UserModel } from '../models/UserModel';

export function UserManager() {
  // One-touch CRUD operations
  const { data: users, loading, errors, operations } = useOneTouchCrud<UserModel>('users');
  
  // Authentication
  const auth = useAuth();
  
  // Cache management
  const cache = useCache();
  
  const handleCreateUser = async () => {
    try {
      const newUser = await operations.create({
        name: 'John Doe',
        email: 'john@example.com',
      });
      console.log('User created:', newUser.getDisplayName());
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  };
  
  const handleLogin = () => {
    auth.setToken('your-jwt-token');
  };
  
  const clearCache = () => {
    cache.clearCache('users');
  };
  
  if (loading.fetch) return <div>Loading users...</div>;
  if (errors.hasError) return <div>Error: {errors.message}</div>;
  
  return (
    <div>
      <h2>Users ({users.length})</h2>
      
      {/* Authentication Status */}
      <div>
        Status: {auth.isAuthenticated() ? '✅ Authenticated' : '❌ Not Authenticated'}
        <button onClick={handleLogin}>Login</button>
        <button onClick={auth.clearAuth}>Logout</button>
      </div>
      
      {/* User Operations */}
      <button onClick={handleCreateUser} disabled={loading.create}>
        {loading.create ? 'Creating...' : 'Create User'}
      </button>
      
      <button onClick={operations.refresh}>Refresh</button>
      <button onClick={clearCache}>Clear Cache</button>
      
      {/* Users List */}
      {users.map(user => (
        <div key={user.id}>
          <span>{user.getDisplayName()} - {user.email}</span>
          <button 
            onClick={() => operations.update(user.id!, { name: user.name + ' (Updated)' })}
            disabled={loading.update}
          >
            Update
          </button>
          <button 
            onClick={() => operations.delete(user.id!)}
            disabled={loading.delete}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
```

## 🔧 Advanced Usage

### File Upload with Progress

```typescript
import { useMediaUpload } from 'minder-data-provider';

function FileUploader() {
  const { uploadFile, progress, isUploading } = useMediaUpload('uploadFile');
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const result = await uploadFile(file);
      console.log('Upload successful:', result);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };
  
  return (
    <div>
      <input type="file" onChange={handleFileUpload} disabled={isUploading} />
      {isUploading && (
        <div>
          <p>Uploading: {progress.percentage}%</p>
          <progress value={progress.loaded} max={progress.total} />
        </div>
      )}
    </div>
  );
}
```

### WebSocket Integration

```typescript
import { useWebSocket } from 'minder-data-provider';

function RealTimeChat() {
  const ws = useWebSocket();
  const [messages, setMessages] = useState<string[]>([]);
  
  useEffect(() => {
    ws.connect();
    
    const unsubscribe = ws.subscribe('message', (data) => {
      setMessages(prev => [...prev, data.text]);
    });
    
    return () => {
      unsubscribe();
      ws.disconnect();
    };
  }, []);
  
  const sendMessage = () => {
    ws.send('message', { text: 'Hello World!' });
  };
  
  return (
    <div>
      <button onClick={sendMessage} disabled={!ws.isConnected()}>
        Send Message
      </button>
      <div>
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </div>
    </div>
  );
}
```

### Redux Integration

```typescript
import { useStore, useReduxSlice } from 'minder-data-provider';

function ReduxExample() {
  const store = useStore();
  const { state, actions, dispatch } = useReduxSlice('users');
  
  const handleManualAction = () => {
    dispatch(actions.addItem({ id: 999, name: 'Manual User' }));
  };
  
  return (
    <div>
      <p>Users in Redux: {state?.items?.length || 0}</p>
      <button onClick={handleManualAction}>Add Manual User</button>
    </div>
  );
}
```

### Cache Management

```typescript
import { useCache } from 'minder-data-provider';

function CacheManager() {
  const cache = useCache();
  
  const preloadData = async () => {
    await cache.prefetchQuery('users', () => 
      fetch('/api/users').then(res => res.json())
    );
  };
  
  const inspectCache = () => {
    const cachedUsers = cache.getCachedData('users');
    const allQueries = cache.getAllCachedQueries();
    console.log('Cached users:', cachedUsers);
    console.log('All queries:', allQueries);
  };
  
  return (
    <div>
      <button onClick={preloadData}>Preload Users</button>
      <button onClick={inspectCache}>Inspect Cache</button>
      <button onClick={() => cache.invalidateQueries('users')}>Invalidate Users</button>
      <button onClick={() => cache.clearCache()}>Clear All Cache</button>
    </div>
  );
}
```

## 🎯 Next.js Integration

### SSR/SSG Support

```typescript
// pages/users.tsx
import { GetServerSideProps } from 'next';
import { MinderDataProvider, useOneTouchCrud } from 'minder-data-provider';
import { config } from '../config/minder.config';

export const getServerSideProps: GetServerSideProps = async () => {
  // Prefetch data on server
  const users = await fetch('https://api.example.com/users').then(res => res.json());
  
  return {
    props: {
      initialData: { users },
    },
  };
};

export default function UsersPage({ initialData }) {
  return (
    <MinderDataProvider config={config}>
      <UsersList initialData={initialData} />
    </MinderDataProvider>
  );
}
```

### API Route Auto-Generation

```typescript
// next.config.js
const { generateApiRoutes } = require('minder-data-provider/utils');

module.exports = {
  async rewrites() {
    return generateApiRoutes('./pages/api');
  },
};
```

## 🛡️ Security Features

- **CORS Protection**: Configurable CORS policies
- **Token Management**: Secure token storage with multiple strategies
- **Request Signing**: Optional request signing for enhanced security
- **XSS Protection**: Sanitized data handling
- **CSRF Protection**: Built-in CSRF token support

## ⚡ Performance Features

- **Request Deduplication**: Prevents duplicate API calls
- **Intelligent Caching**: Multi-level caching with TTL
- **Optimistic Updates**: Immediate UI updates with rollback
- **Background Refetching**: Keep data fresh without blocking UI
- **Bundle Splitting**: Tree-shakeable exports
- **Connection Pooling**: Efficient HTTP connection management

## 📊 Monitoring & Debugging

- **Redux DevTools**: Full Redux DevTools integration
- **TanStack Query DevTools**: Query inspection and debugging
- **Performance Metrics**: Built-in performance monitoring
- **Error Tracking**: Comprehensive error logging
- **Cache Analytics**: Cache hit/miss statistics

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🚀 Demo

```bash
# Start demo application
npm run demo
```

Visit `http://localhost:3000` to see the interactive demo.

## 📚 API Reference

### Hooks

- `useOneTouchCrud<T>(routeName)` - Complete CRUD operations
- `useAuth()` - Authentication management
- `useCache()` - Cache operations
- `useStore()` - Redux store access
- `useCurrentUser()` - Current user information
- `useMediaUpload(routeName)` - File upload with progress
- `useWebSocket()` - WebSocket communication
- `useUIState()` - UI state management

### Configuration

```typescript
interface MinderConfig {
  apiBaseUrl: string;
  routes: Record<string, ApiRoute>;
  auth?: AuthConfig;
  cors?: CorsConfig;
  cache?: CacheConfig;
  websocket?: WebSocketConfig;
  performance?: PerformanceConfig;
  onError?: (error: ApiError) => void;
}
```

### Models

```typescript
abstract class BaseModel {
  fromJSON(data: any): this;
  toJSON(): any;
  validate(): { isValid: boolean; errors: string[] };
  clone(): this;
  equals(other: BaseModel): boolean;
  getDisplayName(): string;
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://minder-data-provider.docs.com)
- 💬 [Discord Community](https://discord.gg/minder-data-provider)
- 🐛 [Issue Tracker](https://github.com/minder-data-provider/issues)
- 📧 [Email Support](mailto:support@minder-data-provider.com)

## 🏆 Why Choose Minder Data Provider?

- **🎯 Single Configuration**: One config file handles everything
- **🔄 Zero Boilerplate**: Auto-generated hooks and slices
- **🌐 CORS Ready**: Built-in CORS support for modern web apps
- **⚡ Performance First**: Optimized for production workloads
- **🛡️ Security Built-in**: Enterprise-grade security features
- **📱 Mobile Ready**: Optimized for React Native compatibility
- **🔧 Highly Configurable**: Customize every aspect of data management
- **📊 Production Tested**: Battle-tested in production environments

---

Built with ❤️ for the React/Next.js community