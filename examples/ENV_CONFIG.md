# Environment Configuration Guide

## 🔧 Environment Variables

Each example supports environment-based configuration for API endpoints.

### Web E-commerce (React + Vite)

Create `.env` file:

```bash
# Use mock API (for Docker/local testing)
VITE_USE_MOCK_API=true

# Or specify custom API URL
# VITE_API_URL=http://localhost:3001
```

**Default behavior:**

- `VITE_USE_MOCK_API=true` → Uses http://localhost:3001 (mock API)
- `VITE_API_URL` set → Uses specified URL
- No env vars → Uses https://fakestoreapi.com (production)

### Next.js Blog

Create `.env.local` file:

```bash
API_URL=http://localhost:3001
PORT=3002
```

**Default behavior:**

- `API_URL` set → Uses specified URL
- No env var → Uses https://jsonplaceholder.typicode.com (production)

### Node.js Express API

Create `.env` file:

```bash
API_URL=http://localhost:3001
PORT=3003
```

**Default behavior:**

- `API_URL` set → Uses specified URL
- No env var → Uses https://jsonplaceholder.typicode.com (production)

## 🐳 Docker Configuration

When running with Docker, environment variables are automatically set in `docker-compose.yml`:

```yaml
services:
  web:
    environment:
      - VITE_USE_MOCK_API=true
      - VITE_API_URL=http://localhost:3001

  nextjs:
    environment:
      - API_URL=http://localhost:3001

  api:
    environment:
      - API_URL=http://localhost:3001
```

All services automatically connect to the mock API at port 3001.

## 📝 Example Configurations

### Local Development (Mock API)

```bash
# Terminal 1: Start mock API
cd examples/mock-api
npm start

# Terminal 2: Web app with mock API
cd examples/web/e-commerce
echo "VITE_USE_MOCK_API=true" > .env
npm run dev
```

### Production (Real APIs)

```bash
# No .env file needed - uses production APIs by default
cd examples/web/e-commerce
npm run dev  # Uses https://fakestoreapi.com
```

### Custom API Server

```bash
# Point to your own API
cd examples/web/e-commerce
echo "VITE_API_URL=https://my-api.com" > .env
npm run dev
```

## 🎯 Quick Start

1. **Copy example env files:**

   ```bash
   cp examples/web/e-commerce/.env.example .env
   cp examples/nextjs/blog/.env.example .env.local
   cp examples/nodejs/api/.env.example .env
   ```

2. **Edit as needed** (or leave defaults)

3. **Start services:**

   ```bash
   # With Docker
   ./docker-start.sh

   # Or manually
   cd mock-api && npm start
   cd web/e-commerce && npm run dev
   ```
