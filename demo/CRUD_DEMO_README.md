# 🚀 Complete CRUD Operations Demo

A comprehensive demonstration of all CRUD (Create, Read, Update, Delete) operations using the `minder()` universal function with DummyJSON API.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
- [CRUD Operations](#crud-operations)
- [Code Examples](#code-examples)
- [API Reference](#api-reference)

## 🎯 Overview

This demo showcases:
- **CREATE** - Add new posts
- **READ** - Fetch all posts or single post
- **UPDATE** - Complete post update (PUT)
- **PATCH** - Partial post update
- **DELETE** - Remove posts
- **SEARCH** - Query posts by keyword
- **Bonus** - Fetch users list

All operations use the DummyJSON API (https://dummyjson.com) for demonstration purposes.

## ✨ Features

### ✅ Create Post
- Form-based post creation
- Title and body validation
- User ID assignment
- Success/error feedback
- Adds to live list instantly

### ✅ Read Operations
- **Get All Posts** - Fetch 10 posts with pagination
- **Get Single Post** - Fetch post by ID
- **Search Posts** - Query by keyword
- Displays detailed post information

### ✅ Update Operations
- **Full Update (PUT)** - Replace entire post
- **Partial Update (PATCH)** - Update specific fields
- Quick reaction increment button
- Edit existing posts

### ✅ Delete Posts
- Confirmation dialog
- Removes from list
- Success feedback

### ✅ User Management
- Fetch users list
- Display user cards
- Select fields (firstName, lastName, email)

## 🚀 Getting Started

### Prerequisites
```bash
cd demo
npm install
npm run dev
```

Visit: **http://localhost:5100/crud-demo**

## 📝 CRUD Operations

### 1. CREATE - Add New Post

**Method**: POST  
**Endpoint**: `https://dummyjson.com/posts/add`

```typescript
const result = await minder('https://dummyjson.com/posts/add', {
  title: 'My New Post',
  body: 'This is the content',
  userId: 1,
  reactions: 0
});

if (result.error) {
  console.error('Error:', result.error);
} else {
  console.log('Created post:', result.data);
  // result.data contains the new post with ID
}
```

**Response**:
```json
{
  "id": 151,
  "title": "My New Post",
  "body": "This is the content",
  "userId": 1,
  "reactions": 0
}
```

---

### 2. READ - Get All Posts

**Method**: GET  
**Endpoint**: `https://dummyjson.com/posts?limit=10`

```typescript
const result = await minder('https://dummyjson.com/posts?limit=10');

if (!result.error) {
  const posts = result.data.posts; // Array of posts
  console.log(`Loaded ${posts.length} posts`);
}
```

**Response**:
```json
{
  "posts": [
    {
      "id": 1,
      "title": "His mother had always taught him",
      "body": "His mother had always...",
      "userId": 9,
      "tags": ["history", "american", "crime"],
      "reactions": 2
    }
  ],
  "total": 150,
  "skip": 0,
  "limit": 10
}
```

---

### 3. READ - Get Single Post

**Method**: GET  
**Endpoint**: `https://dummyjson.com/posts/{id}`

```typescript
const result = await minder('https://dummyjson.com/posts/1');

if (!result.error) {
  console.log('Post:', result.data);
}
```

**Response**:
```json
{
  "id": 1,
  "title": "His mother had always taught him",
  "body": "His mother had always...",
  "userId": 9,
  "tags": ["history", "american", "crime"],
  "reactions": 2
}
```

---

### 4. UPDATE - Full Update (PUT)

**Method**: PUT  
**Endpoint**: `https://dummyjson.com/posts/{id}`

```typescript
const result = await minder('https://dummyjson.com/posts/1', {
  title: 'Updated Title',
  body: 'Updated content',
  userId: 1
}, {
  method: 'PUT'
});

if (!result.error) {
  console.log('Updated post:', result.data);
}
```

**Response**:
```json
{
  "id": 1,
  "title": "Updated Title",
  "body": "Updated content",
  "userId": 1
}
```

---

### 5. PATCH - Partial Update

**Method**: PATCH  
**Endpoint**: `https://dummyjson.com/posts/{id}`

```typescript
// Update only the reactions field
const result = await minder('https://dummyjson.com/posts/1', {
  reactions: 5
}, {
  method: 'PATCH'
});

if (!result.error) {
  console.log('Patched post:', result.data);
}
```

**Response**:
```json
{
  "id": 1,
  "title": "Original title (unchanged)",
  "body": "Original body (unchanged)",
  "userId": 9,
  "reactions": 5
}
```

---

### 6. DELETE - Remove Post

**Method**: DELETE  
**Endpoint**: `https://dummyjson.com/posts/{id}`

```typescript
const result = await minder('https://dummyjson.com/posts/1', {}, {
  method: 'DELETE'
});

if (!result.error) {
  console.log('Deleted post:', result.data);
}
```

**Response**:
```json
{
  "id": 1,
  "title": "His mother had always taught him",
  "body": "His mother had always...",
  "userId": 9,
  "isDeleted": true,
  "deletedOn": "2024-11-04T12:34:56.789Z"
}
```

---

### 7. SEARCH - Query Posts

**Method**: GET  
**Endpoint**: `https://dummyjson.com/posts/search?q={query}`

```typescript
const result = await minder('https://dummyjson.com/posts/search?q=love');

if (!result.error) {
  const posts = result.data.posts;
  console.log(`Found ${posts.length} posts matching "love"`);
}
```

**Response**:
```json
{
  "posts": [
    {
      "id": 5,
      "title": "Love is in the air",
      "body": "...",
      "userId": 2
    }
  ],
  "total": 3,
  "skip": 0,
  "limit": 30
}
```

---

### 8. BONUS - Get Users

**Method**: GET  
**Endpoint**: `https://dummyjson.com/users?limit=5&select=firstName,lastName,email`

```typescript
const result = await minder(
  'https://dummyjson.com/users?limit=5&select=firstName,lastName,email'
);

if (!result.error) {
  const users = result.data.users;
  users.forEach(user => {
    console.log(`${user.firstName} ${user.lastName} - ${user.email}`);
  });
}
```

**Response**:
```json
{
  "users": [
    {
      "id": 1,
      "firstName": "Emily",
      "lastName": "Johnson",
      "email": "emily.johnson@example.com"
    }
  ],
  "total": 208,
  "skip": 0,
  "limit": 5
}
```

---

## 💡 Code Examples

### Complete Create Post Function

```typescript
const handleCreatePost = async () => {
  if (!newPost.title || !newPost.body) {
    showMessage('Please fill in all fields', 'error');
    return;
  }

  setLoading(true);
  try {
    const result = await minder('https://dummyjson.com/posts/add', {
      title: newPost.title,
      body: newPost.body,
      userId: newPost.userId,
      reactions: 0
    });

    if (result.error) {
      showMessage('❌ Failed to create post', 'error');
    } else {
      const createdPost = result.data as Post;
      setPosts([createdPost, ...posts]);
      setNewPost({ title: '', body: '', userId: 1 });
      showMessage(`✅ Post created successfully! ID: ${createdPost.id}`);
    }
  } catch (error) {
    console.error('Create error:', error);
    showMessage('❌ Failed to create post', 'error');
  } finally {
    setLoading(false);
  }
};
```

### Increment Reactions (PATCH Example)

```typescript
const handleIncrementReactions = async (postId: number, currentReactions: number) => {
  const result = await minder(`https://dummyjson.com/posts/${postId}`, {
    reactions: currentReactions + 1
  }, {
    method: 'PATCH'
  });

  if (!result.error) {
    // Update post in state
    setPosts(posts.map(p => 
      p.id === postId ? result.data : p
    ));
  }
};
```

### Delete with Confirmation

```typescript
const handleDeletePost = async (postId: number) => {
  if (!confirm(`Are you sure you want to delete post #${postId}?`)) {
    return;
  }

  setLoading(true);
  try {
    const result = await minder(`https://dummyjson.com/posts/${postId}`, {}, {
      method: 'DELETE'
    });

    if (!result.error) {
      setPosts(posts.filter(p => p.id !== postId));
      showMessage(`✅ Post #${postId} deleted successfully!`);
    }
  } finally {
    setLoading(false);
  }
};
```

## 📚 API Reference

### DummyJSON Endpoints Used

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Get All Posts | GET | `/posts?limit=10` | Fetch posts with pagination |
| Get Single Post | GET | `/posts/{id}` | Fetch specific post |
| Create Post | POST | `/posts/add` | Add new post |
| Update Post | PUT | `/posts/{id}` | Replace entire post |
| Patch Post | PATCH | `/posts/{id}` | Update specific fields |
| Delete Post | DELETE | `/posts/{id}` | Remove post |
| Search Posts | GET | `/posts/search?q={query}` | Search by keyword |
| Get Users | GET | `/users?limit=5&select=fields` | Fetch users |

### minder() Function Signatures

```typescript
// GET request (default)
minder(url: string)

// POST request (with data)
minder(url: string, data: object)

// Custom method
minder(url: string, data: object, options: { method: 'PUT' | 'PATCH' | 'DELETE' })
```

### Result Object Structure

```typescript
interface MinderResult<T> {
  data: T | null;
  error: Error | null;
  loading?: boolean;
}
```

## 🎨 UI Features

- **Real-time Updates** - List updates instantly after operations
- **Loading States** - Visual feedback during API calls
- **Error Handling** - Clear error messages
- **Success Messages** - Confirmation after successful operations
- **Form Validation** - Client-side validation before submission
- **Responsive Design** - Works on all screen sizes
- **Card Layout** - Clean, organized post display
- **Quick Actions** - Edit, Like, Delete buttons on each post

## 🔧 Technical Details

### State Management
```typescript
const [posts, setPosts] = useState<Post[]>([]);
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState('');
```

### Form States
```typescript
const [newPost, setNewPost] = useState({
  title: '',
  body: '',
  userId: 1
});

const [editPost, setEditPost] = useState({
  id: 0,
  title: '',
  body: '',
  userId: 1
});
```

### Post Interface
```typescript
interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
  reactions?: number;
  tags?: string[];
}
```

## 🎯 Best Practices Demonstrated

1. **Error Handling** - Always check for `result.error`
2. **Loading States** - Show feedback during async operations
3. **Validation** - Validate input before API calls
4. **Optimistic Updates** - Update UI immediately for better UX
5. **Type Safety** - TypeScript interfaces for data structures
6. **Clean Code** - Organized, readable, maintainable
7. **User Feedback** - Clear success/error messages

## 🌐 Live Demo

Visit: **http://localhost:5100/crud-demo**

Try all operations:
1. **Create** - Fill the form and click "Create New Post"
2. **Read** - Click "Get All Posts" or "Get Post #1"
3. **Update** - Click "Edit" on any post, modify, and update
4. **React** - Click "👍 +1" to increment reactions (PATCH)
5. **Delete** - Click "Delete" on any post
6. **Search** - Click "Search 'love'" to search posts
7. **Users** - Click "Get Users" to fetch user list

## 📖 Learn More

- [DummyJSON Documentation](https://dummyjson.com/docs/)
- [Minder Data Provider](https://github.com/your-repo)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Built with ❤️ using minder() universal function**
