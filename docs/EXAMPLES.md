# Examples

Comprehensive examples for Minder Data Provider v2.0.

## Table of Contents

- [Basic CRUD](#basic-crud)
- [Authentication](#authentication)
- [Caching](#caching)
- [WebSocket Real-time](#websocket-real-time)
- [File Upload](#file-upload)
- [Performance Optimization](#performance-optimization)
- [Security](#security)
- [SSR/CSR](#ssrcsr)
- [Advanced Patterns](#advanced-patterns)
- [Real-World Examples](#real-world-examples)

---

## Basic CRUD

### Simple User Management

```typescript
import { useMinder } from 'minder-data-provider';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function UserManagement() {
  const { 
    data: users, 
    loading, 
    error, 
    operations 
  } = useMinder<User>('users');

  const handleCreate = async () => {
    await operations.create({
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user'
    });
  };

  const handleUpdate = async (userId: string) => {
    await operations.update(userId, {
      role: 'admin'
    });
  };

  const handleDelete = async (userId: string) => {
    if (confirm('Are you sure?')) {
      await operations.delete(userId);
    }
  };

  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Users ({users?.length || 0})</h2>
      <button onClick={handleCreate}>Add User</button>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users?.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <button onClick={() => handleUpdate(user.id)}>
                  Make Admin
                </button>
                <button onClick={() => handleDelete(user.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Optimistic Updates

```typescript
import { useMinder } from 'minder-data-provider';
import { useDebug } from 'minder-data-provider/debug';

export function OptimisticTodos() {
  const { data: todos, operations } = useMinder('todos', {
    optimistic: true,  // Enable optimistic updates
    onSuccess: (todo) => {
      console.log('Todo saved:', todo);
    },
    onError: (error) => {
      console.error('Failed to save:', error);
      alert('Failed to save todo');
    }
  });

  const debug = useDebug();

  const handleToggle = async (todoId: string, completed: boolean) => {
    debug.startTimer(`toggle-${todoId}`);
    
    // UI updates immediately, API call happens in background
    await operations.update(todoId, { completed: !completed });
    
    const duration = debug.endTimer(`toggle-${todoId}`);
    debug.log('performance', 'Toggle completed', { duration });
  };

  return (
    <ul>
      {todos?.map(todo => (
        <li key={todo.id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => handleToggle(todo.id, todo.completed)}
          />
          <span style={{ 
            textDecoration: todo.completed ? 'line-through' : 'none' 
          }}>
            {todo.title}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

---

## Authentication

### Login Form

```typescript
import { useState } from 'react';
import { useAuth } from 'minder-data-provider/auth';
import { useRouter } from 'next/router';

export function LoginForm() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(credentials);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  if (isAuthenticated) {
    return <div>Already logged in. <a href="/dashboard">Go to Dashboard</a></div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      
      {error && <div className="error">{error}</div>}
      
      <input
        type="email"
        placeholder="Email"
        value={credentials.email}
        onChange={(e) => setCredentials(prev => ({
          ...prev,
          email: e.target.value
        }))}
        required
      />
      
      <input
        type="password"
        placeholder="Password"
        value={credentials.password}
        onChange={(e) => setCredentials(prev => ({
          ...prev,
          password: e.target.value
        }))}
        required
      />
      
      <button type="submit">Login</button>
    </form>
  );
}
```

### Protected Route

```typescript
import { useAuth } from 'minder-data-provider/auth';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <div>Checking authentication...</div>;
  }

  return (
    <div>
      <header>
        <div>Welcome, {user?.name}</div>
        <LogoutButton />
      </header>
      {children}
    </div>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return <button onClick={handleLogout}>Logout</button>;
}
```

---

## Caching

### Cache Management

```typescript
import { useCache } from 'minder-data-provider/cache';
import { useOneTouchCrud } from 'minder-data-provider/crud';

export function CachedUserProfile({ userId }: { userId: string }) {
  const cache = useCache();
  const cacheKey = `user-${userId}`;

  // Check cache first
  const cachedUser = cache.get(cacheKey);

  const { data: user, loading } = useOneTouchCrud(`users/${userId}`, {
    autoFetch: !cachedUser  // Skip fetch if we have cached data
  });

  useEffect(() => {
    if (user) {
      // Cache for 5 minutes
      cache.set(cacheKey, user, 5 * 60 * 1000);
    }
  }, [user]);

  const handleRefresh = () => {
    cache.invalidate(cacheKey);
    window.location.reload();
  };

  const displayUser = cachedUser || user;

  if (loading && !cachedUser) return <div>Loading...</div>;

  return (
    <div>
      <h2>{displayUser.name}</h2>
      <p>{displayUser.email}</p>
      <button onClick={handleRefresh}>Refresh</button>
      {cachedUser && <small>From cache</small>}
    </div>
  );
}
```

### Invalidation Patterns

```typescript
import { useCache } from 'minder-data-provider/cache';

export function CacheManager() {
  const cache = useCache();

  const invalidateUserCache = () => {
    // Invalidate all user-related cache
    cache.invalidate(/^user/);
  };

  const invalidateAllPosts = () => {
    // Invalidate specific pattern
    cache.invalidate(/^posts-/);
  };

  const clearAllCache = () => {
    cache.clear();
  };

  return (
    <div>
      <button onClick={invalidateUserCache}>Clear User Cache</button>
      <button onClick={invalidateAllPosts}>Clear Posts Cache</button>
      <button onClick={clearAllCache}>Clear All Cache</button>
    </div>
  );
}
```

---

## WebSocket Real-time

### Real-time Chat

```typescript
import { useState, useEffect } from 'react';
import { useWebSocket } from 'minder-data-provider/websocket';

interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: number;
}

export function RealtimeChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  const ws = useWebSocket('wss://api.example.com/chat', {
    autoConnect: true,
    reconnect: true,
    reconnectInterval: 3000
  });

  useEffect(() => {
    const handleNewMessage = (message: Message) => {
      setMessages(prev => [...prev, message]);
    };

    const handleUserJoined = (data: { user: string }) => {
      console.log(`${data.user} joined the chat`);
    };

    ws.subscribe('message', handleNewMessage);
    ws.subscribe('user:joined', handleUserJoined);

    return () => {
      ws.unsubscribe('message', handleNewMessage);
      ws.unsubscribe('user:joined', handleUserJoined);
    };
  }, []);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputText.trim()) return;

    ws.send('message', {
      text: inputText,
      timestamp: Date.now()
    });

    setInputText('');
  };

  return (
    <div>
      <div className="connection-status">
        {ws.connected ? '🟢 Connected' : '🔴 Disconnected'}
      </div>

      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className="message">
            <strong>{msg.user}:</strong> {msg.text}
            <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          disabled={!ws.connected}
        />
        <button type="submit" disabled={!ws.connected}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### Live Notifications

```typescript
import { useWebSocket } from 'minder-data-provider/websocket';
import { useState, useEffect } from 'react';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

export function LiveNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const ws = useWebSocket('wss://api.example.com/notifications', {
    autoConnect: true
  });

  useEffect(() => {
    const handleNotification = (notification: Notification) => {
      setNotifications(prev => [notification, ...prev].slice(0, 10));
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setNotifications(prev => 
          prev.filter(n => n.id !== notification.id)
        );
      }, 5000);
    };

    ws.subscribe('notification', handleNotification);

    return () => {
      ws.unsubscribe('notification', handleNotification);
    };
  }, []);

  return (
    <div className="notifications">
      {notifications.map(notif => (
        <div key={notif.id} className={`notification ${notif.type}`}>
          {notif.message}
        </div>
      ))}
    </div>
  );
}
```

---

## File Upload

### Image Upload with Progress

```typescript
import { useState } from 'react';
import { useMediaUpload } from 'minder-data-provider/upload';

export function ImageUploader() {
  const [preview, setPreview] = useState<string | null>(null);
  
  const { upload, progress, uploading, error } = useMediaUpload({
    maxSize: 5 * 1024 * 1024,  // 5MB
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp']
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const result = await upload(file);
      console.log('Upload successful:', result.url);
      alert('Image uploaded successfully!');
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert(`Upload failed: ${err.message}`);
      setPreview(null);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={uploading}
      />

      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}

      {error && <div className="error">{error.message}</div>}

      {preview && (
        <div className="preview">
          <img src={preview} alt="Preview" style={{ maxWidth: '300px' }} />
        </div>
      )}
    </div>
  );
}
```

### Multiple File Upload

```typescript
import { useMediaUpload } from 'minder-data-provider/upload';
import { useState } from 'react';

interface UploadedFile {
  name: string;
  url: string;
  size: number;
}

export function MultiFileUploader() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const { upload, uploading } = useMediaUpload();

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    for (const file of selectedFiles) {
      try {
        const result = await upload(file);
        setFiles(prev => [...prev, {
          name: file.name,
          url: result.url,
          size: file.size
        }]);
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
      }
    }
  };

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={handleFilesSelect}
        disabled={uploading}
      />

      <div className="uploaded-files">
        <h3>Uploaded Files ({files.length})</h3>
        {files.map((file, index) => (
          <div key={index} className="file-item">
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              {file.name}
            </a>
            <small>{(file.size / 1024).toFixed(2)} KB</small>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Performance Optimization

### Debounced Search

```typescript
import { useState, useEffect } from 'react';
import { useDebounce } from 'minder-data-provider/utils/performance';
import { useOneTouchCrud } from 'minder-data-provider/crud';

export function DebouncedSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);

  const { data: results, loading } = useOneTouchCrud(`search?q=${debouncedSearch}`, {
    autoFetch: !!debouncedSearch
  });

  return (
    <div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search..."
      />

      {loading && <div>Searching...</div>}

      {results && (
        <div className="results">
          <p>Found {results.length} results for "{debouncedSearch}"</p>
          {results.map(item => (
            <div key={item.id}>{item.title}</div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Lazy Loading

```typescript
import { useLazyLoad } from 'minder-data-provider/utils/performance';
import { useRef } from 'react';

export function InfiniteScroll() {
  const [page, setPage] = useState(1);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data, loading } = useOneTouchCrud(`posts?page=${page}`);

  useLazyLoad(loadMoreRef, () => {
    if (!loading) {
      setPage(prev => prev + 1);
    }
  });

  return (
    <div>
      {data.map(post => (
        <div key={post.id} className="post">
          <h3>{post.title}</h3>
          <p>{post.excerpt}</p>
        </div>
      ))}

      <div ref={loadMoreRef} style={{ height: '50px' }}>
        {loading && <div>Loading more...</div>}
      </div>
    </div>
  );
}
```

### Performance Monitoring

```typescript
import { usePerformanceMonitor } from 'minder-data-provider/utils/performance';
import { useEffect } from 'react';

export function PerformanceDashboard() {
  const monitor = usePerformanceMonitor();

  useEffect(() => {
    const interval = setInterval(() => {
      const metrics = monitor.getMetrics();
      console.log('Performance Metrics:', {
        requests: metrics.requestCount,
        avgLatency: metrics.averageLatency,
        cacheHitRate: metrics.cacheHitRate,
        errorRate: metrics.errorRate
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const metrics = monitor.getMetrics();

  return (
    <div className="dashboard">
      <h2>Performance Metrics</h2>
      
      <div className="metric">
        <label>Total Requests:</label>
        <span>{metrics.requestCount}</span>
      </div>

      <div className="metric">
        <label>Average Latency:</label>
        <span>{metrics.averageLatency}ms</span>
      </div>

      <div className="metric">
        <label>Cache Hit Rate:</label>
        <span>{metrics.cacheHitRate}%</span>
      </div>

      <div className="metric">
        <label>Error Rate:</label>
        <span>{metrics.errorRate}%</span>
      </div>

      <h3>Slowest Requests</h3>
      {metrics.slowestRequests.map((req, i) => (
        <div key={i}>
          {req.route}: {req.duration}ms
        </div>
      ))}
    </div>
  );
}
```

---

## Security

### XSS Protection

```typescript
import { XSSSanitizer } from 'minder-data-provider/utils/security';
import { useOneTouchCrud } from 'minder-data-provider/crud';

const sanitizer = new XSSSanitizer();

export function SafeCommentsList() {
  const { data: comments } = useOneTouchCrud('comments');

  return (
    <div>
      {comments.map(comment => (
        <div key={comment.id}>
          <strong>{sanitizer.sanitize(comment.author)}</strong>
          <div 
            dangerouslySetInnerHTML={{ 
              __html: sanitizer.sanitize(comment.text) 
            }} 
          />
        </div>
      ))}
    </div>
  );
}
```

### Rate Limiting

```typescript
import { RateLimiter } from 'minder-data-provider/utils/security';
import { useState } from 'react';

const limiter = new RateLimiter({
  requests: 5,
  window: 60000  // 5 requests per minute
});

export function RateLimitedForm() {
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const userId = 'current-user-id';
    
    if (!limiter.isAllowed(userId)) {
      alert('Too many requests. Please wait before trying again.');
      return;
    }

    // Submit form
    await submitData(message);
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

---

## SSR/CSR

### Server-Side Rendering

```typescript
// pages/users.tsx
import { GetServerSideProps } from 'next';
import { prefetchData } from 'minder-data-provider/ssr';
import { config } from '../config/minder.config';

export const getServerSideProps: GetServerSideProps = async () => {
  // Fetch data on server
  const data = await prefetchData(config, ['users']);

  return {
    props: {
      initialData: data
    }
  };
};

export default function UsersPage({ initialData }) {
  return (
    <MinderDataProvider config={config}>
      <UsersList initialData={initialData} />
    </MinderDataProvider>
  );
}

function UsersList({ initialData }) {
  const { data: users } = useOneTouchCrud('users', {
    initialData: initialData.users
  });

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

### Static Generation

```typescript
// pages/posts/[id].tsx
import { GetStaticProps, GetStaticPaths } from 'next';
import { prefetchData } from 'minder-data-provider/ssr';

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json());

  return {
    paths: posts.map(post => ({ params: { id: post.id } })),
    fallback: 'blocking'
  };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const data = await prefetchData(config, [`posts/${params.id}`]);

  return {
    props: { initialData: data },
    revalidate: 60  // Revalidate every minute
  };
};

export default function PostPage({ initialData }) {
  const { data: post } = useOneTouchCrud(`posts/${initialData.id}`, {
    initialData: initialData.post
  });

  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
    </article>
  );
}
```

---

## Real-World Examples

### E-commerce Product List

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';
import { useCache } from 'minder-data-provider/cache';
import { useDebounce } from 'minder-data-provider/utils/performance';
import { useState } from 'react';

export function ProductList() {
  const [filters, setFilters] = useState({
    category: '',
    minPrice: 0,
    maxPrice: 1000,
    search: ''
  });

  const debouncedSearch = useDebounce(filters.search, 300);
  const cache = useCache();

  const queryParams = new URLSearchParams({
    category: filters.category,
    minPrice: filters.minPrice.toString(),
    maxPrice: filters.maxPrice.toString(),
    search: debouncedSearch
  }).toString();

  const { data: products, loading } = useOneTouchCrud(
    `products?${queryParams}`,
    { cache: true }
  );

  const handleAddToCart = (productId: string) => {
    const cart = cache.get('cart') || [];
    cache.set('cart', [...cart, productId]);
  };

  return (
    <div className="product-list">
      <aside className="filters">
        <input
          type="text"
          placeholder="Search products..."
          value={filters.search}
          onChange={(e) => setFilters(prev => ({
            ...prev,
            search: e.target.value
          }))}
        />

        <select
          value={filters.category}
          onChange={(e) => setFilters(prev => ({
            ...prev,
            category: e.target.value
          }))}
        >
          <option value="">All Categories</option>
          <option value="electronics">Electronics</option>
          <option value="clothing">Clothing</option>
          <option value="books">Books</option>
        </select>

        <div>
          <label>Price Range:</label>
          <input
            type="range"
            min="0"
            max="1000"
            value={filters.maxPrice}
            onChange={(e) => setFilters(prev => ({
              ...prev,
              maxPrice: parseInt(e.target.value)
            }))}
          />
          <span>${filters.maxPrice}</span>
        </div>
      </aside>

      <main className="products">
        {loading && <div>Loading products...</div>}

        <div className="grid">
          {products?.map(product => (
            <div key={product.id} className="product-card">
              <img src={product.image} alt={product.name} />
              <h3>{product.name}</h3>
              <p>${product.price}</p>
              <button onClick={() => handleAddToCart(product.id)}>
                Add to Cart
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
```

---

For more examples and use cases, check out our [Demo Application](../demo) and [API Reference](./API_REFERENCE.md).
