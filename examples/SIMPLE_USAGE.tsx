import React, { useState } from 'react';
import { 
  MinderDataProvider, 
  useMinder, 
  useAuth, 
  useMediaUpload 
} from 'minder-data-provider';

// ============================================================================
// 1. CONFIGURATION
// ============================================================================

const config = {
  apiBaseUrl: 'https://api.example.com',
  routes: {
    // Define your API routes here
    login: { method: 'POST', url: '/auth/login' },
    posts: { method: 'GET', url: '/posts' },
    createPost: { method: 'POST', url: '/posts' },
    upload: { method: 'POST', url: '/upload' },
  },
  // Optional: Configure global cache settings
  cache: {
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
  }
};

// ============================================================================
// 2. MAIN APP COMPONENT
// ============================================================================

export default function App() {
  return (
    // Wrap your app with MinderDataProvider
    <MinderDataProvider config={config}>
      <MainContent />
    </MinderDataProvider>
  );
}

// ============================================================================
// 3. FEATURE EXAMPLES
// ============================================================================

function MainContent() {
  const { isAuthenticated, user, setToken, clearAuth } = useAuth();

  if (!isAuthenticated()) {
    return <LoginScreen onLogin={setToken} />;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Welcome, {user?.name}</h1>
      <button onClick={clearAuth}>Logout</button>
      
      <hr />
      
      <CreatePostForm />
      
      <hr />
      
      <PostList />
    </div>
  );
}

// --- AUTHENTICATION EXAMPLE ---

function LoginScreen({ onLogin }) {
  // You can use useMinder for the login request itself
  const { mutate: login, loading, error } = useMinder('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login({ email, password });
    
    if (result.success) {
      // Save the token - this automatically updates auth state everywhere
      onLogin(result.data.token);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      {error && <p style={{ color: 'red' }}>{error.message}</p>}
      
      <input 
        placeholder="Email" 
        value={email} 
        onChange={e => setEmail(e.target.value)} 
      />
      <input 
        type="password" 
        placeholder="Password" 
        value={password} 
        onChange={e => setPassword(e.target.value)} 
      />
      
      <button disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

// --- DATA FETCHING EXAMPLE ---

function PostList() {
  // Fetch data automatically on mount
  const { 
    data: posts, 
    loading, 
    error, 
    refetch 
  } = useMinder('posts');

  if (loading) return <p>Loading posts...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <h2>Recent Posts</h2>
      <button onClick={refetch}>Refresh</button>
      
      <ul>
        {posts?.map(post => (
          <li key={post.id}>
            <h3>{post.title}</h3>
            <p>{post.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- MUTATION & FILE UPLOAD EXAMPLE ---

function CreatePostForm() {
  // Mutation for creating a post
  const { mutate: createPost, loading: creating } = useMinder('createPost');
  
  // Dedicated hook for file uploads
  const { uploadFile, progress, isUploading } = useMediaUpload('upload');
  
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let imageUrl = '';
    
    // 1. Upload file first if exists
    if (file) {
      try {
        const uploadResult = await uploadFile(file);
        imageUrl = uploadResult.url;
      } catch (err) {
        alert('Upload failed');
        return;
      }
    }
    
    // 2. Create post with image URL
    const result = await createPost({ 
      title, 
      imageUrl 
    });
    
    if (result.success) {
      alert('Post created!');
      setTitle('');
      setFile(null);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create New Post</h2>
      
      <input 
        placeholder="Title" 
        value={title} 
        onChange={e => setTitle(e.target.value)} 
      />
      
      <div style={{ margin: '10px 0' }}>
        <input 
          type="file" 
          onChange={e => setFile(e.target.files[0])} 
        />
        {isUploading && (
          <progress value={progress.percentage} max="100" />
        )}
      </div>
      
      <button disabled={creating || isUploading}>
        {creating ? 'Saving...' : 'Create Post'}
      </button>
    </form>
  );
}
