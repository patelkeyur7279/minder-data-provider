-- Minder Data Provider Demo Database Schema
-- Created: November 2025

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Minder Data Provider - Complete Database Schema
-- Supports: E-commerce, SaaS, Social Media, Enterprise Use Cases
-- ============================================================================

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar VARCHAR(500),
    role VARCHAR(50) DEFAULT 'user',
    bio TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    refresh_token VARCHAR(500) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SOCIAL MEDIA / BLOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    excerpt VARCHAR(500),
    image VARCHAR(500),
    tags TEXT[],
    status VARCHAR(50) DEFAULT 'published',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

-- ============================================================================
-- E-COMMERCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    compare_at_price DECIMAL(10, 2),
    sku VARCHAR(100) UNIQUE,
    stock INTEGER DEFAULT 0,
    category VARCHAR(100),
    tags TEXT[],
    images TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) DEFAULT 0,
    shipping DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    shipping_address TEXT,
    billing_address TEXT,
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- FILE MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size BIGINT NOT NULL,
    url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    folder VARCHAR(255) DEFAULT 'uploads',
    is_public BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    icon VARCHAR(100),
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- REAL-TIME CHAT
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'public',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'text',
    metadata JSONB,
    is_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_room_members (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id)
);

-- ============================================================================
-- ACTIVITY & AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

-- ============================================================================
-- SAMPLE DATA
-- ============================================================================

-- Sample Users
INSERT INTO users (email, password, name, avatar, role, bio, is_verified) VALUES
    ('admin@minder.dev', '$2a$10$rQ3K5Z9XqL8YvYw5W9RqCOQp7kF3mC1nG8tJ2hV6xR4pL9mN0oP8e', 'Admin User', 'https://ui-avatars.com/api/?name=Admin+User&background=3b82f6&color=fff', 'admin', 'System administrator', TRUE),
    ('john.doe@example.com', '$2a$10$rQ3K5Z9XqL8YvYw5W9RqCOQp7kF3mC1nG8tJ2hV6xR4pL9mN0oP8e', 'John Doe', 'https://ui-avatars.com/api/?name=John+Doe&background=10b981&color=fff', 'user', 'Full-stack developer passionate about React', TRUE),
    ('jane.smith@example.com', '$2a$10$rQ3K5Z9XqL8YvYw5W9RqCOQp7kF3mC1nG8tJ2hV6xR4pL9mN0oP8e', 'Jane Smith', 'https://ui-avatars.com/api/?name=Jane+Smith&background=8b5cf6&color=fff', 'user', 'UI/UX designer and product enthusiast', TRUE),
    ('bob.johnson@example.com', '$2a$10$rQ3K5Z9XqL8YvYw5W9RqCOQp7kF3mC1nG8tJ2hV6xR4pL9mN0oP8e', 'Bob Johnson', 'https://ui-avatars.com/api/?name=Bob+Johnson&background=f59e0b&color=fff', 'user', 'DevOps engineer & cloud architect', TRUE),
    ('alice.williams@example.com', '$2a$10$rQ3K5Z9XqL8YvYw5W9RqCOQp7kF3mC1nG8tJ2hV6xR4pL9mN0oP8e', 'Alice Williams', 'https://ui-avatars.com/api/?name=Alice+Williams&background=ec4899&color=fff', 'user', 'Data scientist and ML enthusiast', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Sample Posts
INSERT INTO posts (user_id, title, content, excerpt, tags, likes_count, comments_count, views_count, is_featured) VALUES
    (2, 'Getting Started with Minder Data Provider', 'Minder Data Provider is a powerful library for managing data in React applications. It combines the best features of Redux and TanStack Query...', 'Learn the basics of Minder Data Provider', ARRAY['react', 'tutorial', 'getting-started'], 45, 12, 342, TRUE),
    (2, 'Advanced Caching Strategies', 'Caching is crucial for building performant applications. In this post, we''ll explore different caching strategies...', 'Deep dive into caching patterns', ARRAY['performance', 'caching', 'optimization'], 38, 8, 289, TRUE),
    (3, 'Building Real-time Features with WebSockets', 'Real-time functionality is essential for modern apps. Let''s see how to implement chat, notifications, and live updates...', 'Master WebSocket integration', ARRAY['websocket', 'real-time', 'advanced'], 52, 15, 401, TRUE),
    (3, 'File Upload Best Practices', 'Uploading files can be tricky. Here are some best practices for handling file uploads in React...', 'Tips for smooth file uploads', ARRAY['uploads', 'files', 'best-practices'], 29, 6, 198, FALSE),
    (4, 'Offline-First Architecture', 'Building apps that work offline is more important than ever. Learn how to implement offline-first patterns...', 'Build apps that work anywhere', ARRAY['offline', 'pwa', 'architecture'], 41, 10, 276, FALSE)
ON CONFLICT DO NOTHING;

-- Sample Products
INSERT INTO products (name, description, price, compare_at_price, sku, stock, category, tags) VALUES
    ('Premium Headphones', 'High-quality wireless headphones with noise cancellation', 299.99, 399.99, 'AUDIO-001', 50, 'Electronics', ARRAY['audio', 'wireless', 'premium']),
    ('Ergonomic Keyboard', 'Mechanical keyboard designed for developers', 159.99, 199.99, 'COMP-001', 100, 'Computers', ARRAY['keyboard', 'mechanical', 'ergonomic']),
    ('Smart Watch', 'Fitness tracking smartwatch with heart rate monitor', 249.99, 299.99, 'WEAR-001', 75, 'Wearables', ARRAY['fitness', 'smart', 'watch']),
    ('Laptop Stand', 'Adjustable aluminum laptop stand', 49.99, 79.99, 'ACC-001', 200, 'Accessories', ARRAY['desk', 'ergonomic', 'aluminum']),
    ('Webcam HD', 'Professional 1080p webcam for streaming', 89.99, 129.99, 'COMP-002', 120, 'Computers', ARRAY['webcam', 'streaming', 'hd'])
ON CONFLICT (sku) DO NOTHING;

-- Sample Chat Rooms
INSERT INTO chat_rooms (name, description, type, created_by) VALUES
    ('General', 'General discussion room', 'public', 1),
    ('React Developers', 'Talk about React, Next.js, and modern web dev', 'public', 2),
    ('Tech Support', 'Get help with technical issues', 'public', 1),
    ('Random', 'Off-topic conversations', 'public', 3)
ON CONFLICT DO NOTHING;

-- Sample Chat Messages
INSERT INTO chat_messages (room_id, user_id, message, type) VALUES
    (1, 2, 'Hey everyone! Welcome to Minder Data Provider demo!', 'text'),
    (1, 3, 'This is amazing! The real-time features work perfectly.', 'text'),
    (2, 4, 'Anyone tried the caching strategies yet?', 'text'),
    (2, 2, 'Yes! The cache invalidation is really smooth.', 'text'),
    (1, 5, 'Love the TypeScript support 🎉', 'text')
ON CONFLICT DO NOTHING;

-- Sample Notifications
INSERT INTO notifications (user_id, type, title, message, icon) VALUES
    (2, 'success', 'Welcome to Minder!', 'Thanks for trying out Minder Data Provider', '🎉'),
    (2, 'info', 'New Feature', 'Check out the new WebSocket integration', '🔔'),
    (3, 'success', 'Post Published', 'Your post "Building Real-time Features" is now live', '📝'),
    (4, 'info', 'System Update', 'We''ve improved caching performance by 40%', '⚡')
ON CONFLICT DO NOTHING;

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT,
  excerpt VARCHAR(500),
  published BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Todos table
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT false,
  priority VARCHAR(50) DEFAULT 'medium',
  due_date TIMESTAMP,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  mimetype VARCHAR(255),
  size INTEGER,
  path TEXT,
  url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (for JWT refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Statistics table (for tracking metrics)
CREATE TABLE IF NOT EXISTS statistics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(255) NOT NULL,
  metric_value JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_statistics_metric_name ON statistics(metric_name);
CREATE INDEX IF NOT EXISTS idx_statistics_timestamp ON statistics(timestamp DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO minder;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO minder;
