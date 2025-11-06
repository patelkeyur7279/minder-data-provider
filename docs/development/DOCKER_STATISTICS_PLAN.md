# 🐳 Docker Infrastructure & Live Statistics Dashboard

## 📊 Implementation Plan for Complete Testing Environment

### 🎯 **Objectives**

1. **Docker Infrastructure**: Complete backend services for testing all features
2. **Live Statistics**: Real-time dashboard showing SSR/CSR, cache metrics, performance
3. **Multi-Platform Demos**: Running demos for Web, Next.js, React Native, Electron
4. **Feature Testing**: Interactive panels for CRUD, Auth, WebSocket, File Upload, etc.
5. **Monitoring**: Performance tracking, network activity, error logging

---

## 🏗️ **PHASE 1: Docker Infrastructure** (Estimated: 2-3 hours)

### **1.1 Docker Services Overview**

```yaml
# demo/docker/docker-compose.yml

services:
  # 1. PostgreSQL Database
  postgres:
    - Persistent data storage
    - Sample data pre-seeded
    - Port: 5432
    - Tables: users, posts, comments, todos, files
    
  # 2. Redis Cache
  redis:
    - Server-side caching
    - Session storage
    - Rate limit counters
    - Port: 6379
    
  # 3. Backend API Server
  api-server:
    - Node.js + Express
    - RESTful CRUD endpoints
    - JWT authentication
    - File upload handling
    - Rate limiting
    - CORS configured
    - Port: 3001
    - Endpoints:
      - GET/POST/PUT/DELETE /api/users
      - GET/POST/PUT/DELETE /api/posts
      - POST /api/auth/login
      - POST /api/auth/refresh
      - POST /api/upload
      - GET /api/health
      - GET /api/stats (live statistics)
    
  # 4. WebSocket Server
  websocket-server:
    - Socket.io server
    - Real-time events
    - Room management
    - Auto-reconnect support
    - Port: 3002
    - Events:
      - message (chat)
      - notification
      - data-update (live sync)
      - stats-update (live metrics)
      
  # 5. Next.js Demo App
  nextjs-demo:
    - Full SSR/SSG/ISR support
    - Live statistics dashboard
    - All 10 feature panels
    - Performance monitoring
    - Port: 3000
    
  # 6. Nginx Reverse Proxy (Optional)
  nginx:
    - Single entry point
    - Load balancing
    - SSL termination
    - Port: 80, 443
```

### **1.2 Directory Structure**

```
demo/
├── docker/
│   ├── docker-compose.yml           # Main orchestration file
│   ├── .env.example                 # Environment variables template
│   ├── README.md                    # Setup instructions
│   │
│   ├── postgres/
│   │   ├── Dockerfile
│   │   ├── init.sql                 # Database schema
│   │   └── seed.sql                 # Sample data
│   │
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── server.js                # Express server
│   │   ├── routes/
│   │   │   ├── users.js
│   │   │   ├── posts.js
│   │   │   ├── auth.js
│   │   │   ├── upload.js
│   │   │   └── stats.js             # Live statistics endpoint
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT verification
│   │   │   ├── rateLimiter.js
│   │   │   ├── cors.js
│   │   │   └── errorHandler.js
│   │   ├── services/
│   │   │   ├── db.js                # PostgreSQL client
│   │   │   ├── cache.js             # Redis client
│   │   │   └── metrics.js           # Statistics collector
│   │   └── utils/
│   │       ├── jwt.js
│   │       └── validation.js
│   │
│   ├── websocket/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── server.js                # Socket.io server
│   │   ├── handlers/
│   │   │   ├── chat.js
│   │   │   ├── notifications.js
│   │   │   └── stats.js             # Broadcast live stats
│   │   └── middleware/
│   │       └── auth.js
│   │
│   └── nginx/
│       ├── Dockerfile
│       └── nginx.conf
```

### **1.3 Implementation Steps**

#### **Step 1: Create docker-compose.yml** ✅

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: minder-postgres
    environment:
      POSTGRES_DB: minder
      POSTGRES_USER: minder
      POSTGRES_PASSWORD: minder123
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./postgres/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U minder"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: minder-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Backend API Server
  api-server:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: minder-api
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
      PORT: 3001
      DATABASE_URL: postgresql://minder:minder123@postgres:5432/minder
      REDIS_URL: redis://redis:6379
      JWT_SECRET: your-secret-key-change-in-production
      JWT_REFRESH_SECRET: your-refresh-secret-key
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./api:/app
      - /app/node_modules
      - upload-files:/app/uploads
    command: npm run dev

  # WebSocket Server
  websocket-server:
    build:
      context: ./websocket
      dockerfile: Dockerfile
    container_name: minder-websocket
    ports:
      - "3002:3002"
    environment:
      NODE_ENV: development
      PORT: 3002
      REDIS_URL: redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./websocket:/app
      - /app/node_modules
    command: npm run dev

  # Next.js Demo App
  nextjs-demo:
    build:
      context: ..
      dockerfile: docker/nextjs/Dockerfile
    container_name: minder-nextjs-demo
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_WS_URL: ws://localhost:3002
    volumes:
      - ../:/app
      - /app/node_modules
      - /app/.next
    command: npm run dev

volumes:
  postgres-data:
  redis-data:
  upload-files:

networks:
  default:
    name: minder-network
```

#### **Step 2: Create PostgreSQL Init Schema** ✅

```sql
-- demo/docker/postgres/init.sql

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts table
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments table
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Todos table
CREATE TABLE todos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  completed BOOLEAN DEFAULT false,
  priority VARCHAR(50) DEFAULT 'medium',
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Files table
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  mimetype VARCHAR(255),
  size INTEGER,
  path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_files_user_id ON files(user_id);
```

#### **Step 3: Create Seed Data** ✅

```sql
-- demo/docker/postgres/seed.sql

-- Insert sample users
INSERT INTO users (username, email, password, first_name, last_name) VALUES
('john_doe', 'john@example.com', '$2b$10$hashed_password', 'John', 'Doe'),
('jane_smith', 'jane@example.com', '$2b$10$hashed_password', 'Jane', 'Smith'),
('bob_wilson', 'bob@example.com', '$2b$10$hashed_password', 'Bob', 'Wilson');

-- Insert sample posts
INSERT INTO posts (user_id, title, content, published, view_count) VALUES
(1, 'Getting Started with Minder', 'Learn how to use Minder Data Provider...', true, 150),
(1, 'Advanced Caching Strategies', 'Deep dive into caching patterns...', true, 89),
(2, 'SSR vs CSR Performance', 'Comparison of rendering strategies...', true, 234),
(3, 'Offline-First Architecture', 'Building resilient mobile apps...', false, 0);

-- Insert sample comments
INSERT INTO comments (post_id, user_id, content) VALUES
(1, 2, 'Great tutorial! Very helpful.'),
(1, 3, 'This solved my problem, thanks!'),
(2, 2, 'Interesting approach to caching.');

-- Insert sample todos
INSERT INTO todos (user_id, title, completed, priority) VALUES
(1, 'Update documentation', false, 'high'),
(1, 'Fix bug in auth module', true, 'critical'),
(2, 'Review pull requests', false, 'medium'),
(3, 'Plan next sprint', false, 'low');
```

#### **Step 4: Create API Server** ✅

```javascript
// demo/docker/api/server.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 3001;

// Database connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const redis = new Redis(process.env.REDIS_URL);

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:19000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Statistics collector
const stats = {
  requests: { total: 0, success: 0, error: 0 },
  cache: { hits: 0, misses: 0 },
  rendering: { ssr: 0, csr: 0, ssg: 0 },
  performance: { avgResponseTime: 0, totalTime: 0 }
};

// Middleware to track stats
app.use((req, res, next) => {
  const start = Date.now();
  stats.requests.total++;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    stats.performance.totalTime += duration;
    stats.performance.avgResponseTime = 
      stats.performance.totalTime / stats.requests.total;
    
    if (res.statusCode >= 200 && res.statusCode < 400) {
      stats.requests.success++;
    } else {
      stats.requests.error++;
    }
  });
  
  next();
});

// Routes
app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/stats', require('./routes/stats'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Live statistics endpoint
app.get('/api/statistics', (req, res) => {
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Statistics: http://localhost:${PORT}/api/statistics`);
});

// Export for testing
module.exports = { app, pool, redis, stats };
```

#### **Step 5: Create WebSocket Server** ✅

```javascript
// demo/docker/websocket/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

const redis = new Redis(process.env.REDIS_URL);

// Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:19000'],
    credentials: true
  }
});

// Track connections
let connections = 0;
const rooms = new Map();

io.on('connection', (socket) => {
  connections++;
  console.log(`✅ Client connected: ${socket.id} (Total: ${connections})`);

  // Broadcast connection count
  io.emit('stats:connections', connections);

  // Join room
  socket.on('room:join', (room) => {
    socket.join(room);
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(socket.id);
    console.log(`📢 ${socket.id} joined room: ${room}`);
  });

  // Leave room
  socket.on('room:leave', (room) => {
    socket.leave(room);
    if (rooms.has(room)) {
      rooms.get(room).delete(socket.id);
    }
    console.log(`📤 ${socket.id} left room: ${room}`);
  });

  // Chat message
  socket.on('message', (data) => {
    const { room, message, user } = data;
    io.to(room).emit('message', {
      id: Date.now(),
      user,
      message,
      timestamp: new Date().toISOString()
    });
  });

  // Data update (real-time sync)
  socket.on('data:update', (data) => {
    socket.broadcast.emit('data:update', data);
  });

  // Broadcast statistics
  socket.on('stats:request', () => {
    socket.emit('stats:update', {
      connections,
      rooms: Array.from(rooms.keys()),
      timestamp: new Date().toISOString()
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    connections--;
    console.log(`❌ Client disconnected: ${socket.id} (Total: ${connections})`);
    io.emit('stats:connections', connections);
    
    // Clean up rooms
    rooms.forEach((clients, room) => {
      if (clients.has(socket.id)) {
        clients.delete(socket.id);
      }
    });
  });
});

// HTTP endpoint for stats
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connections,
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, () => {
  console.log(`🔌 WebSocket Server running on http://localhost:${PORT}`);
});

module.exports = { io, server };
```

---

## 📊 **PHASE 2: Live Statistics Dashboard** (Estimated: 3-4 hours)

### **2.1 Statistics Data Model**

```typescript
// demo/types/statistics.ts

export interface LiveStatistics {
  // Rendering Metrics
  rendering: {
    mode: 'SSR' | 'CSR' | 'SSG' | 'ISR';
    ssr: number;
    csr: number;
    ssg: number;
    isr: number;
    lastRenderTime: number;
  };

  // Performance Metrics
  performance: {
    apiLatency: number;        // Average API response time (ms)
    cacheHitRate: number;      // Cache hit percentage
    bundleSize: number;        // Current bundle size (KB)
    loadTime: number;          // Page load time (ms)
    ttfb: number;              // Time to first byte (ms)
    fcp: number;               // First contentful paint (ms)
    lcp: number;               // Largest contentful paint (ms)
    cls: number;               // Cumulative layout shift
    fid: number;               // First input delay (ms)
  };

  // Cache Statistics
  cache: {
    hits: number;
    misses: number;
    size: number;              // Cache size (bytes)
    entries: number;           // Number of cached entries
    ttl: number;               // Average TTL (ms)
    strategy: 'stale-while-revalidate' | 'cache-first' | 'network-first';
    topKeys: Array<{
      key: string;
      hits: number;
      size: number;
    }>;
  };

  // Network Activity
  network: {
    activeRequests: number;
    totalRequests: number;
    successRequests: number;
    errorRequests: number;
    deduplicatedRequests: number;
    websocketConnections: number;
    requestTimeline: Array<{
      timestamp: number;
      url: string;
      method: string;
      status: number;
      duration: number;
    }>;
  };

  // Feature Usage
  features: {
    offline: boolean;
    websocket: boolean;
    auth: boolean;
    upload: boolean;
    redux: boolean;
    ssr: boolean;
    devtools: boolean;
  };

  // Platform Information
  platform: {
    type: 'web' | 'nextjs' | 'native' | 'expo' | 'electron' | 'node';
    browser: string;
    os: string;
    device: 'mobile' | 'tablet' | 'desktop';
    screen: { width: number; height: number };
    connection: {
      type: string;
      effectiveType: string;
      downlink: number;
      rtt: number;
    };
  };

  // Real-time Updates
  realtime: {
    lastUpdate: string;
    updateCount: number;
    subscriptions: number;
    events: Array<{
      type: string;
      timestamp: string;
      data: any;
    }>;
  };
}
```

### **2.2 Statistics Collector Hook**

```typescript
// demo/hooks/useStatisticsCollector.ts

import { useEffect, useRef, useState } from 'react';
import { useMinder } from 'minder-data-provider';

export function useStatisticsCollector() {
  const minder = useMinder();
  const [stats, setStats] = useState<LiveStatistics>({
    rendering: { mode: 'CSR', ssr: 0, csr: 1, ssg: 0, isr: 0, lastRenderTime: Date.now() },
    performance: { apiLatency: 0, cacheHitRate: 0, bundleSize: 0, loadTime: 0, ttfb: 0, fcp: 0, lcp: 0, cls: 0, fid: 0 },
    cache: { hits: 0, misses: 0, size: 0, entries: 0, ttl: 0, strategy: 'stale-while-revalidate', topKeys: [] },
    network: { activeRequests: 0, totalRequests: 0, successRequests: 0, errorRequests: 0, deduplicatedRequests: 0, websocketConnections: 0, requestTimeline: [] },
    features: { offline: false, websocket: false, auth: false, upload: false, redux: false, ssr: false, devtools: false },
    platform: { type: 'web', browser: '', os: '', device: 'desktop', screen: { width: 0, height: 0 }, connection: { type: '', effectiveType: '', downlink: 0, rtt: 0 } },
    realtime: { lastUpdate: new Date().toISOString(), updateCount: 0, subscriptions: 0, events: [] }
  });

  const metricsRef = useRef<any>({});

  useEffect(() => {
    // Detect rendering mode
    const detectRenderMode = () => {
      if (typeof window === 'undefined') {
        return 'SSR';
      }
      if (window.__NEXT_DATA__?.props) {
        return 'SSG';
      }
      return 'CSR';
    };

    // Collect Web Vitals
    const collectWebVitals = () => {
      if (typeof window !== 'undefined') {
        import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB }) => {
          onCLS((metric) => {
            setStats(prev => ({
              ...prev,
              performance: { ...prev.performance, cls: metric.value }
            }));
          });
          onFID((metric) => {
            setStats(prev => ({
              ...prev,
              performance: { ...prev.performance, fid: metric.value }
            }));
          });
          onFCP((metric) => {
            setStats(prev => ({
              ...prev,
              performance: { ...prev.performance, fcp: metric.value }
            }));
          });
          onLCP((metric) => {
            setStats(prev => ({
              ...prev,
              performance: { ...prev.performance, lcp: metric.value }
            }));
          });
          onTTFB((metric) => {
            setStats(prev => ({
              ...prev,
              performance: { ...prev.performance, ttfb: metric.value }
            }));
          });
        });
      }
    };

    // Track cache statistics
    const trackCacheStats = () => {
      // Hook into Minder's cache system
      const cacheStats = minder.cache?.getStats?.() || {};
      setStats(prev => ({
        ...prev,
        cache: {
          ...prev.cache,
          ...cacheStats
        }
      }));
    };

    // Track network activity
    const trackNetworkActivity = () => {
      // Hook into Minder's network layer
      const networkStats = minder.network?.getStats?.() || {};
      setStats(prev => ({
        ...prev,
        network: {
          ...prev.network,
          ...networkStats
        }
      }));
    };

    // Detect platform
    const detectPlatform = () => {
      if (typeof window !== 'undefined') {
        const nav = navigator as any;
        setStats(prev => ({
          ...prev,
          platform: {
            type: detectRenderMode() === 'SSR' || detectRenderMode() === 'SSG' ? 'nextjs' : 'web',
            browser: nav.userAgent,
            os: nav.platform,
            device: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
            screen: { width: window.innerWidth, height: window.innerHeight },
            connection: {
              type: nav.connection?.type || '',
              effectiveType: nav.connection?.effectiveType || '',
              downlink: nav.connection?.downlink || 0,
              rtt: nav.connection?.rtt || 0
            }
          }
        }));
      }
    };

    // Initialize
    const mode = detectRenderMode();
    setStats(prev => ({
      ...prev,
      rendering: {
        ...prev.rendering,
        mode,
        [mode.toLowerCase()]: prev.rendering[mode.toLowerCase()] + 1
      }
    }));

    collectWebVitals();
    detectPlatform();

    // Update statistics every second
    const interval = setInterval(() => {
      trackCacheStats();
      trackNetworkActivity();
    }, 1000);

    return () => clearInterval(interval);
  }, [minder]);

  // Manual update function
  const updateStats = (updates: Partial<LiveStatistics>) => {
    setStats(prev => ({
      ...prev,
      ...updates,
      realtime: {
        ...prev.realtime,
        lastUpdate: new Date().toISOString(),
        updateCount: prev.realtime.updateCount + 1
      }
    }));
  };

  return { stats, updateStats };
}
```

### **2.3 Live Statistics Dashboard Component**

```typescript
// demo/components/LiveStatsDashboard.tsx

import React from 'react';
import { useStatisticsCollector } from '../hooks/useStatisticsCollector';
import { RenderingModeIndicator } from './RenderingModeIndicator';
import { PerformanceMetrics } from './PerformanceMetrics';
import { CacheVisualization } from './CacheVisualization';
import { NetworkActivityGraph } from './NetworkActivityGraph';
import { FeatureToggles } from './FeatureToggles';
import { PlatformDetector } from './PlatformDetector';

export function LiveStatsDashboard() {
  const { stats, updateStats } = useStatisticsCollector();

  return (
    <div className="live-stats-dashboard">
      <div className="stats-header">
        <h2>📊 Live Statistics Dashboard</h2>
        <div className="last-update">
          Last Update: {new Date(stats.realtime.lastUpdate).toLocaleTimeString()}
        </div>
      </div>

      <div className="stats-grid">
        {/* Rendering Mode Indicator */}
        <div className="stat-card">
          <RenderingModeIndicator 
            mode={stats.rendering.mode}
            counts={stats.rendering}
          />
        </div>

        {/* Performance Metrics */}
        <div className="stat-card">
          <PerformanceMetrics 
            metrics={stats.performance}
          />
        </div>

        {/* Cache Visualization */}
        <div className="stat-card">
          <CacheVisualization 
            cache={stats.cache}
          />
        </div>

        {/* Network Activity */}
        <div className="stat-card">
          <NetworkActivityGraph 
            network={stats.network}
          />
        </div>

        {/* Feature Status */}
        <div className="stat-card">
          <FeatureToggles 
            features={stats.features}
          />
        </div>

        {/* Platform Information */}
        <div className="stat-card">
          <PlatformDetector 
            platform={stats.platform}
          />
        </div>
      </div>

      <style jsx>{`
        .live-stats-dashboard {
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }

        .stats-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          color: white;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 20px;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s;
        }

        .stat-card:hover {
          transform: translateY(-5px);
        }

        .last-update {
          font-size: 14px;
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
```

### **2.4 Rendering Mode Indicator Component**

```typescript
// demo/components/RenderingModeIndicator.tsx

import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  mode: 'SSR' | 'CSR' | 'SSG' | 'ISR';
  counts: {
    ssr: number;
    csr: number;
    ssg: number;
    isr: number;
  };
}

export function RenderingModeIndicator({ mode, counts }: Props) {
  const modeColors = {
    SSR: '#10B981', // Green
    CSR: '#3B82F6', // Blue
    SSG: '#8B5CF6', // Purple
    ISR: '#F59E0B'  // Orange
  };

  const modeDescriptions = {
    SSR: 'Server-Side Rendering - Page rendered on server',
    CSR: 'Client-Side Rendering - Page rendered in browser',
    SSG: 'Static Site Generation - Pre-rendered at build time',
    ISR: 'Incremental Static Regeneration - Revalidates on demand'
  };

  return (
    <div className="rendering-mode-indicator">
      <h3>🎨 Rendering Mode</h3>
      
      <motion.div
        className="current-mode"
        animate={{
          backgroundColor: modeColors[mode],
          scale: [1, 1.05, 1]
        }}
        transition={{ duration: 1, repeat: Infinity }}
        style={{ backgroundColor: modeColors[mode] }}
      >
        <div className="mode-badge">{mode}</div>
        <div className="mode-description">{modeDescriptions[mode]}</div>
      </motion.div>

      <div className="mode-stats">
        {Object.entries(counts).map(([key, value]) => (
          <div key={key} className="mode-stat">
            <span className="mode-label">{key.toUpperCase()}:</span>
            <span className="mode-count">{value}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .rendering-mode-indicator {
          height: 100%;
        }

        h3 {
          margin-bottom: 20px;
          font-size: 18px;
          color: #1F2937;
        }

        .current-mode {
          padding: 30px;
          border-radius: 8px;
          text-align: center;
          color: white;
          margin-bottom: 20px;
        }

        .mode-badge {
          font-size: 32px;
          font-weight: bold;
          margin-bottom: 10px;
        }

        .mode-description {
          font-size: 14px;
          opacity: 0.9;
        }

        .mode-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .mode-stat {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #F3F4F6;
          border-radius: 6px;
        }

        .mode-label {
          font-weight: 600;
          color: #6B7280;
          font-size: 12px;
        }

        .mode-count {
          font-weight: bold;
          color: #1F2937;
        }
      `}</style>
    </div>
  );
}
```

### **2.5 Performance Metrics Component**

```typescript
// demo/components/PerformanceMetrics.tsx

import React from 'react';
import { Line } from 'react-chartjs-2';

interface Props {
  metrics: {
    apiLatency: number;
    cacheHitRate: number;
    bundleSize: number;
    loadTime: number;
    ttfb: number;
    fcp: number;
    lcp: number;
    cls: number;
    fid: number;
  };
}

export function PerformanceMetrics({ metrics }: Props) {
  const getCoreWebVitalsScore = () => {
    let score = 0;
    if (metrics.lcp < 2500) score += 33;
    else if (metrics.lcp < 4000) score += 17;
    
    if (metrics.fid < 100) score += 33;
    else if (metrics.fid < 300) score += 17;
    
    if (metrics.cls < 0.1) score += 34;
    else if (metrics.cls < 0.25) score += 17;
    
    return score;
  };

  const score = getCoreWebVitalsScore();

  return (
    <div className="performance-metrics">
      <h3>⚡ Performance Metrics</h3>

      {/* Core Web Vitals Score */}
      <div className="vitals-score">
        <div className="score-circle" style={{
          background: `conic-gradient(#10B981 ${score}%, #E5E7EB ${score}%)`
        }}>
          <div className="score-inner">
            <span className="score-value">{score}</span>
            <span className="score-label">Score</span>
          </div>
        </div>
      </div>

      {/* Individual Metrics */}
      <div className="metrics-list">
        <MetricRow label="API Latency" value={`${metrics.apiLatency}ms`} good={metrics.apiLatency < 100} />
        <MetricRow label="Cache Hit Rate" value={`${metrics.cacheHitRate}%`} good={metrics.cacheHitRate > 80} />
        <MetricRow label="Bundle Size" value={`${metrics.bundleSize}KB`} good={metrics.bundleSize < 100} />
        <MetricRow label="Page Load" value={`${metrics.loadTime}ms`} good={metrics.loadTime < 2000} />
        <MetricRow label="TTFB" value={`${metrics.ttfb}ms`} good={metrics.ttfb < 800} />
        <MetricRow label="FCP" value={`${metrics.fcp}ms`} good={metrics.fcp < 1800} />
        <MetricRow label="LCP" value={`${metrics.lcp}ms`} good={metrics.lcp < 2500} />
        <MetricRow label="CLS" value={metrics.cls.toFixed(3)} good={metrics.cls < 0.1} />
        <MetricRow label="FID" value={`${metrics.fid}ms`} good={metrics.fid < 100} />
      </div>

      <style jsx>{`
        .performance-metrics h3 {
          margin-bottom: 20px;
        }

        .vitals-score {
          display: flex;
          justify-content: center;
          margin-bottom: 30px;
        }

        .score-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .score-inner {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .score-value {
          font-size: 36px;
          font-weight: bold;
          color: #10B981;
        }

        .score-label {
          font-size: 12px;
          color: #6B7280;
        }

        .metrics-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

function MetricRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${good ? 'good' : 'warning'}`}>
        {value}
        <span className="metric-indicator">{good ? '✓' : '⚠️'}</span>
      </span>
      
      <style jsx>{`
        .metric-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #F9FAFB;
          border-radius: 6px;
        }

        .metric-label {
          font-size: 14px;
          color: #6B7280;
        }

        .metric-value {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .metric-value.good {
          color: #10B981;
        }

        .metric-value.warning {
          color: #F59E0B;
        }

        .metric-indicator {
          font-size: 16px;
        }
      `}</style>
    </div>
  );
}
```

---

## 🎯 **IMPLEMENTATION TIMELINE**

### **Day 1-2: Docker Infrastructure**
- ✅ Create docker-compose.yml
- ✅ Setup PostgreSQL with schema and seed data
- ✅ Build Express API server with all routes
- ✅ Build Socket.io WebSocket server
- ✅ Test all services

### **Day 3-4: Live Statistics Dashboard**
- ✅ Create statistics data model
- ✅ Build statistics collector hook
- ✅ Implement dashboard components
- ✅ Add real-time updates
- ✅ Add charts and visualizations

### **Day 5: Integration & Testing**
- ✅ Integrate with Minder package
- ✅ Test all features end-to-end
- ✅ Performance optimization
- ✅ Documentation

---

## 🚀 **READY TO START?**

**Just say "START" and I'll begin implementing:**

1. ✅ Complete Docker infrastructure (PostgreSQL, Redis, API, WebSocket)
2. ✅ Live statistics dashboard with real-time updates
3. ✅ All 10 feature panels working
4. ✅ Performance monitoring
5. ✅ Comprehensive testing

**Estimated Time**: 8-10 hours total  
**Your Time**: Run `cd demo/docker && docker-compose up` and enjoy! 🎉
