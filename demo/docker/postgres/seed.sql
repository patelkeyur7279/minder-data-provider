-- Minder Data Provider Demo - Sample Data
-- Password for all users: "password123" (hashed with bcrypt)

-- Insert sample users
INSERT INTO users (username, email, password, first_name, last_name, avatar_url, bio, role) VALUES
('john_doe', 'john@example.com', '$2b$10$rXCqMkMqE1YWnvMxVBkKcOYJQz8vYJGVKXZqJZqJZqJZqJZqJZqJZ', 'John', 'Doe', 'https://i.pravatar.cc/150?img=12', 'Full-stack developer passionate about React and Node.js', 'admin'),
('jane_smith', 'jane@example.com', '$2b$10$rXCqMkMqE1YWnvMxVBkKcOYJQz8vYJGVKXZqJZqJZqJZqJZqJZqJZ', 'Jane', 'Smith', 'https://i.pravatar.cc/150?img=45', 'UI/UX designer and frontend engineer', 'user'),
('bob_wilson', 'bob@example.com', '$2b$10$rXCqMkMqE1YWnvMxVBkKcOYJQz8vYJGVKXZqJZqJZqJZqJZqJZqJZ', 'Bob', 'Wilson', 'https://i.pravatar.cc/150?img=33', 'DevOps engineer and cloud architect', 'user'),
('alice_johnson', 'alice@example.com', '$2b$10$rXCqMkMqE1YWnvMxVBkKcOYJQz8vYJGVKXZqJZqJZqJZqJZqJZqJZ', 'Alice', 'Johnson', 'https://i.pravatar.cc/150?img=20', 'Product manager and Scrum master', 'user'),
('charlie_brown', 'charlie@example.com', '$2b$10$rXCqMkMqE1YWnvMxVBkKcOYJQz8vYJGVKXZqJZqJZqJZqJZqJZqJZ', 'Charlie', 'Brown', 'https://i.pravatar.cc/150?img=68', 'Backend engineer specializing in microservices', 'user');

-- Insert sample posts
INSERT INTO posts (user_id, title, content, excerpt, published, view_count, like_count, tags) VALUES
(1, 'Getting Started with Minder Data Provider', 
'Minder Data Provider is a powerful hybrid data management solution that combines the best of Redux and TanStack Query. In this comprehensive guide, we''ll explore how to set up and use all the amazing features it offers.

## Installation

```bash
npm install minder-data-provider
```

## Quick Start

The simplest way to get started is with the MinderDataProvider component:

```tsx
import { MinderDataProvider } from ''minder-data-provider'';

function App() {
  return (
    <MinderDataProvider config={config}>
      <YourApp />
    </MinderDataProvider>
  );
}
```

## Key Features

- 🚀 Hybrid Redux + TanStack Query architecture
- 💾 Automatic caching with configurable strategies
- 🔄 Real-time updates via WebSocket
- 📴 Offline-first support
- 🔐 Built-in authentication
- ⚡ Lazy loading for optimal performance

Stay tuned for more tutorials!',
'Learn how to set up and configure Minder Data Provider in your React applications with this comprehensive getting started guide.',
true, 456, 89, ARRAY['tutorial', 'getting-started', 'react']),

(1, 'Advanced Caching Strategies in Minder',
'Caching is one of the most powerful features in Minder Data Provider. Let''s dive deep into different caching strategies and when to use them.

## Cache Strategies

### 1. Stale-While-Revalidate (Default)
This strategy returns cached data immediately while fetching fresh data in the background.

```tsx
useMinder(''users'', {
  cache: {
    strategy: ''stale-while-revalidate'',
    ttl: 60000 // 1 minute
  }
});
```

### 2. Cache-First
Returns cached data and only fetches if cache is empty.

```tsx
useMinder(''static-data'', {
  cache: {
    strategy: ''cache-first'',
    ttl: 3600000 // 1 hour
  }
});
```

### 3. Network-First
Always fetch fresh data, falling back to cache on errors.

```tsx
useMinder(''live-prices'', {
  cache: {
    strategy: ''network-first'',
    ttl: 30000 // 30 seconds
  }
});
```

## Performance Tips

1. Use longer TTLs for static data
2. Enable background refetch for frequently updated data
3. Implement optimistic updates for better UX
4. Use cache invalidation wisely

Happy caching! 🚀',
'Deep dive into caching strategies: stale-while-revalidate, cache-first, and network-first. Learn when to use each for optimal performance.',
true, 234, 56, ARRAY['caching', 'performance', 'advanced']),

(2, 'SSR vs CSR: Performance Comparison',
'Server-Side Rendering (SSR) and Client-Side Rendering (CSR) each have their place in modern web development. Let''s compare their performance characteristics.

## SSR Advantages

- ✅ Better SEO (search engines see full content)
- ✅ Faster First Contentful Paint (FCP)
- ✅ Better performance on slow devices
- ✅ Works without JavaScript

## CSR Advantages

- ✅ Rich interactions
- ✅ Lower server load
- ✅ Easier to implement
- ✅ Better for web applications

## Minder''s Approach

Minder Data Provider supports both! With Next.js integration, you get:

```tsx
export async function getServerSideProps(context) {
  const minder = createMinder(config);
  await minder.prefetch(''users'');
  
  return {
    props: {
      dehydratedState: minder.dehydrate()
    }
  };
}
```

## Hybrid Approach (Best of Both)

Use SSR for initial page load, then CSR for interactions. This gives you:
- Fast initial load
- SEO benefits
- Rich interactivity
- Optimal performance

## Conclusion

The future is hybrid! 🎉',
'Comprehensive comparison of SSR vs CSR with real-world performance metrics. Learn when to use each rendering strategy.',
true, 678, 123, ARRAY['ssr', 'csr', 'nextjs', 'performance']),

(3, 'Building Offline-First Mobile Apps',
'Offline-first architecture is essential for modern mobile applications. Learn how Minder makes it easy.

## Why Offline-First?

Mobile users don''t always have reliable internet. An offline-first approach ensures your app works everywhere:

- ✈️ Airplane mode
- 🚇 Subway with no signal
- 🏔️ Remote locations
- 📶 Poor network conditions

## Minder''s Offline Support

Minder automatically handles offline scenarios:

```tsx
const { data, isOffline, syncStatus } = useMinder(''todos'', {
  offline: {
    enabled: true,
    syncStrategy: ''background''
  }
});
```

## Features

1. **Automatic Queue Management**: All mutations are queued when offline
2. **Smart Sync**: Syncs in order when connection returns
3. **Conflict Resolution**: Handles concurrent updates
4. **Storage**: Uses AsyncStorage (RN) or SecureStore (Expo)

## Implementation

```tsx
// Create a todo offline
const { mutate } = useMinderMutation(''createTodo'');

mutate({ title: ''New Todo'' }); // Works offline!
```

When the connection returns, it syncs automatically! 🎯',
'Build resilient mobile apps with offline-first architecture. Learn about queue management, sync strategies, and conflict resolution.',
true, 345, 78, ARRAY['mobile', 'offline', 'react-native', 'expo']),

(2, 'Real-time Updates with WebSocket',
'Add real-time functionality to your app with Minder''s built-in WebSocket support.

## Setup

```tsx
const config = {
  websocket: {
    url: ''ws://localhost:3002'',
    autoConnect: true,
    reconnect: true
  }
};
```

## Subscribe to Events

```tsx
const { subscribe } = useMinderWebSocket();

useEffect(() => {
  const unsubscribe = subscribe(''message'', (data) => {
    console.log(''New message:'', data);
  });
  
  return unsubscribe;
}, []);
```

## Emit Events

```tsx
const { emit } = useMinderWebSocket();

emit(''chat:message'', {
  room: ''general'',
  message: ''Hello World!''
});
```

## Room Management

```tsx
// Join a room
emit(''room:join'', ''general'');

// Leave a room
emit(''room:leave'', ''general'');
```

Perfect for chat, notifications, live updates! 🔌',
'Implement real-time features with WebSocket: chat, notifications, live data sync. Complete guide with code examples.',
false, 89, 23, ARRAY['websocket', 'realtime', 'socketio']);

-- Insert sample comments
INSERT INTO comments (post_id, user_id, content) VALUES
(1, 2, 'This is an excellent tutorial! The code examples are very clear and easy to follow. Thank you for sharing!'),
(1, 3, 'Just implemented this in my project and it works flawlessly. The setup was much easier than I expected.'),
(1, 4, 'Quick question: does this work with TypeScript? I didn''t see type definitions in the examples.'),
(2, 2, 'The caching strategies comparison is super helpful. I was using cache-first for everything before!'),
(2, 5, 'Great deep dive! One suggestion: add a section about cache invalidation patterns.'),
(3, 1, 'Thanks for the feedback! Yes, full TypeScript support is included. Check the docs for type definitions.'),
(3, 4, 'The SSR vs CSR comparison really helped me understand when to use each approach. Bookmarked!'),
(4, 1, 'Offline-first is a game changer for mobile apps. Can''t wait to try this in my React Native project.'),
(4, 3, 'Does the conflict resolution work automatically or do we need to implement custom logic?');

-- Insert sample todos
INSERT INTO todos (user_id, title, description, completed, priority, due_date, tags) VALUES
(1, 'Update Minder documentation', 'Add new sections for SSR/SSG and offline support with code examples', false, 'high', NOW() + INTERVAL '2 days', ARRAY['docs', 'important']),
(1, 'Review pull requests', 'Review and merge pending PRs for the authentication module', true, 'critical', NOW() - INTERVAL '1 day', ARRAY['code-review', 'urgent']),
(1, 'Prepare conference talk', 'Create slides for React Summit presentation on data management', false, 'medium', NOW() + INTERVAL '7 days', ARRAY['presentation', 'conference']),
(2, 'Design new dashboard', 'Create mockups for the analytics dashboard with real-time charts', false, 'high', NOW() + INTERVAL '3 days', ARRAY['design', 'ui']),
(2, 'User testing session', 'Conduct usability tests with 5 users for the new onboarding flow', false, 'medium', NOW() + INTERVAL '5 days', ARRAY['ux', 'testing']),
(3, 'Setup CI/CD pipeline', 'Configure GitHub Actions for automated testing and deployment', true, 'critical', NOW() - INTERVAL '2 days', ARRAY['devops', 'automation']),
(3, 'Optimize Docker images', 'Reduce image sizes by using multi-stage builds and alpine base', false, 'medium', NOW() + INTERVAL '4 days', ARRAY['docker', 'performance']),
(4, 'Sprint planning', 'Plan tasks for the next sprint and assign story points', false, 'high', NOW() + INTERVAL '1 day', ARRAY['planning', 'scrum']),
(4, 'Update project roadmap', 'Review and update the Q4 roadmap based on stakeholder feedback', false, 'low', NOW() + INTERVAL '10 days', ARRAY['planning', 'roadmap']),
(5, 'Refactor API endpoints', 'Improve error handling and add input validation to all endpoints', false, 'high', NOW() + INTERVAL '3 days', ARRAY['backend', 'refactoring']);

-- Insert some statistics
INSERT INTO statistics (metric_name, metric_value) VALUES
('page_views', '{"count": 1523, "page": "/dashboard", "date": "2025-11-05"}'),
('api_latency', '{"avg": 45, "p95": 120, "p99": 250, "endpoint": "/api/users"}'),
('cache_hit_rate', '{"rate": 87.5, "hits": 875, "misses": 125}'),
('active_users', '{"count": 234, "timestamp": "2025-11-05T10:00:00Z"}');

-- Create default admin session (for testing)
INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES
(1, 'test_refresh_token_admin', NOW() + INTERVAL '7 days');
