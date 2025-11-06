# 01. Data Fetching - Different Approaches & When to Use Each

> **Scenario**: You need to fetch user data from an API  
> **Question**: Should I use `minder()`, `useMinder()`, or `useOneTouchCrud()`?

---

## 📊 Quick Comparison Table

| Feature | `minder()` | `useMinder()` | `useOneTouchCrud()` |
|---------|-----------|---------------|---------------------|
| **Bundle Size** | ~2KB | ~5KB | ~8KB |
| **React Required** | ❌ No | ✅ Yes | ✅ Yes |
| **Auto-fetch** | ❌ Manual | ✅ Yes | ✅ Yes |
| **Loading States** | Manual | ✅ Auto | ✅ Auto |
| **Caching** | Manual | ✅ Auto | ✅ Auto |
| **CRUD Operations** | Manual | Manual | ✅ Auto |
| **Mutations** | ✅ Yes | ✅ Yes | ✅ Auto |
| **SSR Support** | ✅ Yes | ✅ Yes | ⚠️ CSR only |
| **Use Case** | APIs, SSR, Node | Components | Admin panels |

---

## 🎯 Approach 1: Pure `minder()` Function

### ✅ When to Use
- Building REST APIs (Next.js API routes, Express)
- Server-side rendering (SSR)
- Node.js scripts
- Minimal bundle size critical
- Non-React environments
- Full control over data flow

### ❌ When NOT to Use
- React components with reactive state (use `useMinder()`)
- Need automatic loading states
- Want built-in caching

### 📦 Bundle Impact
**Added**: ~2KB  
**Total**: ~2KB

---

### Example 1.1: Next.js API Route

```typescript
// pages/api/users.ts
import { minder } from 'minder-data-provider';

export default async function handler(req, res) {
  // Fetch from external API
  const { data, error, success } = await minder('https://api.example.com/users');
  
  if (!success) {
    return res.status(500).json({ error: error.message });
  }
  
  return res.status(200).json(data);
}
```

**Why this approach?**
- ✅ Runs on server (no client bundle impact)
- ✅ No React overhead
- ✅ Direct error handling
- ✅ Can add server-side auth, caching, etc.

---

### Example 1.2: Next.js SSR (getServerSideProps)

```typescript
// pages/users.tsx
import { minder } from 'minder-data-provider';

export async function getServerSideProps(context) {
  const { data, error } = await minder('https://api.example.com/users', {
    headers: {
      Cookie: context.req.headers.cookie
    }
  });
  
  if (error) {
    return {
      props: { users: [] }
    };
  }
  
  return {
    props: { users: data }
  };
}

export default function UsersPage({ users }) {
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

**Why this approach?**
- ✅ SEO-friendly (rendered on server)
- ✅ Fast initial load
- ✅ Auth cookies available
- ✅ No loading spinner (data ready)

---

### Example 1.3: Node.js Script

```typescript
// scripts/fetch-users.ts
import { minder, configureMinder } from 'minder-data-provider';

// Configure base URL
configureMinder({
  baseURL: 'https://api.example.com',
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`
  }
});

async function fetchAllUsers() {
  const { data, error, success } = await minder('users');
  
  if (!success) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
  
  console.log(`Fetched ${data.length} users`);
  return data;
}

fetchAllUsers();
```

**Why this approach?**
- ✅ No browser environment needed
- ✅ Can use environment variables
- ✅ Perfect for scripts, cron jobs
- ✅ Minimal dependencies

---

### Example 1.4: Manual Control in React (Not Recommended)

```typescript
// ❌ DON'T DO THIS - Use useMinder() instead
import { useState, useEffect } from 'react';
import { minder } from 'minder-data-provider';

function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchUsers() {
      setLoading(true);
      const { data } = await minder('users');
      setUsers(data || []);
      setLoading(false);
    }
    fetchUsers();
  }, []);
  
  if (loading) return <div>Loading...</div>;
  return <ul>{/* render users */}</ul>;
}
```

**Why NOT to do this?**
- ❌ Manual loading state management
- ❌ No caching (refetches on every mount)
- ❌ No error handling
- ❌ Race conditions possible
- ❌ Memory leaks if unmounted during fetch
- ❌ No deduplication (multiple instances = multiple requests)

**Use `useMinder()` instead** (see Approach 2)

---

## 🎯 Approach 2: `useMinder()` Hook

### ✅ When to Use
- React components
- Need reactive loading/error states
- Want automatic caching
- Need refetch on focus/reconnect
- Standard data fetching
- Good balance of features and bundle size

### ❌ When NOT to Use
- Server-side code (use `minder()`)
- Need full CRUD operations (use `useOneTouchCrud()`)
- Minimal bundle critical (use `minder()`)

### 📦 Bundle Impact
**Added**: ~5KB  
**Total**: ~5KB

---

### Example 2.1: Simple Auto-fetch

```typescript
import { useMinder } from 'minder-data-provider';

function UserList() {
  const { data, loading, error } = useMinder<User[]>('users');
  
  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <ul>
      {data.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

**Why this approach?**
- ✅ Auto-fetches on mount
- ✅ Loading state handled
- ✅ Error handling included
- ✅ Automatic caching (refetches are instant)
- ✅ Deduplication (multiple instances share data)
- ✅ Refetches on window focus

---

### Example 2.2: Manual Fetch Control

```typescript
import { useMinder } from 'minder-data-provider';

function SearchUsers() {
  const [query, setQuery] = useState('');
  
  const { data, loading, refetch } = useMinder<User[]>('users', {
    autoFetch: false // Don't fetch on mount
  });
  
  const handleSearch = async () => {
    await refetch({ params: { q: query } });
  };
  
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={handleSearch} disabled={loading}>
        Search
      </button>
      
      {data && (
        <ul>
          {data.map(user => <li key={user.id}>{user.name}</li>)}
        </ul>
      )}
    </>
  );
}
```

**Why this approach?**
- ✅ Controlled fetching (on button click)
- ✅ Can pass dynamic params
- ✅ Loading state during search
- ✅ No unnecessary initial fetch

---

### Example 2.3: Mutations (Create/Update/Delete)

```typescript
import { useMinder } from 'minder-data-provider';

function CreateUser() {
  const { mutate, loading, error, success } = useMinder<User>('users');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const result = await mutate({
      name: formData.get('name'),
      email: formData.get('email')
    });
    
    if (result.success) {
      alert('User created!');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create User'}
      </button>
      {error && <div className="error">{error.message}</div>}
    </form>
  );
}
```

**Why this approach?**
- ✅ Loading state during submission
- ✅ Error handling
- ✅ Success detection
- ✅ Auto cache invalidation
- ✅ Optimistic updates possible

---

### Example 2.4: Polling / Auto-refresh

```typescript
import { useMinder } from 'minder-data-provider';

function LiveDashboard() {
  const { data, loading } = useMinder<Stats>('dashboard/stats', {
    refetchInterval: 5000, // Poll every 5 seconds
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
  
  return (
    <div>
      <h1>Live Stats {loading && '🔄'}</h1>
      <div>Active Users: {data?.activeUsers}</div>
      <div>Revenue: ${data?.revenue}</div>
    </div>
  );
}
```

**Why this approach?**
- ✅ Real-time updates without WebSocket
- ✅ Auto-refresh on tab focus
- ✅ Reconnection handling
- ✅ Minimal bandwidth (cached responses)

---

### Example 2.5: Dependent Queries

```typescript
import { useMinder } from 'minder-data-provider';

function UserProfile({ userId }) {
  // Fetch user first
  const { data: user, loading: userLoading } = useMinder<User>(
    `users/${userId}`
  );
  
  // Then fetch user's posts (only when user is loaded)
  const { data: posts, loading: postsLoading } = useMinder<Post[]>(
    `users/${userId}/posts`,
    {
      enabled: !!user // Only fetch if user exists
    }
  );
  
  if (userLoading) return <div>Loading user...</div>;
  if (!user) return <div>User not found</div>;
  
  return (
    <div>
      <h1>{user.name}</h1>
      <h2>Posts</h2>
      {postsLoading ? (
        <div>Loading posts...</div>
      ) : (
        <ul>
          {posts.map(post => <li key={post.id}>{post.title}</li>)}
        </ul>
      )}
    </div>
  );
}
```

**Why this approach?**
- ✅ Sequential fetching (posts only after user)
- ✅ Prevents unnecessary requests
- ✅ Clean loading states
- ✅ Type-safe

---

### Example 2.6: Optimistic Updates

```typescript
import { useMinder } from 'minder-data-provider';

function TodoItem({ todo }) {
  const { mutate } = useMinder<Todo>(`todos/${todo.id}`);
  
  const toggleComplete = async () => {
    // Optimistic update
    await mutate(
      { completed: !todo.completed },
      {
        optimisticData: { ...todo, completed: !todo.completed },
        rollbackOnError: true // Auto-rollback if fails
      }
    );
  };
  
  return (
    <div>
      <input 
        type="checkbox" 
        checked={todo.completed} 
        onChange={toggleComplete}
      />
      <span>{todo.title}</span>
    </div>
  );
}
```

**Why this approach?**
- ✅ Instant UI feedback
- ✅ No loading spinner
- ✅ Auto-rollback on error
- ✅ Better UX

---

## 🎯 Approach 3: `useOneTouchCrud()` Hook

### ✅ When to Use
- Admin panels / dashboards
- Full CRUD operations needed
- Want zero-config CRUD
- Listing + Create + Update + Delete
- Don't want to manage separate mutations

### ❌ When NOT to Use
- Simple data fetching (use `useMinder()`)
- Minimal bundle critical (use `minder()`)
- Custom mutation logic needed
- Server-side code

### 📦 Bundle Impact
**Added**: ~8KB  
**Total**: ~8KB

---

### Example 3.1: Complete Admin Panel

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';

function UsersAdmin() {
  const {
    data: users,
    loading,
    operations
  } = useOneTouchCrud<User>('users');
  
  const handleCreate = async () => {
    const newUser = { name: 'John', email: 'john@example.com' };
    await operations.create(newUser);
    // ✅ Auto-refetches list
    // ✅ Auto-invalidates cache
  };
  
  const handleUpdate = async (id, changes) => {
    await operations.update(id, changes);
    // ✅ Auto-refetches list
  };
  
  const handleDelete = async (id) => {
    if (confirm('Delete user?')) {
      await operations.delete(id);
      // ✅ Auto-refetches list
    }
  };
  
  if (loading.fetch) return <div>Loading...</div>;
  
  return (
    <div>
      <button onClick={handleCreate} disabled={loading.create}>
        {loading.create ? 'Creating...' : 'Add User'}
      </button>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>
                <button 
                  onClick={() => handleUpdate(user.id, { name: 'Updated' })}
                  disabled={loading.update}
                >
                  Edit
                </button>
                <button 
                  onClick={() => handleDelete(user.id)}
                  disabled={loading.delete}
                >
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

**Why this approach?**
- ✅ Zero-config CRUD (no manual cache updates)
- ✅ Separate loading states per operation
- ✅ Auto-refetch after mutations
- ✅ Clean API
- ✅ Perfect for admin UIs

---

### Example 3.2: With Form Validation

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';
import { useState } from 'react';

function ProductsAdmin() {
  const [form, setForm] = useState({ name: '', price: 0 });
  const [errors, setErrors] = useState({});
  
  const { data: products, loading, operations } = useOneTouchCrud<Product>('products');
  
  const validate = () => {
    const errs = {};
    if (!form.name) errs.name = 'Name required';
    if (form.price <= 0) errs.price = 'Price must be positive';
    return errs;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    
    const result = await operations.create(form);
    
    if (result.success) {
      setForm({ name: '', price: 0 }); // Reset form
      setErrors({});
    } else {
      alert(`Error: ${result.error.message}`);
    }
  };
  
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          placeholder="Product name"
        />
        {errors.name && <span className="error">{errors.name}</span>}
        
        <input
          type="number"
          value={form.price}
          onChange={e => setForm({ ...form, price: Number(e.target.value) })}
          placeholder="Price"
        />
        {errors.price && <span className="error">{errors.price}</span>}
        
        <button type="submit" disabled={loading.create}>
          {loading.create ? 'Adding...' : 'Add Product'}
        </button>
      </form>
      
      <ul>
        {products?.map(product => (
          <li key={product.id}>
            {product.name} - ${product.price}
            <button onClick={() => operations.delete(product.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Why this approach?**
- ✅ Validation before submission
- ✅ Error handling
- ✅ Form reset on success
- ✅ Auto-refetch list

---

### Example 3.3: Manual Fetch Control

```typescript
import { useOneTouchCrud } from 'minder-data-provider/crud';

function FilteredProducts() {
  const [category, setCategory] = useState('');
  
  const { data, loading, operations } = useOneTouchCrud<Product>('products', {
    autoFetch: false // Manual control
  });
  
  const handleFilter = () => {
    operations.fetch({ params: { category } });
  };
  
  return (
    <>
      <select value={category} onChange={e => setCategory(e.target.value)}>
        <option value="">All</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      
      <button onClick={handleFilter} disabled={loading.fetch}>
        Filter
      </button>
      
      {data && (
        <ul>
          {data.map(product => <li key={product.id}>{product.name}</li>)}
        </ul>
      )}
    </>
  );
}
```

**Why this approach?**
- ✅ No initial fetch
- ✅ Fetch with dynamic params
- ✅ Full CRUD still available

---

## 🎯 Real-World Decision Tree

```
Need to fetch data?
│
├─ In React component?
│  │
│  ├─ YES → Use React hooks
│  │        │
│  │        ├─ Just fetching data?
│  │        │  └─ Use useMinder() ✅
│  │        │
│  │        ├─ Need full CRUD?
│  │        │  └─ Use useOneTouchCrud() ✅
│  │        │
│  │        └─ Custom complex logic?
│  │           └─ Use useMinder() + manual mutations ✅
│  │
│  └─ NO → Use minder() function
│           │
│           ├─ Next.js API route?
│           │  └─ Use minder() ✅
│           │
│           ├─ getServerSideProps?
│           │  └─ Use minder() ✅
│           │
│           ├─ Node.js script?
│           │  └─ Use minder() ✅
│           │
│           └─ Express API?
│              └─ Use minder() ✅
```

---

## 📊 Performance Comparison

### Scenario: Fetch 100 users in a list

| Approach | Bundle Size | Initial Load | Cache Hit | Memory | Network |
|----------|-------------|--------------|-----------|---------|---------|
| `minder()` (manual) | 2KB | Manual | Manual | Low | Multiple |
| `useMinder()` | 5KB | Auto | Auto | Medium | Deduped |
| `useOneTouchCrud()` | 8KB | Auto | Auto | Medium | Deduped |

**Winner for Performance**: `useMinder()` (best balance)

---

### Scenario: Admin panel with CRUD

| Approach | LOC | Complexity | Auto-refetch | Error Handling |
|----------|-----|------------|--------------|----------------|
| `minder()` | ~150 | High | Manual | Manual |
| `useMinder()` | ~80 | Medium | Manual | Auto |
| `useOneTouchCrud()` | ~40 | Low | ✅ Auto | Auto |

**Winner for Productivity**: `useOneTouchCrud()` (less code)

---

### Scenario: SSR page

| Approach | Supported | Hydration | SEO | Complexity |
|----------|-----------|-----------|-----|------------|
| `minder()` | ✅ | ✅ | ✅ | Low |
| `useMinder()` | ✅ | ✅ | ✅ | Medium |
| `useOneTouchCrud()` | ⚠️ CSR | ⚠️ | ❌ | High |

**Winner for SSR**: `minder()` (designed for it)

---

## 🎯 Common Scenarios & Recommendations

### 1. E-commerce Product List
**Recommendation**: `useMinder()`
- ✅ Auto-fetch on page load
- ✅ Cache for instant back navigation
- ✅ Refetch on focus for fresh data
- ❌ Don't need full CRUD (read-only for users)

```typescript
const { data: products } = useMinder<Product[]>('products');
```

---

### 2. Admin Dashboard
**Recommendation**: `useOneTouchCrud()`
- ✅ Full CRUD operations
- ✅ Auto-refetch after mutations
- ✅ Less boilerplate
- ✅ Separate loading states

```typescript
const { data, operations } = useOneTouchCrud<User>('users');
```

---

### 3. Next.js API Route
**Recommendation**: `minder()`
- ✅ Server-side only
- ✅ No client bundle
- ✅ Full control
- ❌ React not needed

```typescript
const { data } = await minder('https://external-api.com/data');
```

---

### 4. SSR Blog Page
**Recommendation**: `minder()` in getServerSideProps
- ✅ SEO optimized
- ✅ Fast initial render
- ✅ Auth cookies available
- ❌ No client-side reactivity needed

```typescript
export async function getServerSideProps() {
  const { data } = await minder('posts');
  return { props: { posts: data } };
}
```

---

### 5. Real-time Chat Messages
**Recommendation**: `useMinder()` + polling OR `useWebSocket()`
- For polling: `useMinder()` with `refetchInterval`
- For real-time: `useWebSocket()` (see WebSocket examples)

```typescript
// Polling approach
const { data } = useMinder('messages', { refetchInterval: 2000 });

// WebSocket approach
const ws = useWebSocket();
ws.subscribe('newMessage', handleNewMessage);
```

---

### 6. Mobile App (React Native)
**Recommendation**: `useMinder()` OR `useOneTouchCrud()`
- Same as web (platform-agnostic)
- Auto-detects platform capabilities
- Uses AsyncStorage for caching

```typescript
const { data } = useMinder('users'); // Works on iOS, Android
```

---

### 7. Background Script / Cron Job
**Recommendation**: `minder()`
- ✅ No React needed
- ✅ Simple async function
- ✅ Environment variables
- ❌ No caching needed

```typescript
const { data } = await minder('api/sync-data');
```

---

## 🎓 Key Takeaways

### Use `minder()` when:
1. Server-side code (API routes, SSR, Node.js)
2. Minimal bundle size critical
3. Full manual control needed
4. Non-React environment

### Use `useMinder()` when:
1. React components
2. Simple data fetching
3. Want auto-caching
4. Need loading/error states
5. Good balance of features/size

### Use `useOneTouchCrud()` when:
1. Admin panels
2. Full CRUD operations
3. Want zero-config
4. Productivity over bundle size

---

## 📚 Related Examples
- [02. Mutations & Updates](./02-MUTATIONS-APPROACHES.md)
- [03. Authentication](./03-AUTHENTICATION-APPROACHES.md)
- [04. Caching Strategies](./04-CACHING-APPROACHES.md)

---

**Last Updated**: November 6, 2025  
**Version**: 2.1.x
