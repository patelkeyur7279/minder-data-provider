# Development with Docker

Run all Minder examples in isolated Docker containers for easy testing and development.

## 🚀 Quick Start

```bash
# Start all services
docker-compose up

# Start specific service
docker-compose up web
docker-compose up api

# Stop all services
docker-compose down

# Rebuild after changes
docker-compose up --build
```

## 📦 Services

### 1. Mock API Server (Port 3001)
- JSONPlaceholder mock
- FakeStore API mock
- Local testing endpoints

### 2. Web E-commerce (Port 3000)
- React + Vite
- Product catalog
- Shopping cart

### 3. Next.js Blog (Port 3002)
- SSG/SSR/ISR demos
- API routes
- Blog posts

### 4. Node.js API (Port 3003)
- Express server
- REST endpoints
- Rate limiting

## 🔧 Environment Variables

Create `.env` files in each example:

```bash
# examples/web/e-commerce/.env
VITE_API_URL=http://localhost:3001

# examples/nodejs/api/.env
PORT=3003
API_URL=http://localhost:3001
```

## 📊 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Mock API | http://localhost:3001 | Test endpoints |
| Web App | http://localhost:3000 | E-commerce demo |
| Next.js | http://localhost:3002 | Blog with SSR/SSG |
| API Server | http://localhost:3003 | REST API |

## 🧪 Testing

```bash
# Run tests in container
docker-compose exec web npm test
docker-compose exec api npm test

# Access container shell
docker-compose exec web sh
```

## 🔄 Development Workflow

1. Start services: `docker-compose up`
2. Make code changes (hot reload enabled)
3. Test in browser
4. Run tests: `docker-compose exec [service] npm test`
5. Stop services: `docker-compose down`

## 📝 Troubleshooting

### Port conflicts
```bash
# Check what's using a port
lsof -i :3000

# Change port in docker-compose.yml
```

### Container won't start
```bash
# View logs
docker-compose logs [service]

# Rebuild
docker-compose up --build [service]
```

### Permission issues
```bash
# Fix node_modules permissions
docker-compose exec web chown -R node:node node_modules
```

## 🎯 Production Build

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Run production
docker-compose -f docker-compose.prod.yml up
```
