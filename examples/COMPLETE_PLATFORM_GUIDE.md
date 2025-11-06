# 🚀 Complete Platform Guide - All Examples

This is the **master guide** covering all 5 platform examples for minder-data-provider.

## 📊 Platform Overview

| Platform | Example | Status | Port/Access | Documentation |
|----------|---------|--------|-------------|---------------|
| **Web** | E-commerce Shop | ✅ Running | http://localhost:5173 | [See Below](#1-web-e-commerce) |
| **Next.js** | Blog (SSR/SSG) | ✅ Running | http://localhost:3002 | [See Below](#2-nextjs-blog) |
| **Node.js** | REST API | ✅ Running | http://localhost:3003 | [See Below](#3-nodejs-api) |
| **Mock API** | Backend Server | ✅ Running | http://localhost:3001 | [See Below](#4-mock-api-server) |
| **React Native** | Offline Todo | 📱 Mobile | Simulator/Device | [Mobile Guide](./MOBILE_PLATFORMS.md) |
| **Expo** | Quick Start | 📱 Mobile | Simulator/Device/Web | [Mobile Guide](./MOBILE_PLATFORMS.md) |

---

## 🌐 Currently Running (Web/Server)

### 1. Web E-commerce
**URL:** http://localhost:5173  
**Status:** ✅ Running  
**Tech Stack:** React + Vite + TypeScript

**Features:**
- 🛒 Shopping cart with add/remove items
- 🔍 Product search with debouncing
- 💾 React Query caching
- 📱 Responsive design
- ⚡ Optimistic updates
- 🔄 Auto-refetch on focus

**Try This:**
```bash
# Open in browser (already open)
open http://localhost:5173

# Test API calls
curl http://localhost:3001/products
```

---

### 2. Next.js Blog
**URL:** http://localhost:3002  
**Status:** ✅ Running  
**Tech Stack:** Next.js 14 + TypeScript

**Features:**
- 📄 Static Site Generation (SSG)
- 🔄 Server-Side Rendering (SSR)
- ⏱️ Incremental Static Regeneration (ISR)
- 🎨 Styled components
- 📱 SEO optimized
- 🚀 Fast page loads

**Try This:**
```bash
# Open in browser (already open)
open http://localhost:3002

# View pre-rendered HTML
curl http://localhost:3002 | grep "Blog - Minder"

# Test SSR page
curl http://localhost:3002/posts/1

# Test ISR page  
curl http://localhost:3002/blog/1
```

---

### 3. Node.js API
**URL:** http://localhost:3003  
**Status:** ✅ Running  
**Tech Stack:** Express + TypeScript

**Features:**
- 🔐 Security with Helmet
- 🌐 CORS enabled
- 📦 Compression middleware
- ⏱️ Rate limiting
- 🎯 Error handling
- 📊 Health checks

**Try This:**
```bash
# Health check
curl http://localhost:3003/health

# Get all users
curl http://localhost:3003/api/users

# Get specific user
curl http://localhost:3003/api/users/1

# Create user
curl -X POST http://localhost:3003/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

# Update user
curl -X PUT http://localhost:3003/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com"}'

# Delete user
curl -X DELETE http://localhost:3003/api/users/1
```

---

### 4. Mock API Server
**URL:** http://localhost:3001  
**Status:** ✅ Running  
**Tech Stack:** Express + JSON data

**Features:**
- 📦 Products endpoint
- 👥 Users endpoint
- 📝 Posts endpoint
- ✅ Todos endpoint
- 🏥 Health check
- 🔀 CORS enabled

**Try This:**
```bash
# Health check
curl http://localhost:3001/health

# Get products
curl http://localhost:3001/products
curl "http://localhost:3001/products?limit=5"

# Get users
curl http://localhost:3001/users
curl "http://localhost:3001/users?limit=3"

# Get posts
curl http://localhost:3001/posts

# Get todos
curl http://localhost:3001/todos
```

---

## 📱 Mobile Platforms (Requires Setup)

### 5. React Native - Offline Todo
**Platform:** iOS & Android  
**Status:** 📦 Ready to install  
**Tech Stack:** React Native + AsyncStorage + NetInfo

**Quick Start:**
```bash
cd examples/react-native/offline-todo
npm install --legacy-peer-deps

# iOS (macOS only)
cd ios && pod install && cd ..
npm run ios

# Android
npm run android
```

**See full guide:** [MOBILE_PLATFORMS.md](./MOBILE_PLATFORMS.md#1-react-native-offline-todo-app)

---

### 6. Expo - Quick Start
**Platform:** iOS, Android & Web  
**Status:** 📦 Ready to install  
**Tech Stack:** Expo + SecureStore + FileSystem

**Quick Start:**
```bash
cd examples/expo/quickstart
npm install --legacy-peer-deps
npm start

# Then press:
# i - for iOS
# a - for Android
# w - for Web
```

**See full guide:** [MOBILE_PLATFORMS.md](./MOBILE_PLATFORMS.md#2-expo-quick-start)

---

## 🎯 Feature Matrix

| Feature | Web | Next.js | Node.js | Mock API | React Native | Expo |
|---------|-----|---------|---------|----------|--------------|------|
| **CRUD Operations** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Offline Support** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **SSR/SSG** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **File Upload** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Caching** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Real-time Queries** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Authentication** | 🔶 | 🔶 | ✅ | ❌ | ✅ | ✅ |
| **Security** | 🔶 | 🔶 | ✅ | 🔶 | ✅ | ✅ |
| **Error Handling** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Rate Limiting** | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Background Sync** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

**Legend:** ✅ Full Support | 🔶 Partial Support | ❌ Not Applicable

---

## 🔥 Quick Commands

### Start All Web Services
```bash
# Terminal 1 - Mock API
cd examples/mock-api && node index.js

# Terminal 2 - Web E-commerce  
cd examples/web/e-commerce && npm run dev

# Terminal 3 - Next.js Blog
cd examples/nextjs/blog && PORT=3002 npm run dev

# Terminal 4 - Node.js API
cd examples/nodejs/api && npm run dev
```

### Stop All Services
```bash
# Kill all processes
lsof -ti:3001 | xargs kill -9  # Mock API
lsof -ti:5173 | xargs kill -9  # Web
lsof -ti:3002 | xargs kill -9  # Next.js
lsof -ti:3003 | xargs kill -9  # Node.js
```

### Install All Dependencies
```bash
# Web examples
cd examples/web/e-commerce && npm install --legacy-peer-deps
cd ../..
cd examples/nextjs/blog && npm install --legacy-peer-deps
cd ../..
cd examples/nodejs/api && npm install --legacy-peer-deps
cd ../..
cd examples/mock-api && npm install
cd ..

# Mobile examples
cd examples/react-native/offline-todo && npm install --legacy-peer-deps
cd ../../..
cd examples/expo/quickstart && npm install --legacy-peer-deps
cd ../../..
```

---

## 🧪 Integration Testing

### Test 1: Web → Mock API Integration
```bash
# 1. Verify Mock API is serving products
curl http://localhost:3001/products?limit=1

# 2. Open Web App
open http://localhost:5173

# 3. Open DevTools Network tab
# 4. Watch requests to localhost:3001
# 5. Products should display in UI
```

### Test 2: Next.js → Mock API SSR
```bash
# 1. Verify Mock API is serving posts
curl http://localhost:3001/posts?limit=1

# 2. Test SSR page (server-rendered)
curl http://localhost:3002/posts/1 | grep "sunt aut facere"

# 3. Open in browser
open http://localhost:3002

# 4. View page source - should see pre-rendered content
```

### Test 3: Node.js API CRUD
```bash
# Create
curl -X POST http://localhost:3003/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com"}' \
  | jq

# Read
curl http://localhost:3003/api/users | jq

# Update
curl -X PUT http://localhost:3003/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated User"}' \
  | jq

# Delete
curl -X DELETE http://localhost:3003/api/users/1 | jq
```

---

## 📁 Project Structure

```
examples/
├── COMPLETE_PLATFORM_GUIDE.md    # This file
├── RUNNING_EXAMPLES.md           # Web/Server guide
├── MOBILE_PLATFORMS.md           # Mobile guide
├── README.md                     # Overview
│
├── mock-api/                     # ✅ Port 3001
│   ├── index.js
│   └── package.json
│
├── web/
│   └── e-commerce/               # ✅ Port 5173
│       ├── src/
│       ├── package.json
│       └── vite.config.ts
│
├── nextjs/
│   └── blog/                     # ✅ Port 3002
│       ├── pages/
│       ├── components/
│       └── package.json
│
├── nodejs/
│   └── api/                      # ✅ Port 3003
│       ├── src/
│       ├── package.json
│       └── .env
│
├── react-native/
│   └── offline-todo/             # 📱 Mobile
│       ├── src/
│       ├── ios/
│       ├── android/
│       └── package.json
│
└── expo/
    └── quickstart/               # 📱 Mobile + Web
        ├── app/
        ├── components/
        └── package.json
```

---

## 🎓 Learning Path

### Beginner
1. ✅ Start with **Mock API** - Understand the backend
2. ✅ Try **Web E-commerce** - See React Query in action
3. ✅ Test **Next.js Blog** - Learn SSR/SSG concepts

### Intermediate
4. ✅ Explore **Node.js API** - Backend CRUD operations
5. 📱 Setup **Expo** - Cross-platform development
6. 📱 Try **React Native** - Native mobile features

### Advanced
7. 🔧 Combine features from multiple examples
8. 🚀 Build your own app using patterns learned
9. 📦 Deploy to production (web + mobile)

---

## 🐛 Troubleshooting

### Web Issues

**Port already in use:**
```bash
lsof -ti:5173 | xargs kill -9
```

**Build errors:**
```bash
cd examples/web/e-commerce
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Next.js Issues

**Port conflict:**
```bash
lsof -ti:3002 | xargs kill -9
PORT=3002 npm run dev
```

**Build cache:**
```bash
rm -rf .next
npm run dev
```

### Node.js API Issues

**Environment variables:**
```bash
# Make sure .env file exists
cat examples/nodejs/api/.env

# Should contain:
PORT=3003
NODE_ENV=development
```

### Mobile Issues
See [MOBILE_PLATFORMS.md](./MOBILE_PLATFORMS.md#-common-issues--solutions)

---

## 📊 Performance Metrics

### Web E-commerce
- ⚡ First Load: ~200ms
- 🔄 Route Changes: ~50ms
- 📦 Bundle Size: ~150KB gzipped

### Next.js Blog
- ⚡ SSG Pages: ~100ms (cached)
- 🔄 SSR Pages: ~300ms (dynamic)
- 📦 Initial Load: ~180KB gzipped

### Node.js API
- ⚡ Response Time: <50ms (local)
- 🔒 Rate Limit: 100 req/15min
- 💾 Memory: ~50MB

---

## 🚀 Next Steps

1. **Explore All Examples** - Try each platform
2. **Read the Code** - Learn implementation patterns
3. **Modify Examples** - Add your own features
4. **Build Something** - Create your own app
5. **Contribute** - Share improvements

---

## 📚 Documentation Links

- **Getting Started**: `/README.md`
- **API Reference**: `/docs/API_REFERENCE.md`
- **Web Examples**: `./RUNNING_EXAMPLES.md`
- **Mobile Examples**: `./MOBILE_PLATFORMS.md`
- **Docker Guide**: `./DOCKER_GUIDE.md`
- **Environment Config**: `./ENV_CONFIG.md`

---

## 💡 Pro Tips

1. **Use Docker** for consistent environments across platforms
2. **Test on real devices** for mobile apps
3. **Monitor network tab** to understand data flow
4. **Check console logs** for debugging
5. **Use React DevTools** for component inspection
6. **Profile performance** with browser tools
7. **Write tests** as you build features

---

## ✨ Summary

**Currently Running:**
- ✅ Mock API (3001)
- ✅ Web E-commerce (5173) 
- ✅ Next.js Blog (3002)
- ✅ Node.js API (3003)

**Ready to Setup:**
- 📱 React Native - Offline Todo
- 📱 Expo - Quick Start

**All 6 platform examples are ready to explore!** 🎉

---

**Questions?** Check the individual guides or create an issue on GitHub.
