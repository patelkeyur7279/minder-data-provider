# 📘 Minder Usage Guide

This guide covers how to use Minder Data Provider functionalities, detailing how to use each hook with code snippets.

## Table of Contents
1.  [Core: Data Fetching & Mutations](#core-data-fetching--mutations-useminder)
2.  [Authentication](#authentication-useauth)
3.  [Real-Time & WebSocket](#real-time--websocket-usewebsocket)
4.  [File Upload](#file-upload-usemediaupload)
5.  [Performance Tools](#performance-tools)
6.  [Bundle Optimization](#bundle-optimization)

---

## Core: Data Fetching & Mutations (`useMinder`)

The `useMinder` hook is the primary tool for data interaction. It combines fetching (GET) and mutations (POST/PUT/DELETE) in one predictable API.

### 1. Fetching Data (GET)
Use `useMinder` with a simple route name. It auto-fetches by default.

```typescript
import { useMinder } from 'minder-data-provider';

function UserList() {
  const { data, loading, error } = useMinder('users');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

### 2. Manual Mutations (POST/PUT/DELETE)
Every `useMinder` call returns an `operations` object with `create`, `update`, `delete`.

```typescript
import { useMinder } from 'minder-data-provider';

function CreateUserForm() {
  // autoFetch: false because we don't need to load users first
  const { operations, loading } = useMinder('users', { autoFetch: false });

  const handleSubmit = async (userData) => {
    try {
      // Calls POST /users
      const newUser = await operations.create(userData);
      console.log('User created:', newUser);
    } catch (err) {
      console.error('Create failed', err);
    }
  }

  // Update existing user (calls PUT /users/:id)
  const handleUpdate = async (id, updates) => {
    await operations.update(id, updates);
  }

  // Delete user (calls DELETE /users/:id)
  const handleDelete = async (id) => {
    await operations.delete(id);
  }
}
```

### 3. Dynamic Routes (Parameters)
Handle routes like `/users/:id` or query parameters.

```typescript
// Fetch specific user: GET /users/123
const { data: user } = useMinder('users/123');

// Fetch with query params: GET /users?status=active
const { data } = useMinder('users', {
  params: { status: 'active' }
});

// Fetch with dynamic path (if defined in routes as /users/:id)
const { data } = useMinder('users', {
  params: { id: '123' } // Will replace :id in URL
});
```

---

## Authentication (`useAuth`)

Manage user sessions, login, and route protection.

### 1. Login & Logout

```typescript
import { useAuth } from 'minder-data-provider/auth';

function Login() {
  const { login, logout, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');

  const handleLogin = async () => {
    try {
      // POSTs to your configured auth endpoint
      await login({ email, password: '...' });
    } catch (err) {
      alert('Login failed');
    }
  };

  return (
    <button onClick={handleLogin}>Log In</button>
  );
}
```

### 2. Protecting Routes
Check `isAuthenticated` to gate access.

```typescript
import { useAuth } from 'minder-data-provider/auth';

function ProtectedPage() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <Login />;

  return <div>Welcome, {user.name}</div>;
}
```

---

## Real-Time & WebSocket (`useWebSocket`)

Connect to a WebSocket server for live updates. Requires `websocket` to be enabled in config.

```typescript
import { useWebSocket } from 'minder-data-provider/websocket';
import { useEffect } from 'react';

function LiveChat() {
  // Connects to configured websocket URL
  const { send, subscribe, isConnected } = useWebSocket();

  useEffect(() => {
    // Listen for 'message' events
    const unsubscribe = subscribe('message', (payload) => {
      console.log('New message:', payload);
    });
    return () => unsubscribe();
  }, [subscribe]);

  const sendMessage = () => {
    send('message', { text: 'Hello World' });
  };

  return <div>Status: {isConnected ? 'Online' : 'Offline'}</div>;
}
```

---

## File Upload (`useMediaUpload`)

Handle uploads with progress tracking automatically.

```typescript
import { useMediaUpload } from 'minder-data-provider/upload';

function Uploader() {
  // 'files' is the route name for upload, usually POST /files
  const { uploadFile, progress, isUploading } = useMediaUpload('files');

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const result = await uploadFile(file);
      console.log('Uploaded to:', result.url);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {isUploading && <progress value={progress.percentage} max="100" />}
    </div>
  );
}
```

---

## Performance Tools

### Debouncing Search (`useDebounce`)
Prevent API floods while typing.

```typescript
import { useDebounce } from 'minder-data-provider/utils/performance';
import { useMinder } from 'minder-data-provider';

function Search() {
  const [text, setText] = useState('');
  const debouncedText = useDebounce(text, 500); // 500ms delay

  // Only refetches when debouncedText changes
  const { data } = useMinder('search', {
    params: { q: debouncedText }
  });

  return <input onChange={e => setText(e.target.value)} />;
}
```

---

## Bundle Optimization

### Hook-Only Import
If you *only* need the `useMinder` hook and want to save ~20KB without importing axios/utils:

```typescript
// ⚠️ Only works inside <MinderDataProvider>
import { useMinder } from 'minder-data-provider/hook';
```

### Logger Utility
If you need the internal logger:

```typescript
import { defaultLogger } from 'minder-data-provider/logger';

defaultLogger.info('My App', 'Something happened');
```
