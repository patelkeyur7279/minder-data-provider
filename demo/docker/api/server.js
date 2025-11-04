// Minder Data Provider - Demo API Server
// Complete implementation with all features

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Redis = require('ioredis');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// =======================
// Database Connections
// =======================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://minder:minder123@localhost:5432/minder',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Test Redis connection
redis.ping((err, result) => {
  if (err) {
    console.error('❌ Redis connection error:', err.message);
  } else {
    console.log('✅ Redis connected:', result);
  }
});

// =======================
// Middleware
// =======================

// Security
app.use(helmet());

// CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:19000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// Statistics Tracker
// =======================

const stats = {
  requests: { total: 0, success: 0, error: 0 },
  cache: { hits: 0, misses: 0 },
  rendering: { ssr: 0, csr: 0, ssg: 0 },
  performance: { 
    avgResponseTime: 0, 
    totalTime: 0,
    requests: []
  },
  realtime: {
    connections: 0,
    events: []
  }
};

// Middleware to track statistics
app.use((req, res, next) => {
  const start = Date.now();
  stats.requests.total++;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    stats.performance.totalTime += duration;
    stats.performance.avgResponseTime = 
      Math.round(stats.performance.totalTime / stats.requests.total);
    
    // Keep last 100 requests
    stats.performance.requests.push({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      timestamp: new Date().toISOString()
    });
    
    if (stats.performance.requests.length > 100) {
      stats.performance.requests.shift();
    }
    
    if (res.statusCode >= 200 && res.statusCode < 400) {
      stats.requests.success++;
    } else {
      stats.requests.error++;
    }
  });
  
  next();
});

// =======================
// Health Check
// =======================

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'connected',
        redis: 'connected'
      },
      stats: {
        totalRequests: stats.requests.total,
        avgResponseTime: stats.performance.avgResponseTime
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// =======================
// Live Statistics Endpoint
// =======================

app.get('/api/statistics', (req, res) => {
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// Export pool, redis, and stats for routes
app.locals.pool = pool;
app.locals.redis = redis;
app.locals.stats = stats;

// =======================
// Auth Middleware
// =======================

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    // Check token in redis (simulated JWT validation)
    const sessionData = await redis.get(`session:${token}`);
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = JSON.parse(sessionData);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// =======================
// AUTHENTICATION ENDPOINTS
// =======================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user
    const result = await pool.query(
      'SELECT id, username, email, first_name, last_name, avatar_url, role FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Generate token (simple UUID for demo)
    const token = `token_${Date.now()}_${Math.random().toString(36)}`;
    const refreshToken = `refresh_${Date.now()}_${Math.random().toString(36)}`;
    
    // Store session in Redis
    await redis.setex(`session:${token}`, 3600, JSON.stringify(user)); // 1 hour
    await redis.setex(`refresh:${refreshToken}`, 86400, JSON.stringify(user)); // 24 hours
    
    // Create session in DB
    await pool.query(
      'INSERT INTO sessions (user_id, token, refresh_token, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'1 hour\')',
      [user.id, token, refreshToken]
    );
    
    res.json({
      user,
      token,
      refreshToken,
      expiresIn: 3600
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, first_name, last_name } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password required' });
    }
    
    // Check if user exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, first_name, last_name, avatar_url, role',
      [username, email, 'hashed_' + password, first_name, last_name]
    );
    
    const user = result.rows[0];
    
    res.status(201).json({
      user,
      message: 'Registration successful. Please login.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh Token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    // Check refresh token in Redis
    const userData = await redis.get(`refresh:${refreshToken}`);
    
    if (!userData) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    const user = JSON.parse(userData);
    
    // Generate new token
    const newToken = `token_${Date.now()}_${Math.random().toString(36)}`;
    
    // Store new session
    await redis.setex(`session:${newToken}`, 3600, JSON.stringify(user));
    
    res.json({
      token: newToken,
      expiresIn: 3600
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // Remove from Redis
    await redis.del(`session:${token}`);
    
    // Mark session as inactive in DB
    await pool.query(
      'UPDATE sessions SET is_active = false WHERE token = $1',
      [token]
    );
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify Token
app.get('/api/auth/verify', authenticate, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// =======================
// USER ENDPOINTS
// =======================

// Get all users (with pagination, search, filters)
app.get('/api/users', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      role = '', 
      sort = 'created_at',
      order = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    let query = 'SELECT id, username, email, first_name, last_name, avatar_url, bio, role, created_at FROM users WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    // Search filter
    if (search) {
      query += ` AND (username ILIKE $${paramCount} OR email ILIKE $${paramCount} OR first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    // Role filter
    if (role) {
      query += ` AND role = $${paramCount}`;
      params.push(role);
      paramCount++;
    }
    
    // Sorting
    const validSorts = ['created_at', 'username', 'email'];
    const validOrders = ['ASC', 'DESC'];
    const sortBy = validSorts.includes(sort) ? sort : 'created_at';
    const orderBy = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
    
    query += ` ORDER BY ${sortBy} ${orderBy}`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;
    
    if (search) {
      countQuery += ` AND (username ILIKE $${countParamIndex} OR email ILIKE $${countParamIndex} OR first_name ILIKE $${countParamIndex} OR last_name ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }
    
    if (role) {
      countQuery += ` AND role = $${countParamIndex}`;
      countParams.push(role);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, first_name, last_name, avatar_url, bio, role, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  try {
    const { username, email, password, first_name, last_name, bio, role = 'user' } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password required' });
    }
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password, first_name, last_name, bio, role) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, first_name, last_name, bio, role, created_at',
      [username, email, 'hashed_' + password, first_name, last_name, bio, role]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: 'Username or email already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Update user
app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { first_name, last_name, bio, avatar_url } = req.body;
    
    const result = await pool.query(
      'UPDATE users SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), bio = COALESCE($3, bio), avatar_url = COALESCE($4, avatar_url), updated_at = NOW() WHERE id = $5 RETURNING id, username, email, first_name, last_name, bio, avatar_url, role',
      [first_name, last_name, bio, avatar_url, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// POSTS ENDPOINTS
// =======================

// Get all posts (with pagination, search, filters)
app.get('/api/posts', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      user_id = '',
      published = '',
      sort = 'created_at',
      order = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    let query = `
      SELECT p.*, u.username, u.avatar_url,
             (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as like_count,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    // Search filter
    if (search) {
      query += ` AND (p.title ILIKE $${paramCount} OR p.content ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    // User filter
    if (user_id) {
      query += ` AND p.user_id = $${paramCount}`;
      params.push(user_id);
      paramCount++;
    }
    
    // Published filter
    if (published !== '') {
      query += ` AND p.published = $${paramCount}`;
      params.push(published === 'true');
      paramCount++;
    }
    
    // Sorting
    query += ` ORDER BY p.${sort} ${order}`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM posts p WHERE 1=1';
    const countParams = [];
    let countIndex = 1;
    
    if (search) {
      countQuery += ` AND (title ILIKE $${countIndex} OR content ILIKE $${countIndex})`;
      countParams.push(`%${search}%`);
      countIndex++;
    }
    
    if (user_id) {
      countQuery += ` AND user_id = $${countIndex}`;
      countParams.push(user_id);
      countIndex++;
    }
    
    if (published !== '') {
      countQuery += ` AND published = $${countIndex}`;
      countParams.push(published === 'true');
    }
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get post by ID
app.get('/api/posts/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.avatar_url,
              (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
       FROM posts p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Increment view count
    await pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create post
app.post('/api/posts', authenticate, async (req, res) => {
  try {
    const { title, content, excerpt, featured_image, published = true } = req.body;
    const user_id = req.user.id;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' });
    }
    
    const result = await pool.query(
      'INSERT INTO posts (user_id, title, content, excerpt, featured_image, published) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [user_id, title, content, excerpt, featured_image, published]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update post
app.put('/api/posts/:id', authenticate, async (req, res) => {
  try {
    const { title, content, excerpt, featured_image, published } = req.body;
    
    const result = await pool.query(
      'UPDATE posts SET title = COALESCE($1, title), content = COALESCE($2, content), excerpt = COALESCE($3, excerpt), featured_image = COALESCE($4, featured_image), published = COALESCE($5, published), updated_at = NOW() WHERE id = $6 RETURNING *',
      [title, content, excerpt, featured_image, published, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete post
app.delete('/api/posts/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Like post
app.post('/api/posts/:id/like', authenticate, async (req, res) => {
  try {
    const post_id = req.params.id;
    const user_id = req.user.id;
    
    // Check if already liked
    const existing = await pool.query(
      'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [post_id, user_id]
    );
    
    if (existing.rows.length > 0) {
      // Unlike
      await pool.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [post_id, user_id]);
      return res.json({ liked: false, message: 'Post unliked' });
    } else {
      // Like
      await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)', [post_id, user_id]);
      return res.json({ liked: true, message: 'Post liked' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// COMMENTS ENDPOINTS
// =======================

// Get comments for a post
app.get('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT c.*, u.username, u.avatar_url 
       FROM comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.post_id = $1 
       ORDER BY c.created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.params.postId, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM comments WHERE post_id = $1',
      [req.params.postId]
    );
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create comment
app.post('/api/posts/:postId/comments', authenticate, async (req, res) => {
  try {
    const { content, parent_comment_id = null } = req.body;
    const post_id = req.params.postId;
    const user_id = req.user.id;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    const result = await pool.query(
      'INSERT INTO comments (post_id, user_id, parent_comment_id, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [post_id, user_id, parent_comment_id, content]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// =======================
// PRODUCTS ENDPOINTS
// =======================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      search = '', 
      category = '',
      min_price = 0,
      max_price = 999999,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    query += ` AND price >= $${paramCount} AND price <= $${paramCount + 1}`;
    params.push(min_price, max_price);
    paramCount += 2;
    
    query += ` ORDER BY ${sort} ${order}`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = 'SELECT COUNT(*) FROM products WHERE 1=1' + 
      (search ? ` AND (name ILIKE '%${search}%' OR description ILIKE '%${search}%')` : '') +
      (category ? ` AND category = '${category}'` : '') +
      ` AND price >= ${min_price} AND price <= ${max_price}`;
    
    const countResult = await pool.query(countQuery);
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
app.post('/api/products', authenticate, async (req, res) => {
  try {
    const { name, description, price, category, image_url, stock_quantity } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price required' });
    }
    
    const result = await pool.query(
      'INSERT INTO products (name, description, price, category, image_url, stock_quantity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, price, category, image_url, stock_quantity]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update product
app.put('/api/products/:id', authenticate, async (req, res) => {
  try {
    const { name, description, price, category, image_url, stock_quantity } = req.body;
    
    const result = await pool.query(
      'UPDATE products SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price), category = COALESCE($4, category), image_url = COALESCE($5, image_url), stock_quantity = COALESCE($6, stock_quantity), updated_at = NOW() WHERE id = $7 RETURNING *',
      [name, description, price, category, image_url, stock_quantity, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete product
app.delete('/api/products/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// ORDERS ENDPOINTS
// =======================

// Get user orders
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT o.*, 
              (SELECT json_agg(json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', p.name,
                'quantity', oi.quantity,
                'price', oi.price
              ))
              FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = o.id) as items
       FROM orders o
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM orders WHERE user_id = $1',
      [user_id]
    );
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by ID
app.get('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
              (SELECT json_agg(json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', p.name,
                'quantity', oi.quantity,
                'price', oi.price
              ))
              FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = o.id) as items
       FROM orders o
       WHERE o.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order
app.post('/api/orders', authenticate, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { items, shipping_address, billing_address } = req.body;
    const user_id = req.user.id;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Order items required' });
    }
    
    // Calculate total
    let total_amount = 0;
    for (const item of items) {
      const product = await client.query('SELECT price, stock_quantity FROM products WHERE id = $1', [item.product_id]);
      
      if (product.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found`);
      }
      
      if (product.rows[0].stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.product_id}`);
      }
      
      total_amount += product.rows[0].price * item.quantity;
    }
    
    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (user_id, total_amount, status, shipping_address, billing_address) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, total_amount, 'pending', shipping_address, billing_address]
    );
    
    const order = orderResult.rows[0];
    
    // Create order items
    for (const item of items) {
      const product = await client.query('SELECT price FROM products WHERE id = $1', [item.product_id]);
      
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.product_id, item.quantity, product.rows[0].price]
      );
      
      // Update stock
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json(order);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// =======================
// FILES ENDPOINTS
// =======================

// Get user files
app.get('/api/files', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      'SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [user_id, limit, offset]
    );
    
    const countResult = await pool.query('SELECT COUNT(*) FROM files WHERE user_id = $1', [user_id]);
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file (simulated)
app.post('/api/files/upload', authenticate, async (req, res) => {
  try {
    const { filename, file_path, file_size, mime_type } = req.body;
    const user_id = req.user.id;
    
    if (!filename || !file_path) {
      return res.status(400).json({ error: 'Filename and file_path required' });
    }
    
    const result = await pool.query(
      'INSERT INTO files (user_id, filename, file_path, file_size, mime_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, filename, file_path, file_size || 0, mime_type || 'application/octet-stream']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete file
app.delete('/api/files/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// NOTIFICATIONS ENDPOINTS
// =======================

// Get user notifications
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 20, is_read } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [user_id];
    let paramCount = 2;
    
    if (is_read !== undefined) {
      query += ` AND is_read = $${paramCount}`;
      params.push(is_read === 'true');
      paramCount++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = is_read !== undefined 
      ? 'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = $2'
      : 'SELECT COUNT(*) FROM notifications WHERE user_id = $1';
    
    const countParams = is_read !== undefined ? [user_id, is_read === 'true'] : [user_id];
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// CHAT ENDPOINTS
// =======================

// Get user chat rooms
app.get('/api/chat/rooms', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    
    const result = await pool.query(
      `SELECT cr.*, crm.joined_at,
              (SELECT COUNT(*) FROM chat_room_members WHERE room_id = cr.id) as member_count,
              (SELECT COUNT(*) FROM chat_messages WHERE room_id = cr.id) as message_count
       FROM chat_rooms cr
       JOIN chat_room_members crm ON cr.id = crm.room_id
       WHERE crm.user_id = $1
       ORDER BY cr.updated_at DESC`,
      [user_id]
    );
    
    res.json({ data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat messages
app.get('/api/chat/rooms/:roomId/messages', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT cm.*, u.username, u.avatar_url
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.room_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.roomId, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM chat_messages WHERE room_id = $1',
      [req.params.roomId]
    );
    
    res.json({
      data: result.rows.reverse(), // Oldest first
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
app.post('/api/chat/rooms/:roomId/messages', authenticate, async (req, res) => {
  try {
    const { content, message_type = 'text' } = req.body;
    const room_id = req.params.roomId;
    const user_id = req.user.id;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    const result = await pool.query(
      'INSERT INTO chat_messages (room_id, user_id, content, message_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [room_id, user_id, content, message_type]
    );
    
    // Update room updated_at
    await pool.query('UPDATE chat_rooms SET updated_at = NOW() WHERE id = $1', [room_id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// =======================
// Error Handler
// =======================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =======================
// 404 Handler
// =======================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// =======================
// Start Server
// =======================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('🚀 Minder API Server Started');
  console.log('================================');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`📈 Stats: http://localhost:${PORT}/api/statistics`);
  console.log('================================');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end();
    redis.quit();
  });
});

// Export for testing
module.exports = { app, pool, redis, stats };
