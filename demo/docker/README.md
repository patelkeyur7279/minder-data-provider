# 🐳 Minder Data Provider - Docker Setup

Complete Docker infrastructure for testing all Minder features with live statistics dashboard.

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running
- Node.js 18+ (for local development)

### Start All Services

```bash
cd demo/docker
docker-compose up -d
```

### Access Points

| Service | URL | Description |
|---------|-----|-------------|
| **Next.js Demo** | http://localhost:3000 | Main demo application |
| **API Server** | http://localhost:3001 | RESTful API endpoints |
| **WebSocket** | ws://localhost:3002 | Real-time communication |
| **PostgreSQL** | localhost:5432 | Database (user: minder, pass: minder123) |
| **Redis** | localhost:6379 | Cache server |

### Stop All Services

```bash
docker-compose down
```

### Stop and Remove Volumes

```bash
docker-compose down -v
```

## 📊 Services Overview

### 1. PostgreSQL Database
- **Image**: postgres:15-alpine
- **Port**: 5432
- **Database**: minder
- **User**: minder
- **Password**: minder123

**Tables**:
- `users` - User accounts
- `posts` - Blog posts
- `comments` - Post comments
- `todos` - Todo items
- `files` - Uploaded files
- `sessions` - JWT refresh tokens
- `statistics` - Metrics tracking

**Sample Data**: Pre-seeded with 5 users, 5 posts, 9 comments, 10 todos

### 2. Redis Cache
- **Image**: redis:7-alpine
- **Port**: 6379
- **Persistence**: AOF enabled

**Used for**:
- Server-side caching
- Session storage
- Rate limiting
- WebSocket pub/sub

### 3. API Server
- **Technology**: Node.js + Express
- **Port**: 3001
- **Features**:
  - RESTful CRUD endpoints
  - JWT authentication
  - Rate limiting (100 req/15min)
  - File upload support
  - Live statistics tracking
  - CORS configured
  - Helmet security
  - Gzip compression

**Endpoints**:
```
GET    /api/health              # Health check
GET    /api/statistics          # Live stats
GET    /api/users               # List users (paginated)
POST   /api/users               # Create user
GET    /api/users/:id           # Get user
PUT    /api/users/:id           # Update user
DELETE /api/users/:id           # Delete user
GET    /api/posts               # List posts (paginated)
GET    /api/posts/:id           # Get post (increments view)
GET    /api/todos               # List todos
POST   /api/todos               # Create todo
PUT    /api/todos/:id           # Update todo
DELETE /api/todos/:id           # Delete todo
```

### 4. WebSocket Server
- **Technology**: Socket.io
- **Port**: 3002
- **Features**:
  - Room management
  - Chat messages
  - Notifications
  - Real-time data sync
  - Typing indicators
  - Presence tracking
  - Statistics broadcast (every 5s)

**Events**:
```
// Room Management
room:join
room:leave
room:user-joined
room:user-left

// Chat
chat:message
chat:history

// Notifications
notification:send
notification:received

// Data Sync
data:update
data:subscribe
data:unsubscribe

// Statistics
stats:request
stats:update
stats:connections

// Presence
presence:online
presence:away
presence:user-online
presence:user-away

// Typing
typing:start
typing:stop
typing:user-typing
typing:user-stopped
```

## 🔧 Configuration

### Environment Variables

Create `.env` file in `demo/docker`:

```env
# API Server
PORT=3001
DATABASE_URL=postgresql://minder:minder123@postgres:5432/minder
REDIS_URL=redis://redis:6379
JWT_SECRET=your-secret-key-change-in-production-2024
JWT_REFRESH_SECRET=your-refresh-secret-key-2024
CORS_ORIGIN=http://localhost:3000,http://localhost:19000
NODE_ENV=development

# WebSocket Server
WS_PORT=3002
```

## 📈 Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api-server
docker-compose logs -f websocket-server
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Health Checks

```bash
# API Server
curl http://localhost:3001/api/health

# WebSocket Server
curl http://localhost:3002/health

# PostgreSQL
docker-compose exec postgres pg_isready -U minder

# Redis
docker-compose exec redis redis-cli ping
```

### Statistics

```bash
# API Statistics
curl http://localhost:3001/api/statistics

# WebSocket Statistics
curl http://localhost:3002/stats
```

## 🗄️ Database Management

### Connect to PostgreSQL

```bash
docker-compose exec postgres psql -U minder -d minder
```

### Run SQL Queries

```bash
docker-compose exec postgres psql -U minder -d minder -c "SELECT COUNT(*) FROM users;"
```

### Backup Database

```bash
docker-compose exec postgres pg_dump -U minder minder > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T postgres psql -U minder -d minder
```

### Reset Database

```bash
docker-compose down -v
docker-compose up -d
```

## 🔧 Troubleshooting

### Ports Already in Use

```bash
# Find process using port
lsof -i :3001
lsof -i :3002
lsof -i :5432
lsof -i :6379

# Kill process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Restart PostgreSQL
docker-compose restart postgres

# View PostgreSQL logs
docker-compose logs postgres
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker-compose ps redis

# Restart Redis
docker-compose restart redis

# Connect to Redis CLI
docker-compose exec redis redis-cli
```

### API Server Issues

```bash
# Restart API server
docker-compose restart api-server

# View API logs
docker-compose logs -f api-server

# Check API health
curl http://localhost:3001/api/health
```

### WebSocket Issues

```bash
# Restart WebSocket server
docker-compose restart websocket-server

# View WebSocket logs
docker-compose logs -f websocket-server

# Check WebSocket health
curl http://localhost:3002/health
```

## 🧪 Testing

### Test API Endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# Get users
curl http://localhost:3001/api/users

# Get specific user
curl http://localhost:3001/api/users/1

# Create user
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","first_name":"Test","last_name":"User"}'

# Get posts
curl http://localhost:3001/api/posts

# Get todos
curl http://localhost:3001/api/todos

# Create todo
curl -X POST http://localhost:3001/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Todo","priority":"high"}'
```

### Test WebSocket (using wscat)

```bash
# Install wscat
npm install -g wscat

# Connect to WebSocket server
wscat -c ws://localhost:3002

# Join room
{"event":"room:join","data":"general"}

# Send message
{"event":"chat:message","data":{"room":"general","user":"Test User","message":"Hello!"}}

# Request stats
{"event":"stats:request"}
```

## 📦 Development

### Install Dependencies

```bash
# API server
cd demo/docker/api
npm install

# WebSocket server
cd demo/docker/websocket
npm install
```

### Run Locally (without Docker)

```bash
# Start PostgreSQL and Redis with Docker
docker-compose up -d postgres redis

# Run API server locally
cd demo/docker/api
npm run dev

# Run WebSocket server locally
cd demo/docker/websocket
npm run dev
```

## 🎯 Next Steps

1. **Start Docker services**: `docker-compose up -d`
2. **Open demo app**: http://localhost:3000
3. **View live statistics**: http://localhost:3000/statistics
4. **Test API endpoints**: http://localhost:3001/api/health
5. **Monitor WebSocket**: http://localhost:3002/health

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Socket.io Documentation](https://socket.io/docs/)
- [Express Documentation](https://expressjs.com/)

## 🐛 Known Issues

None at the moment. If you encounter any issues, please check the logs first.

## 📝 License

MIT
