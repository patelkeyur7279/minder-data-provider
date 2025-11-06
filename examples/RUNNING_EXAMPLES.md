# 🚀 Running Examples - Quick Start Guide

## ✅ All Services are Running!

All four example applications are now running and ready to use.

## 📍 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| **Mock API** | http://localhost:3001 | Backend API with sample data |
| **Web E-commerce** | http://localhost:5173 | React + Vite shopping cart demo |
| **Next.js Blog** | http://localhost:3002 | SSR/SSG/ISR blog example |
| **Node.js API** | http://localhost:3003 | Express REST API server |

## 🎯 What You Can Do

### 1. Web E-commerce (http://localhost:5173)
**Features Demonstrated:**
- ✅ Product listing with real-time data fetching
- ✅ Shopping cart functionality
- ✅ Search and filtering with debouncing
- ✅ React Query integration
- ✅ Offline support
- ✅ Error handling and loading states

**Try This:**
1. Open http://localhost:5173 in your browser
2. Browse products loaded from Mock API
3. Add items to cart
4. Search for products (notice the debouncing)
5. Open DevTools Network tab to see API calls

### 2. Next.js Blog (http://localhost:3002)
**Features Demonstrated:**
- ✅ Static Site Generation (SSG)
- ✅ Server-Side Rendering (SSR)
- ✅ Incremental Static Regeneration (ISR)
- ✅ API routes
- ✅ SEO optimization

**Try This:**
1. Open http://localhost:3002 in your browser
2. Click on "View (SSR)" to see server-side rendered post
3. Click on "View (ISR)" to see incremental static regeneration
4. Check page source to see pre-rendered HTML

### 3. Mock API (http://localhost:3001)
**Available Endpoints:**
```bash
# Health check
curl http://localhost:3001/health

# Get products
curl http://localhost:3001/products
curl http://localhost:3001/products?limit=5

# Get users
curl http://localhost:3001/users
curl http://localhost:3001/users?limit=3

# Get posts
curl http://localhost:3001/posts

# Get todos
curl http://localhost:3001/todos
```

### 4. Node.js API (http://localhost:3003)
**Available Endpoints:**
```bash
# Health check
curl http://localhost:3003/health

# Users CRUD
curl http://localhost:3003/api/users
curl http://localhost:3003/api/users/1

# Create user
curl -X POST http://localhost:3003/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

# Update user
curl -X PUT http://localhost:3003/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe"}'

# Delete user
curl -X DELETE http://localhost:3003/api/users/1
```

## 🔍 Testing the Integration

### Test 1: Web App → Mock API
1. Open http://localhost:5173
2. Open browser DevTools → Network tab
3. Watch API calls to `http://localhost:3001/products`
4. Products display in the web app

### Test 2: Next.js → Mock API
1. Open http://localhost:3002
2. View page source (right-click → View Page Source)
3. See pre-rendered HTML with post data from Mock API

### Test 3: Node.js API
```bash
# Test CRUD operations
curl -X POST http://localhost:3003/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'

# List users
curl http://localhost:3003/api/users
```

## 📁 Project Structure

```
examples/
├── mock-api/          # Express server with sample data
│   ├── index.js       # Main server file
│   └── PORT: 3001
│
├── web/e-commerce/    # React + Vite example
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── App.tsx
│   └── PORT: 5173
│
├── nextjs/blog/       # Next.js SSR/SSG example
│   ├── pages/
│   ├── components/
│   └── PORT: 3002
│
└── nodejs/api/        # Express REST API
    ├── src/
    │   ├── routes/
    │   ├── middleware/
    │   └── index.ts
    └── PORT: 3003
```

## 🎨 Features Demonstrated

### Minder Data Provider Features:
- ✅ **CRUD Operations** - Create, Read, Update, Delete
- ✅ **Real-time Queries** - React Query integration
- ✅ **Caching** - Automatic data caching
- ✅ **Offline Support** - Works without internet
- ✅ **Error Handling** - Graceful error management
- ✅ **Loading States** - User-friendly loading indicators
- ✅ **Optimistic Updates** - Instant UI feedback
- ✅ **Pagination** - Efficient data loading
- ✅ **Search & Filter** - With debouncing
- ✅ **Platform Detection** - Auto-detects web/node/etc
- ✅ **SSR Support** - Server-side rendering
- ✅ **Rate Limiting** - API protection
- ✅ **Security** - Helmet, CORS, compression

## 🛠️ Development Commands

### Start All Services
```bash
# Terminal 1 - Mock API
cd examples/mock-api
node index.js

# Terminal 2 - Web E-commerce
cd examples/web/e-commerce
npm run dev

# Terminal 3 - Next.js Blog
cd examples/nextjs/blog
PORT=3002 npm run dev

# Terminal 4 - Node.js API
cd examples/nodejs/api
npm run dev
```

### Stop All Services
```bash
# Kill all node processes on specific ports
lsof -ti:3001 | xargs kill -9  # Mock API
lsof -ti:5173 | xargs kill -9  # Web App
lsof -ti:3002 | xargs kill -9  # Next.js
lsof -ti:3003 | xargs kill -9  # Node.js API
```

## 📊 Performance Testing

### Load Testing Mock API
```bash
# Install Apache Bench (if not installed)
brew install httpd

# Test 1000 requests with 10 concurrent connections
ab -n 1000 -c 10 http://localhost:3001/products
```

### Monitor API Response Times
```bash
# Test each endpoint
time curl http://localhost:3001/health
time curl http://localhost:3001/products
time curl http://localhost:3003/api/users
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Mock API Not Responding
```bash
# Check if running
curl http://localhost:3001/health

# Restart
cd examples/mock-api
node index.js
```

### Web App Shows Errors
```bash
# Check .env file exists
cat examples/web/e-commerce/.env

# Should contain:
VITE_USE_MOCK_API=true
VITE_API_URL=http://localhost:3001
```

### Node.js API Won't Start
```bash
# Check .env file
cat examples/nodejs/api/.env

# Should contain:
PORT=3003
NODE_ENV=development
```

## 🎓 Next Steps

1. **Explore the Code**: Check out each example's source code
2. **Modify Features**: Try adding new endpoints or features
3. **Read Documentation**: See `/docs` folder for detailed guides
4. **Run Tests**: `npm test` in each example directory
5. **Build for Production**: `npm run build` in each example

## 📚 Additional Resources

- **API Reference**: `/docs/API_REFERENCE.md`
- **Examples Guide**: `/docs/EXAMPLES.md`
- **Performance Guide**: `/docs/PERFORMANCE_GUIDE.md`
- **Migration Guide**: `/docs/MIGRATION_GUIDE.md`

---

**✨ Congratulations!** All examples are running. You can now explore the full capabilities of minder-data-provider across different platforms and use cases.

**Questions or Issues?** Check the main README.md or create an issue on GitHub.
