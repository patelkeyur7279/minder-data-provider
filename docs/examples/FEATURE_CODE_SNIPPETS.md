# Minder Data Provider - Complete Feature Guide with Code Snippets

Complete guide showing **how to use every feature** with real code examples from our 5 platform examples.

---

## 📋 Table of Contents

1. [Data Fetching](#1-data-fetching)
2. [Mutations (Create, Update, Delete)](#2-mutations)
3. [Caching](#3-caching)
4. [Offline Support](#4-offline-support)
5. [Error Handling](#5-error-handling)
6. [Loading States](#6-loading-states)
7. [Optimistic Updates](#7-optimistic-updates)
8. [Server-Side Rendering (SSR/SSG/ISR)](#8-server-side-rendering)
9. [File Upload](#9-file-upload)
10. [Authentication](#10-authentication)
11. [Rate Limiting](#11-rate-limiting)
12. [Platform-Specific Features](#12-platform-specific-features)

---

## 1. Data Fetching

### 1.1 Basic GET Request (Client-Side)

**Use Case**: Fetch data in React components

```typescript
// examples/web/e-commerce/src/hooks/useProducts.ts
import { useMinder } from 'minder-data-provider';

interface Product {
  id: number;
  title: string;
  price: number;
}

function useProducts() {
  const { data, isLoading, error } = useMinder<Product[]>(
    'https://fakestoreapi.com/products'
  );

  return {
    products: data || [],
    loading: isLoading,
    error,
  };
}

// Usage in component
function ProductList() {
  const { products, loading, error } = useProducts();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {products.map(product => (
        <div key={product.id}>{product.title}</div>
      ))}
    </div>
  );
}
```

**Why this approach?**
- Automatic caching
- Built-in loading/error states
- Auto-refetch on window focus
- TypeScript type safety

---

### 1.2 GET Request with Query Parameters

**Use Case**: Search, filters, pagination

```typescript
// examples/web/e-commerce/src/components/ProductList.tsx
import { useMinder } from 'minder-data-provider';
import { useState } from 'react';

function ProductList() {
  const [category, setCategory] = useState('electronics');
  const [limit, setLimit] = useState(10);

  // URL automatically updates when state changes
  const { data } = useMinder<Product[]>(
    `https://api.example.com/products?category=${category}&limit=${limit}`
  );

  return (
    <div>
      <select onChange={(e) => setCategory(e.target.value)}>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      {/* Products automatically refetch when category changes */}
    </div>
  );
}
```

**Why query params?**
- Dynamic filtering
- Easy pagination
- SEO-friendly URLs
- Cache per unique URL

---

### 1.3 Server-Side Data Fetching (Next.js SSG)

**Use Case**: Static pages that need data at build time

```typescript
// examples/nextjs/blog/pages/index.tsx
import { minder } from 'minder-data-provider';
import type { GetStaticProps } from 'next';

interface Post {
  id: number;
  title: string;
  body: string;
}

export const getStaticProps: GetStaticProps = async () => {
  // Runs at BUILD TIME
  const { data, error } = await minder<Post[]>(
    'https://jsonplaceholder.typicode.com/posts'
  );

  return {
    props: {
      posts: data?.slice(0, 10) || [],
    },
    // Optional: Regenerate page every 60 seconds (ISR)
    revalidate: 60,
  };
};

export default function Home({ posts }: { posts: Post[] }) {
  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.body}</p>
        </article>
      ))}
    </div>
  );
}
```

**When to use SSG?**
- Blog posts
- Product catalogs
- Documentation
- Marketing pages
- Content that changes infrequently

**Benefits:**
- Ultra-fast page loads
- Generated at build time
- CDN-cacheable
- SEO-optimized

---

### 1.4 Server-Side Rendering (Next.js SSR)

**Use Case**: Dynamic pages that need fresh data on every request

```typescript
// examples/nextjs/blog/pages/posts/[id].tsx
import { minder } from 'minder-data-provider';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Runs on EVERY REQUEST
  const { id } = context.params!;
  
  // Can access cookies, headers, user session
  const token = context.req.headers.cookie;

  const { data, error } = await minder<Post>(
    `https://jsonplaceholder.typicode.com/posts/${id}`,
    undefined,
    {
      headers: {
        Authorization: token || '',
      },
    }
  );

  if (!data || error) {
    return {
      notFound: true, // Shows 404 page
    };
  }

  return {
    props: { post: data },
  };
};

export default function PostPage({ post }: { post: Post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

**When to use SSR?**
- User-specific data
- Real-time content
- Personalized pages
- Protected routes
- Data that must be fresh

**Benefits:**
- Always up-to-date data
- Access to request context
- SEO-friendly
- Can use authentication

---

### 1.5 Backend API Routes (Node.js/Express)

**Use Case**: Build REST APIs

```typescript
// examples/nodejs/api/src/routes/users.ts
import { Router } from 'express';
import { minder } from 'minder-data-provider';

const router = Router();

router.get('/users', async (req, res) => {
  // Same API as client-side!
  const { data, error, success } = await minder<User[]>(
    'https://jsonplaceholder.typicode.com/users'
  );

  if (!success || error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch users',
    });
  }

  res.json({
    success: true,
    data,
  });
});

router.get('/users/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await minder<User>(
    `https://jsonplaceholder.typicode.com/users/${id}`
  );

  if (error) {
    return res.status(404).json({
      success: false,
      error: 'User not found',
    });
  }

  res.json({ success: true, data });
});

export default router;
```

**Why use minder() in backend?**
- Consistent API across frontend/backend
- Built-in error handling
- Type-safe responses
- Easy to test

---

## 2. Mutations (Create, Update, Delete)

### 2.1 Create (POST Request)

**Use Case**: Add new data

```typescript
// examples/web/e-commerce/src/components/Checkout.tsx
import { minder } from 'minder-data-provider';

interface Order {
  items: CartItem[];
  total: number;
  shippingAddress: Address;
}

async function submitOrder(orderData: Order) {
  const { data, error, success } = await minder<{ orderId: string }>(
    'https://api.example.com/orders',
    orderData,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!success || error) {
    throw new Error(error?.message || 'Order failed');
  }

  return data;
}

// Usage in component
function CheckoutForm() {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (formData: Order) => {
    try {
      setSubmitting(true);
      const result = await submitOrder(formData);
      alert(`Order placed! ID: ${result.orderId}`);
    } catch (error) {
      alert('Order failed: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button disabled={submitting}>
        {submitting ? 'Processing...' : 'Place Order'}
      </button>
    </form>
  );
}
```

---

### 2.2 Update (PUT Request)

**Use Case**: Modify existing data

```typescript
// examples/nodejs/api/src/routes/users.ts
import { minder } from 'minder-data-provider';

router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Validate input
  if (updates.email && !updates.email.includes('@')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format',
    });
  }

  const { data, error, success } = await minder<User>(
    `https://jsonplaceholder.typicode.com/users/${id}`,
    updates,
    { method: 'PUT' }
  );

  if (!success || error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Update failed',
    });
  }

  res.json({ success: true, data });
});
```

---

### 2.3 Delete (DELETE Request)

**Use Case**: Remove data

```typescript
// examples/react-native/offline-todo/src/hooks/useTodos.ts
import { minder } from 'minder-data-provider';

async function deleteTodoOnServer(id: string) {
  const { error, success } = await minder(
    `https://api.example.com/todos/${id}`,
    undefined,
    { method: 'DELETE' }
  );

  if (!success || error) {
    throw new Error(error?.message || 'Delete failed');
  }
}

// Usage with optimistic update
function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const deleteTodo = async (id: string) => {
    // Optimistic: Remove from UI immediately
    setTodos(prev => prev.filter(todo => todo.id !== id));

    try {
      await deleteTodoOnServer(id);
    } catch (error) {
      // Revert on error
      loadTodos(); // Reload from server
      throw error;
    }
  };

  return { todos, deleteTodo };
}
```

---

## 3. Caching

### 3.1 Automatic Caching (React Query)

**Use Case**: Avoid redundant API calls

```typescript
// examples/web/e-commerce/src/hooks/useProducts.ts
import { useMinder } from 'minder-data-provider';

function useProducts() {
  const { data, isLoading } = useMinder<Product[]>(
    'https://fakestoreapi.com/products',
    {
      // Cache for 5 minutes
      staleTime: 5 * 60 * 1000,
      
      // Keep in cache for 10 minutes after last use
      cacheTime: 10 * 60 * 1000,
      
      // Refetch when window gains focus
      refetchOnWindowFocus: true,
      
      // Refetch on mount if data is stale
      refetchOnMount: true,
    }
  );

  return { products: data || [], isLoading };
}
```

**How it works:**
1. First call → Fetches from API
2. Second call (within 5 min) → Returns cached data
3. After 5 min → Data marked "stale", refetches in background
4. After 10 min inactive → Cache cleared

---

### 3.2 Manual Cache Control

**Use Case**: Invalidate cache after mutations

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { minder } from 'minder-data-provider';

function useProducts() {
  const queryClient = useQueryClient();

  const createProduct = async (newProduct: Product) => {
    const { data, error } = await minder('/products', newProduct, {
      method: 'POST',
    });

    if (data) {
      // Invalidate and refetch products list
      queryClient.invalidateQueries({ queryKey: ['/products'] });
    }

    return { data, error };
  };

  return { createProduct };
}
```

---

## 4. Offline Support

### 4.1 Offline-First Architecture

**Use Case**: Mobile apps that work without internet

```typescript
// examples/react-native/offline-todo/src/services/sync.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { minder } from 'minder-data-provider';

// 1. Save to local storage immediately
async function createTodoOffline(todo: CreateTodoInput) {
  const newTodo: Todo = {
    id: generateLocalId(),
    title: todo.title,
    completed: false,
    syncStatus: 'pending',
    localOnly: true, // Not on server yet
  };

  // Save locally first
  await addTodoToStorage(newTodo);

  // Add to sync queue
  await addToSyncQueue({
    operation: 'create',
    todoId: newTodo.id,
    data: newTodo,
  });

  return newTodo;
}

// 2. Sync when online
async function processSyncQueue() {
  const queue = await getSyncQueue();

  for (const item of queue) {
    try {
      if (item.operation === 'create') {
        // Send to server
        const { data } = await minder('/todos', item.data, {
          method: 'POST',
        });

        if (data) {
          // Replace local ID with server ID
          await updateTodoInStorage(item.todoId, {
            id: data.id,
            syncStatus: 'synced',
            localOnly: false,
          });
        }
      }

      // Remove from queue
      await removeFromSyncQueue(item.id);
    } catch (error) {
      console.error('Sync failed:', error);
      // Keep in queue for retry
    }
  }
}
```

**Benefits:**
- Works completely offline
- No data loss
- Instant UI updates
- Auto-sync when online

---

### 4.2 Network Detection

**Use Case**: Detect online/offline status

```typescript
// examples/react-native/offline-todo/src/hooks/useNetwork.ts
import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

function useNetwork() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  return { isOnline };
}

// Usage
function App() {
  const { isOnline } = useNetwork();

  useEffect(() => {
    if (isOnline) {
      // Auto-sync when coming back online
      processSyncQueue();
    }
  }, [isOnline]);

  return (
    <div>
      <div className={isOnline ? 'online' : 'offline'}>
        {isOnline ? '🟢 Online' : '🔴 Offline'}
      </div>
    </div>
  );
}
```

---

## 5. Error Handling

### 5.1 Client-Side Error Handling

**Use Case**: Handle API errors in components

```typescript
// examples/web/e-commerce/src/hooks/useProducts.ts
import { useMinder } from 'minder-data-provider';

function useProducts() {
  const { data, isLoading, error } = useMinder<Product[]>(
    'https://fakestoreapi.com/products',
    {
      retry: 3, // Retry failed requests 3 times
      retryDelay: 1000, // Wait 1s between retries
      onError: (error) => {
        // Global error handler
        console.error('Failed to fetch products:', error);
        // Could send to error tracking service
      },
    }
  );

  // Handle error in component
  if (error) {
    return {
      products: [],
      loading: false,
      error: error.message,
    };
  }

  return {
    products: data || [],
    loading: isLoading,
    error: null,
  };
}

// Usage
function ProductList() {
  const { products, loading, error } = useProducts();

  if (error) {
    return (
      <div className="error">
        <h3>❌ Failed to load products</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  // ... render products
}
```

---

### 5.2 Server-Side Error Handling

**Use Case**: Centralized error handling in Express

```typescript
// examples/nodejs/api/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';

// Custom error class
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
  }
}

// Error handler middleware
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
  });

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';

  // Send response
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message,
      code,
      // Include stack in development only
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
      }),
    },
  });
}

// Usage in routes
import { asyncHandler } from './errorHandler';

router.get('/users/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    throw new AppError('Invalid user ID', 400, 'INVALID_ID');
  }

  const { data, error } = await minder(`/users/${id}`);

  if (error) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.json({ success: true, data });
}));
```

---

## 6. Loading States

### 6.1 Component Loading States

**Use Case**: Show loading indicators

```typescript
// examples/web/e-commerce/src/components/ProductList.tsx
import { useMinder } from 'minder-data-provider';

function ProductList() {
  const { data: products, isLoading, isFetching } = useMinder<Product[]>(
    '/products'
  );

  // isLoading: True on FIRST load
  // isFetching: True on any fetch (including background refetch)

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Show subtle indicator during background refetch */}
      {isFetching && (
        <div className="refetching-badge">
          Updating...
        </div>
      )}

      <div className="products-grid">
        {products?.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
```

---

### 6.2 Skeleton Loading

**Use Case**: Better UX than spinners

```typescript
function ProductList() {
  const { data: products, isLoading } = useMinder<Product[]>('/products');

  if (isLoading) {
    return (
      <div className="products-grid">
        {/* Show 6 skeleton cards */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-image" />
            <div className="skeleton-title" />
            <div className="skeleton-price" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="products-grid">
      {products?.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

---

## 7. Optimistic Updates

### 7.1 Optimistic UI Pattern

**Use Case**: Instant feedback for user actions

```typescript
// examples/react-native/offline-todo/src/hooks/useTodos.ts
import { useState } from 'react';
import { minder } from 'minder-data-provider';

function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const toggleTodo = async (id: string) => {
    // 1. Find current todo
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    // 2. Optimistic update: Update UI immediately
    setTodos(prev =>
      prev.map(t =>
        t.id === id
          ? { ...t, completed: !t.completed }
          : t
      )
    );

    try {
      // 3. Update on server
      const { error } = await minder(
        `/todos/${id}`,
        { completed: !todo.completed },
        { method: 'PUT' }
      );

      if (error) throw error;

      // 4. Success! UI already updated
    } catch (error) {
      // 5. Revert on error
      setTodos(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, completed: todo.completed } // Restore original
            : t
        )
      );

      alert('Failed to update todo');
    }
  };

  return { todos, toggleTodo };
}
```

**Benefits:**
- Instant UI feedback
- App feels faster
- Better UX
- Graceful error handling

---

## 8. Server-Side Rendering

### 8.1 Static Site Generation (SSG)

**Use Case**: Build HTML at build time

```typescript
// examples/nextjs/blog/pages/index.tsx
import { minder } from 'minder-data-provider';
import type { GetStaticProps } from 'next';

// Runs at BUILD time
export const getStaticProps: GetStaticProps = async () => {
  const { data } = await minder<Post[]>('/posts');

  return {
    props: {
      posts: data || [],
    },
  };
};

export default function Home({ posts }: { posts: Post[] }) {
  return (
    <div>
      <h1>Blog Posts</h1>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
        </article>
      ))}
    </div>
  );
}
```

**When to use:**
- Blog posts
- Product pages
- Documentation
- Marketing pages

**Benefits:**
- Ultra-fast loading
- SEO-optimized
- CDN-cacheable
- No server needed

---

### 8.2 Incremental Static Regeneration (ISR)

**Use Case**: Static + automatic updates

```typescript
// examples/nextjs/blog/pages/blog/[slug].tsx
import { minder } from 'minder-data-provider';
import type { GetStaticProps, GetStaticPaths } from 'next';

// Tell Next.js which pages to pre-build
export const getStaticPaths: GetStaticPaths = async () => {
  const { data } = await minder<Post[]>('/posts');
  
  const paths = (data || []).slice(0, 10).map(post => ({
    params: { slug: post.id.toString() },
  }));

  return {
    paths,
    fallback: 'blocking', // Generate on-demand for missing pages
  };
};

// Fetch data for each page
export const getStaticProps: GetStaticProps = async (context) => {
  const { slug } = context.params!;
  const { data } = await minder<Post>(`/posts/${slug}`);

  return {
    props: { post: data },
    revalidate: 60, // ✨ Regenerate every 60 seconds
  };
};

export default function BlogPost({ post }: { post: Post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

**How it works:**
1. Build static HTML at deploy
2. After 60 seconds, next request triggers rebuild
3. User sees old version while new one generates
4. New version ready for next request

**Benefits:**
- Static speed
- Always fresh data
- No full rebuild needed
- Best of both worlds

---

## 9. File Upload

### 9.1 Image Upload (Web)

**Use Case**: Upload files from browser

```typescript
// File upload with minder()
async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'products');

  const { data, error } = await minder<{ url: string }>(
    '/upload',
    formData,
    {
      method: 'POST',
      headers: {
        // Let browser set Content-Type with boundary
      },
    }
  );

  if (error) {
    throw new Error('Upload failed');
  }

  return data.url;
}

// Usage in component
function ImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const url = await uploadImage(file);
      setImageUrl(url);
    } catch (error) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <p>Uploading...</p>}
      {imageUrl && <img src={imageUrl} alt="Uploaded" />}
    </div>
  );
}
```

---

### 9.2 Image Upload (React Native/Expo)

**Use Case**: Upload from mobile camera/gallery

```typescript
// examples/expo/quickstart/App.tsx
import * as ImagePicker from 'expo-image-picker';
import { minder } from 'minder-data-provider';

async function uploadImageFromMobile() {
  // 1. Pick image from gallery
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });

  if (result.canceled) return;

  const imageUri = result.assets[0].uri;

  // 2. Upload to server
  const { data, error } = await minder('/upload', {
    file: {
      uri: imageUri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    },
  }, {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (error) {
    throw new Error('Upload failed');
  }

  return data.url;
}
```

---

## 10. Authentication

### 10.1 Token-Based Auth (Headers)

**Use Case**: JWT authentication

```typescript
// Save token after login
import * as SecureStore from 'expo-secure-store';

async function login(email: string, password: string) {
  const { data, error } = await minder<{ token: string }>(
    '/auth/login',
    { email, password },
    { method: 'POST' }
  );

  if (error) throw new Error('Login failed');

  // Save token securely
  await SecureStore.setItemAsync('authToken', data.token);

  return data.token;
}

// Use token in requests
async function fetchUserProfile() {
  const token = await SecureStore.getItemAsync('authToken');

  const { data, error } = await minder<User>(
    '/users/me',
    undefined,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
}
```

---

### 10.2 Global Auth Header

**Use Case**: Add auth to all requests

```typescript
// Configure globally
import { minder } from 'minder-data-provider';

// Set default headers
minder.config({
  baseURL: 'https://api.example.com',
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
});

// Now all requests include auth header
const { data } = await minder('/protected-route');
```

---

## 11. Rate Limiting

### 11.1 Server-Side Rate Limiting

**Use Case**: Prevent API abuse

```typescript
// examples/nodejs/api/src/middleware/rateLimiter.ts
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function rateLimiter(options: {
  windowMs: number;
  maxRequests: number;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();

    // Initialize or reset
    if (!store[identifier] || store[identifier].resetTime < now) {
      store[identifier] = {
        count: 0,
        resetTime: now + options.windowMs,
      };
    }

    // Increment
    store[identifier].count++;

    // Set headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', 
      Math.max(0, options.maxRequests - store[identifier].count)
    );

    // Check limit
    if (store[identifier].count > options.maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
        },
      });
    }

    next();
  };
}

// Usage
app.use(rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
}));
```

---

## 12. Platform-Specific Features

### 12.1 Secure Storage (Mobile)

**Use Case**: Store sensitive data encrypted

```typescript
// examples/expo/quickstart/App.tsx
import * as SecureStore from 'expo-secure-store';

// Save
await SecureStore.setItemAsync('userToken', 'abc123');
await SecureStore.setItemAsync('apiKey', 'secret');

// Load
const token = await SecureStore.getItemAsync('userToken');

// Delete
await SecureStore.deleteItemAsync('userToken');
```

**Platform:**
- iOS: Uses Keychain
- Android: Uses KeyStore
- Web: Not available

---

### 12.2 File System (Mobile)

**Use Case**: Download/cache files

```typescript
// examples/expo/quickstart/App.tsx
import * as FileSystem from 'expo-file-system';

// Download file
const downloadResumable = FileSystem.createDownloadResumable(
  'https://example.com/image.jpg',
  FileSystem.documentDirectory + 'image.jpg',
  {},
  (downloadProgress) => {
    const progress = downloadProgress.totalBytesWritten / 
                     downloadProgress.totalBytesExpectedToWrite;
    console.log(`Progress: ${Math.round(progress * 100)}%`);
  }
);

const result = await downloadResumable.downloadAsync();
console.log('Downloaded to:', result.uri);

// Read file
const content = await FileSystem.readAsStringAsync(result.uri);

// Delete file
await FileSystem.deleteAsync(result.uri);
```

---

### 12.3 AsyncStorage (React Native)

**Use Case**: Persistent key-value storage

```typescript
// examples/react-native/offline-todo/src/services/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Save
await AsyncStorage.setItem('todos', JSON.stringify(todos));

// Load
const todosJson = await AsyncStorage.getItem('todos');
const todos = todosJson ? JSON.parse(todosJson) : [];

// Remove
await AsyncStorage.removeItem('todos');

// Clear all
await AsyncStorage.clear();

// Multiple operations
await AsyncStorage.multiSet([
  ['key1', 'value1'],
  ['key2', 'value2'],
]);

const values = await AsyncStorage.multiGet(['key1', 'key2']);
```

---

## 🎯 Quick Reference

### Common Patterns

```typescript
// ✅ Basic GET
const { data } = useMinder<T>('/endpoint');

// ✅ POST with data
const { data } = await minder('/endpoint', payload, { method: 'POST' });

// ✅ With auth
const { data } = await minder('/endpoint', undefined, {
  headers: { Authorization: `Bearer ${token}` }
});

// ✅ Error handling
const { data, error } = await minder('/endpoint');
if (error) {
  // Handle error
}

// ✅ Loading state
const { data, isLoading } = useMinder('/endpoint');

// ✅ Optimistic update
setData(newValue); // Update UI
await minder('/endpoint', newValue, { method: 'PUT' }); // Sync

// ✅ Offline support
await saveToLocalStorage(data); // Save locally
await addToSyncQueue(operation); // Queue for sync
```

---

## 📚 Complete Examples

All code snippets are from working examples:

1. **Web E-commerce** - `examples/web/e-commerce/`
2. **Next.js Blog** - `examples/nextjs/blog/`
3. **Node.js API** - `examples/nodejs/api/`
4. **React Native Todo** - `examples/react-native/offline-todo/`
5. **Expo Quick Start** - `examples/expo/quickstart/`

Run any example:
```bash
cd examples/[example-name]
./setup.sh
npm run dev  # or npm start
```

---

**🎉 You now have complete code snippets for every feature!** Copy-paste these into your projects and customize as needed.
