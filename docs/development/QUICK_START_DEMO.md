# 🚀 Quick Start Guide - Minder Demo v2.1.1

This guide will get you up and running with the complete Minder Data Provider demo in **under 10 minutes**.

---

## 📋 Prerequisites

- **Node.js** 18+ installed
- **Docker** and **Docker Compose** installed
- **Git** (to clone the repository)
- **Modern browser** (Chrome, Firefox, Safari, Edge)

---

## ⚡ 3-Step Quick Start

### Step 1: Install Dependencies (2 minutes)

```bash
# Navigate to demo directory
cd demo

# Install all dependencies
npm install

# Install additional required packages
npm install socket.io-client web-vitals
```

### Step 2: Start Docker Services (1 minute)

```bash
# Navigate to docker directory
cd docker

# Start all backend services
docker-compose up -d

# Wait for services to initialize (~30 seconds)
# You'll see:
# ✅ PostgreSQL (port 5432)
# ✅ Redis (port 6379)
# ✅ API Server (port 3001)
# ✅ WebSocket Server (port 3002)
```

### Step 3: Launch Demo App (30 seconds)

```bash
# Go back to demo directory
cd ..

# Start Next.js development server
npm run dev
```

**🎉 Done! Open your browser:**
- **Main Demo**: http://localhost:3000/demo
- **Live Statistics**: http://localhost:3000/statistics

---

## 🧪 Verify Installation

### Check Docker Services

```bash
# Check all services are running
docker ps

# Test API server
curl http://localhost:3001/api/health
# Expected: {"status": "ok", "timestamp": "..."}

# Test database connection
docker exec -it postgres psql -U postgres -d minder_demo -c "SELECT COUNT(*) FROM users;"
# Expected: 5 users

# Test Redis
docker exec -it redis redis-cli PING
# Expected: PONG
```

### Test WebSocket Connection

```bash
# Test WebSocket server
curl http://localhost:3002/health
# Expected: {"status": "ok"}
```

---

## 🎮 Using the Demo

### Main Demo Page (`/demo`)

**Features:**
- 10 interactive feature panels
- Live statistics dashboard (toggle on/off)
- System status indicators
- Feature navigation

**What to try:**
1. **CRUD Operations**: Create, edit, delete users
2. **Authentication**: Login with demo credentials (alice@example.com / password123)
3. **Caching**: Adjust TTL, invalidate cache, see hit rates
4. **WebSocket**: Join rooms, send chat messages
5. **File Upload**: Upload files with progress tracking
6. **Offline Mode**: Toggle network, see queue management
7. **Performance**: View bundle analysis, lazy loading
8. **Security**: Test CSRF, XSS protection
9. **Platform Detection**: See your browser/device info
10. **Configuration**: Manage environment settings

### Live Statistics Page (`/statistics`)

**Real-time Monitoring:**
- Core Web Vitals (LCP, FID, CLS, TTFB, FCP)
- API latency percentiles (P50, P95, P99)
- Cache hit rate
- Network activity graph
- Active features
- Error tracking
- Resource monitoring

**Updates every 5 seconds automatically!**

---

## 🔧 Troubleshooting

### Issue: Docker services won't start

**Solution:**
```bash
# Stop all containers
docker-compose down

# Remove volumes (fresh start)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build
```

### Issue: Port already in use

**Solution:**
```bash
# Check what's using the port
lsof -i :3001  # API server
lsof -i :3002  # WebSocket
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill the process or change ports in docker-compose.yml
```

### Issue: Cannot connect to API

**Solution:**
```bash
# Check API server logs
docker logs api-server

# Restart API server
docker-compose restart api-server

# Test connection
curl -v http://localhost:3001/api/health
```

### Issue: TypeScript errors

**Solution:**
```bash
# Install missing dependencies
npm install socket.io-client web-vitals

# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

### Issue: Database not seeded

**Solution:**
```bash
# Connect to PostgreSQL
docker exec -it postgres psql -U postgres -d minder_demo

# Check data
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM posts;

# Re-run seed script if needed
docker exec -it postgres psql -U postgres -d minder_demo -f /docker-entrypoint-initdb.d/seed.sql
```

---

## 📊 What's Running?

### Backend Services

| Service | Port | Purpose | Health Check |
|---------|------|---------|--------------|
| PostgreSQL | 5432 | Database | `docker exec -it postgres pg_isready` |
| Redis | 6379 | Cache & PubSub | `docker exec -it redis redis-cli PING` |
| API Server | 3001 | REST API | `curl localhost:3001/api/health` |
| WebSocket | 3002 | Real-time | `curl localhost:3002/health` |

### Frontend

| Page | URL | Purpose |
|------|-----|---------|
| Home | http://localhost:3000 | Landing page |
| Demo | http://localhost:3000/demo | All features |
| Statistics | http://localhost:3000/statistics | Live metrics |

---

## 🎯 Sample Data

### Users (5 total)
- Alice Johnson (alice@example.com) - Admin
- Bob Smith (bob@example.com) - User
- Charlie Brown (charlie@example.com) - User
- Diana Prince (diana@example.com) - Moderator
- Eve Davis (eve@example.com) - User

### Posts (5 total)
- Various blog posts with full content
- Authored by different users
- Timestamps included

### Comments (9 total)
- Comments on posts
- Multiple users engaged

### Todos (10 total)
- Sample todo items
- Mix of completed/incomplete

---

## 🔥 Pro Tips

### 1. Monitor Everything

Open both pages side-by-side:
- **Left window**: http://localhost:3000/demo (try features)
- **Right window**: http://localhost:3000/statistics (watch metrics update)

### 2. Use Browser DevTools

```
Press F12 to open DevTools
- Network tab: See API calls
- Console: View WebSocket events
- Performance tab: Check Web Vitals
```

### 3. Docker Commands

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f api-server

# Restart a service
docker-compose restart websocket-server

# Stop all services
docker-compose down

# Start with rebuild
docker-compose up -d --build
```

### 4. Database Access

```bash
# Connect to PostgreSQL
docker exec -it postgres psql -U postgres -d minder_demo

# Useful queries:
SELECT * FROM users LIMIT 5;
SELECT * FROM posts WHERE user_id = 1;
SELECT COUNT(*) FROM statistics;

# Exit: \q
```

### 5. Redis Monitoring

```bash
# Connect to Redis CLI
docker exec -it redis redis-cli

# Check keys
KEYS *

# Monitor commands
MONITOR

# Exit: exit
```

---

## 📈 Performance Benchmarks

### Expected Metrics

**API Performance:**
- Average latency (P50): < 50ms
- P95 latency: < 150ms
- P99 latency: < 300ms

**Cache Performance:**
- Hit rate: > 80%
- Average retrieval: < 5ms

**Frontend Performance:**
- First Load JS: ~250KB
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.0s
- Time to Interactive: < 2.5s

**WebSocket:**
- Connection time: < 100ms
- Message latency: < 20ms

---

## 🎨 Customization

### Change API Port

Edit `demo/docker/docker-compose.yml`:
```yaml
api-server:
  ports:
    - "3001:3000"  # Change 3001 to your preferred port
```

### Change Database Credentials

Edit `demo/docker/docker-compose.yml`:
```yaml
postgres:
  environment:
    POSTGRES_USER: myuser        # Change username
    POSTGRES_PASSWORD: mypass    # Change password
    POSTGRES_DB: mydb            # Change database name
```

### Add More Sample Data

Edit `demo/docker/postgres/seed.sql`:
```sql
INSERT INTO users (name, email, bio)
VALUES ('Your Name', 'your@email.com', 'Your bio');
```

Then rebuild:
```bash
docker-compose down -v
docker-compose up -d
```

---

## 🛠️ Development Workflow

### Recommended Setup

1. **Terminal 1**: Docker logs
   ```bash
   cd demo/docker
   docker-compose logs -f
   ```

2. **Terminal 2**: Next.js dev server
   ```bash
   cd demo
   npm run dev
   ```

3. **Terminal 3**: Available for commands
   ```bash
   # Run tests, database queries, etc.
   ```

### Hot Reload

- **Frontend**: Automatic (Next.js)
- **Backend API**: Manual restart required
  ```bash
  docker-compose restart api-server
  ```

---

## 📚 Next Steps

1. **Explore All Features**
   - Try each of the 10 feature panels
   - Monitor statistics in real-time
   - Test edge cases

2. **Read Documentation**
   - [API Reference](../docs/API_REFERENCE.md)
   - [Examples](../docs/EXAMPLES.md)
   - [Performance Guide](../docs/PERFORMANCE_GUIDE.md)

3. **Customize**
   - Modify sample data
   - Add new API endpoints
   - Create custom panels

4. **Deploy**
   - Build for production
   - Deploy to Vercel/Netlify
   - Use managed PostgreSQL/Redis

---

## 🎉 You're All Set!

The Minder Data Provider demo is now running with:
- ✅ 4 Docker services (PostgreSQL, Redis, API, WebSocket)
- ✅ Live statistics dashboard
- ✅ 10 interactive feature panels
- ✅ Real-time monitoring
- ✅ Sample data loaded

**Enjoy exploring all the features! 🚀**

---

## 🆘 Need Help?

- **Documentation**: Check `/docs` folder
- **Examples**: See `EXAMPLES_COMPLETE.md`
- **Issues**: Check `ERRORS_FIXED.md`
- **FAQ**: See `CAPABILITIES_FAQ.md`

**Happy coding! 🎊**
