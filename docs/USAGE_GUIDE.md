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

> **2.2.0 note:** `useAuth` used to mean different things depending on the subpath
> you imported it from, and this section previously documented a fourth shape that
> no shipped `useAuth` ever returned (`login`/`logout`/`isAuthenticated` — those
> examples threw at runtime). As of 2.2.0, `useAuth` is **one hook, everywhere**:
> the capability-contract hook backed by a registered certified provider (Clerk,
> Firebase, Supabase, Razorpay's auth, etc. — see `docs/providers/CATALOG.md`). See
> `docs/MIGRATION_GUIDE.md` if you were relying on `setToken`/`getToken`/
> `clearAuth`/`isLoggedIn` from `minder-data-provider/auth` — that hook is now
> named `useAuthToken`.

`useAuth` manages a session backed by whichever certified provider you've
registered. It never issues network requests itself — the provider's SDK does —
`useAuth` just gives you a consistent shape to read it through.

### 1. Reading session state

```typescript
import { useAuth } from 'minder-data-provider/auth'; // also available from the
                                                        // root, /web, /nextjs, /electron

function ProtectedPage() {
  const { ready, error, session, signOut } = useAuth();

  // `ready` is false until a certified provider has been registered AND its
  // session lookup has resolved. No provider registered => ready stays false
  // and `error.code` is 'NO_PROVIDER_FOR_CAPABILITY'.
  if (!ready) return <Login />;
  if (error) return <div>Auth error: {error.message}</div>;
  if (!session) return <Login />;

  return (
    <div>
      Welcome, {session.userId}
      <button onClick={() => signOut()}>Log out</button>
    </div>
  );
}
```

### 2. Signing out

```typescript
const { signOut } = useAuth();

async function handleLogout() {
  await signOut(); // delegates to the registered provider's signOut()
}
```

### 3. Reaching the underlying provider client

```typescript
const { getProviderClient } = useAuth();

const clerkClient = getProviderClient(); // typed as `unknown` — cast to your
                                          // provider's client type as needed
```

> **Migrating from pre-2.2.0 code?** `useAuth().setToken`/`getToken`/`clearAuth`/
> `isLoggedIn` (the old token-storage shape) now throw a directed `MinderError`
> (`USE_AUTH_LEGACY_ACCESSOR_REMOVED`) naming `useAuthToken()` instead of failing
> with a generic `TypeError`. See `useAuthToken` below for the hook that shape
> actually belongs to.

### `useAuthToken` — raw client-side token storage

If you're not using a certified provider and just need to persist a raw
JWT/opaque token client-side (with `AuthManager`-backed storage and an
auth-state subscription), use `useAuthToken` instead. This is a different hook
with a different shape — it does **not** model a provider session. No
`<MinderDataProvider>` is required: outside one, `useAuthToken()` falls back to
a standalone token manager (a one-shot check on mount, no live subscription);
mount a `<MinderDataProvider>` to get auth-state change notifications too.

```typescript
import { minder } from 'minder-data-provider';
import { useAuthToken } from 'minder-data-provider/auth';

function Login() {
  const { setToken, getToken, isLoggedIn, clearAuth } = useAuthToken();
  const [email, setEmail] = useState('');

  const handleLogin = async () => {
    // minder() never throws — it returns a structured MinderResult, so the
    // response body is under `data`, not the top-level result.
    const { data, error } = await minder('auth/login', { email, password: '...' });
    if (error || !data) return;
    setToken(data.token);
  };

  if (isLoggedIn) {
    return <button onClick={() => clearAuth()}>Log out</button>;
  }

  return <button onClick={handleLogin}>Log In</button>;
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
import { useDebounce } from 'minder-data-provider';
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
`minder-data-provider/hook` is a legacy re-export path (`useMinder`,
`MinderDataProvider`, `useMinderContext`) — prefer the root or `/core` entry
for new code. `useMinder` itself does **not** require `<MinderDataProvider>`:
like every other entry, it also works standalone once `configureMinder()` has
registered routes.

```typescript
import { useMinder } from 'minder-data-provider/hook';
```

See the README "Bundle Cost" section for this entry's actual measured size
(`npm run measure:bundles`, `hook` row) rather than a guessed figure.

### Logger Utility
If you need the internal logger:

```typescript
import { defaultLogger } from 'minder-data-provider/logger';

defaultLogger.info('My App', 'Something happened');
```
