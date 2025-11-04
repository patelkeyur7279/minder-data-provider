// Minder Data Provider - WebSocket Server
// Real-time communication with Socket.io

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:19000'],
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Track connections and rooms
let connections = 0;
const rooms = new Map();
const connectionStats = {
  total: 0,
  current: 0,
  peak: 0,
  events: []
};

// Redis pub/sub for multi-instance support
const pubClient = redis.duplicate();
const subClient = redis.duplicate();

// Subscribe to broadcast channel
subClient.subscribe('broadcast', (err) => {
  if (err) {
    console.error('Failed to subscribe to broadcast channel:', err.message);
  } else {
    console.log('✅ Subscribed to broadcast channel');
  }
});

subClient.on('message', (channel, message) => {
  if (channel === 'broadcast') {
    const data = JSON.parse(message);
    io.emit(data.event, data.payload);
  }
});

io.on('connection', (socket) => {
  connections++;
  connectionStats.total++;
  connectionStats.current++;
  connectionStats.peak = Math.max(connectionStats.peak, connectionStats.current);
  
  console.log(`✅ Client connected: ${socket.id} (Total: ${connections})`);

  // Broadcast connection count
  io.emit('stats:connections', {
    count: connections,
    timestamp: new Date().toISOString()
  });

  // ==================
  // Room Management
  // ==================

  socket.on('room:join', (room) => {
    socket.join(room);
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(socket.id);
    
    console.log(`📢 ${socket.id} joined room: ${room}`);
    
    // Notify room members
    io.to(room).emit('room:user-joined', {
      room,
      userId: socket.id,
      count: rooms.get(room).size,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('room:leave', (room) => {
    socket.leave(room);
    if (rooms.has(room)) {
      rooms.get(room).delete(socket.id);
      
      // Notify room members
      io.to(room).emit('room:user-left', {
        room,
        userId: socket.id,
        count: rooms.get(room).size,
        timestamp: new Date().toISOString()
      });
      
      // Clean up empty rooms
      if (rooms.get(room).size === 0) {
        rooms.delete(room);
      }
    }
    console.log(`📤 ${socket.id} left room: ${room}`);
  });

  // ==================
  // Chat Messages
  // ==================

  socket.on('chat:message', (data) => {
    const { room, message, user } = data;
    
    const messageData = {
      id: Date.now(),
      user,
      message,
      room,
      timestamp: new Date().toISOString()
    };
    
    // Broadcast to room
    io.to(room).emit('chat:message', messageData);
    
    // Store in Redis for persistence (last 100 messages per room)
    redis.lpush(`chat:${room}`, JSON.stringify(messageData));
    redis.ltrim(`chat:${room}`, 0, 99);
    
    console.log(`💬 Message in ${room} from ${user}: ${message}`);
  });

  socket.on('chat:history', async ({ room }, callback) => {
    try {
      const messages = await redis.lrange(`chat:${room}`, 0, 99);
      const parsed = messages.map(msg => JSON.parse(msg)).reverse();
      callback({ success: true, messages: parsed });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // ==================
  // Notifications
  // ==================

  socket.on('notification:send', (data) => {
    const { to, title, message, type = 'info' } = data;
    
    const notification = {
      id: Date.now(),
      title,
      message,
      type,
      timestamp: new Date().toISOString()
    };
    
    if (to === 'all') {
      io.emit('notification:received', notification);
    } else if (to.startsWith('room:')) {
      const room = to.replace('room:', '');
      io.to(room).emit('notification:received', notification);
    } else {
      io.to(to).emit('notification:received', notification);
    }
    
    console.log(`🔔 Notification sent to ${to}: ${title}`);
  });

  // ==================
  // Data Updates (Real-time sync)
  // ==================

  socket.on('data:update', (data) => {
    const { resource, action, payload } = data;
    
    const updateData = {
      resource,
      action,
      payload,
      timestamp: new Date().toISOString()
    };
    
    // Broadcast to all except sender
    socket.broadcast.emit('data:update', updateData);
    
    // Store in Redis
    redis.lpush('data:updates', JSON.stringify(updateData));
    redis.ltrim('data:updates', 0, 499);
    
    console.log(`🔄 Data update: ${action} on ${resource}`);
  });

  socket.on('data:subscribe', (resource) => {
    socket.join(`data:${resource}`);
    console.log(`👁️ ${socket.id} subscribed to ${resource}`);
  });

  socket.on('data:unsubscribe', (resource) => {
    socket.leave(`data:${resource}`);
    console.log(`👋 ${socket.id} unsubscribed from ${resource}`);
  });

  // ==================
  // Statistics Broadcast
  // ==================

  socket.on('stats:request', async () => {
    const stats = {
      connections: {
        current: connections,
        total: connectionStats.total,
        peak: connectionStats.peak
      },
      rooms: Array.from(rooms.keys()).map(room => ({
        name: room,
        users: rooms.get(room).size
      })),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
    
    socket.emit('stats:update', stats);
  });

  // ==================
  // Typing Indicators
  // ==================

  socket.on('typing:start', ({ room, user }) => {
    socket.to(room).emit('typing:user-typing', { room, user });
  });

  socket.on('typing:stop', ({ room, user }) => {
    socket.to(room).emit('typing:user-stopped', { room, user });
  });

  // ==================
  // Presence
  // ==================

  socket.on('presence:online', ({ user }) => {
    socket.broadcast.emit('presence:user-online', { user, socketId: socket.id });
    redis.sadd('presence:online', socket.id);
  });

  socket.on('presence:away', ({ user }) => {
    socket.broadcast.emit('presence:user-away', { user, socketId: socket.id });
  });

  // ==================
  // Custom Events
  // ==================

  socket.on('event:emit', ({ event, data, room }) => {
    connectionStats.events.push({
      event,
      timestamp: new Date().toISOString()
    });
    
    // Keep last 1000 events
    if (connectionStats.events.length > 1000) {
      connectionStats.events.shift();
    }
    
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  });

  // ==================
  // Disconnect
  // ==================

  socket.on('disconnect', () => {
    connections--;
    connectionStats.current--;
    
    console.log(`❌ Client disconnected: ${socket.id} (Total: ${connections})`);
    
    // Broadcast connection count
    io.emit('stats:connections', {
      count: connections,
      timestamp: new Date().toISOString()
    });
    
    // Clean up rooms
    rooms.forEach((clients, room) => {
      if (clients.has(socket.id)) {
        clients.delete(socket.id);
        
        // Notify room
        io.to(room).emit('room:user-left', {
          room,
          userId: socket.id,
          count: clients.size,
          timestamp: new Date().toISOString()
        });
        
        // Clean up empty rooms
        if (clients.size === 0) {
          rooms.delete(room);
        }
      }
    });
    
    // Remove from presence
    redis.srem('presence:online', socket.id);
  });
});

// ==================
// HTTP Endpoints
// ==================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connections: {
      current: connections,
      total: connectionStats.total,
      peak: connectionStats.peak
    },
    rooms: rooms.size,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/stats', (req, res) => {
  res.json({
    connections: {
      current: connections,
      total: connectionStats.total,
      peak: connectionStats.peak
    },
    rooms: Array.from(rooms.keys()).map(room => ({
      name: room,
      users: rooms.get(room).size
    })),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// ==================
// Broadcast Statistics (Every 5 seconds)
// ==================

setInterval(() => {
  io.emit('stats:update', {
    connections: {
      current: connections,
      total: connectionStats.total,
      peak: connectionStats.peak
    },
    rooms: Array.from(rooms.keys()).length,
    timestamp: new Date().toISOString()
  });
}, 5000);

// ==================
// Start Server
// ==================

server.listen(PORT, () => {
  console.log('');
  console.log('🔌 Minder WebSocket Server Started');
  console.log('================================');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`📈 Stats: http://localhost:${PORT}/stats`);
  console.log('================================');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing WebSocket server');
  io.close(() => {
    console.log('WebSocket server closed');
    redis.quit();
    pubClient.quit();
    subClient.quit();
  });
});

module.exports = { io, server, app };
