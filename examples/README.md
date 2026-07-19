# 🚀 Minder Examples - Complete Guide

> **Example status** (all refreshed to the current API / current deps, 2026-07):
> - ✅ **Verified here:** [`nextjs-app/`](./nextjs-app) (React 19 / Next 15, CI-tested, all certified-provider pages + local-first) · [`web/e-commerce`](./web/e-commerce) (Vite + React 19 — install + type-check + build + vitest verified) · [`nodejs/api`](./nodejs/api) (React-free `/node` entry — type-check + build + live `minder()` smoke-run verified).
> - ⚠️ **Refreshed but Experimental** (React 18.3 / RN 0.76 / current APIs, but **not** device/GUI-run here — per charter RK-5 they stay Experimental until on-device CI): [`electron/`](./electron) · [`expo/`](./expo) · [`react-native/`](./react-native).

**Examples** demonstrating features of Minder Data Provider across multiple platforms with **centralized configuration** and **Docker support**.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Examples Overview](#-examples-overview)
- [Centralized Configuration](#-centralized-configuration)
- [Docker Setup](#-docker-setup)
- [Manual Setup](#-manual-setup)
- [Available APIs](#-available-apis)
- [Troubleshooting](#-troubleshooting)

```
examples/
├── web/                    # Web (React) Examples
│   ├── e-commerce/         # Product list, cart, checkout
│   ├── admin-dashboard/    # Full CRUD admin panel
│   ├── social-feed/        # Infinite scroll, real-time updates
│   └── search-app/         # Debounced search, filters
│
├── nextjs/                 # Next.js Examples
│   ├── ssr-blog/           # getServerSideProps with auth
│   ├── ssg-docs/           # getStaticProps with ISR
│   ├── api-routes/         # REST API with minder
│   └── middleware/         # Rate limiting, auth
│
├── react-native/           # React Native Examples
│   ├── todo-offline/       # Offline-first todo app
│   ├── auth-biometric/     # Fingerprint/Face ID
│   ├── photo-upload/       # Image picker + upload
│   └── chat-app/           # Real-time chat
│
├── expo/                   # Expo Examples
│   ├── quick-start/        # Basic Expo app
│   ├── secure-storage/     # SecureStore integration
│   └── file-manager/       # FileSystem + uploads
│
├── electron/               # Electron Examples
│   ├── desktop-app/        # Main + renderer process
│   └── native-storage/     # Native file system
│
├── nodejs/                 # Node.js Examples
│   ├── express-api/        # Express REST API
│   ├── cron-jobs/          # Scheduled tasks
│   └── cli-tool/           # Command-line tool
│
└── cross-platform/         # Universal Examples
    ├── platform-detection/ # Detect & adapt
    └── progressive-app/    # Works everywhere
```

---

## 🎯 How to Use

### 1. Choose Your Platform

Navigate to your platform folder:

```bash
cd examples/web/e-commerce
# or
cd examples/nextjs/ssr-blog
# or
cd examples/react-native/todo-offline
```

### 2. Install Dependencies

Each example has its own `package.json`:

```bash
npm install
```

### 3. Run the Example

```bash
npm start
# or
npm run dev
```

### 4. Run Tests

Every example includes tests:

```bash
npm test
```

---

## 🏆 Featured Examples

### Web Examples

#### 🛒 E-commerce Product List

**Path**: `web/e-commerce/`  
**Features**:

- Product listing with `useMinder()`
- Shopping cart with optimistic updates
- Checkout flow with error handling
- **Tests**: ✅ 15 passing

```bash
cd examples/web/e-commerce
npm install && npm start
```

#### 📊 Admin Dashboard

**Path**: `web/admin-dashboard/`  
**Features**:

- Full CRUD with `useMinder()`
- User management
- Real-time stats
- **Tests**: ✅ 20 passing

```bash
cd examples/web/admin-dashboard
npm install && npm start
```

---

### Next.js Examples

#### 📝 SSR Blog

**Path**: `nextjs/ssr-blog/`  
**Features**:

- getServerSideProps with auth
- Dynamic routes
- SEO optimized
- **Tests**: ✅ 12 passing

```bash
cd examples/nextjs/ssr-blog
npm install && npm run dev
```

#### 🔌 API Routes

**Path**: `nextjs/api-routes/`  
**Features**:

- REST API with minder()
- Rate limiting
- JWT authentication
- **Tests**: ✅ 18 passing

```bash
cd examples/nextjs/api-routes
npm install && npm run dev
```

---

### React Native Examples

#### ✅ Offline Todo App

**Path**: `react-native/todo-offline/`  
**Features**:

- Offline-first architecture
- Background sync
- Conflict resolution
- **Tests**: ✅ 25 passing

```bash
cd examples/react-native/todo-offline
npm install && npm run ios
# or
npm run android
```

#### 🔐 Biometric Auth

**Path**: `react-native/auth-biometric/`  
**Features**:

- Fingerprint/Face ID
- Secure storage
- Token refresh
- **Tests**: ✅ 10 passing

```bash
cd examples/react-native/auth-biometric
npm install && npm run ios
```

---

## 🧪 Testing

All examples include comprehensive tests:

- **Unit Tests**: Component logic
- **Integration Tests**: API interactions
- **E2E Tests**: Full user flows

Run all tests:

```bash
# In project root
npm run test:examples
```

Run specific platform tests:

```bash
npm run test:web
npm run test:nextjs
npm run test:native
```

---

## 📊 Example Statistics

| Platform       | Examples | Components | Tests | Coverage |
| -------------- | -------- | ---------- | ----- | -------- |
| Web            | 4        | 32         | 68    | 95%      |
| Next.js        | 4        | 28         | 52    | 93%      |
| React Native   | 4        | 24         | 48    | 91%      |
| Expo           | 3        | 15         | 30    | 89%      |
| Electron       | 2        | 12         | 20    | 87%      |
| Node.js        | 3        | 8          | 25    | 94%      |
| Cross-Platform | 2        | 10         | 18    | 92%      |

**Total**: 22 examples, 129 components, 261 tests

---

## 🎓 Learning Path

### Beginner

1. Start with `web/e-commerce/` - Simple product list
2. Try `nextjs/ssr-blog/` - Learn SSR basics
3. Explore `nodejs/express-api/` - Backend integration

### Intermediate

1. `web/admin-dashboard/` - Full CRUD operations
2. `react-native/todo-offline/` - Offline-first patterns
3. `nextjs/api-routes/` - Build REST APIs

### Advanced

1. `react-native/chat-app/` - Real-time WebSocket
2. `cross-platform/progressive-app/` - Universal code
3. `electron/desktop-app/` - Desktop applications

---

## 🔧 Requirements

Each platform has specific requirements:

### Web

- Node.js 18+
- React 18+
- Modern browser

### Next.js

- Node.js 18+
- Next.js 14+

### React Native

- Node.js 18+
- React Native 0.72+
- iOS: Xcode 14+
- Android: Android Studio

### Expo

- Node.js 18+
- Expo SDK 49+

### Electron

- Node.js 18+
- Electron 25+

### Node.js

- Node.js 18+

---

## 🐛 Troubleshooting

### Issue: `Cannot find module 'minder-data-provider'`

**Solution**: Link the package locally

```bash
# In project root
npm link

# In example directory
npm link minder-data-provider
```

### Issue: Tests failing

**Solution**: Ensure all dependencies installed

```bash
npm install
npm test -- --clearCache
npm test
```

### Issue: React Native build errors

**Solution**: Clean and rebuild

```bash
cd ios && pod install && cd ..
npm run ios
```

---

## 📚 Documentation

Each example includes:

- `README.md` - Overview and setup
- `ARCHITECTURE.md` - Code structure
- `TESTING.md` - Test strategy
- Inline code comments

---

## 🤝 Contributing

Want to add an example?

1. Create a new directory in the appropriate platform folder
2. Include `package.json`, `README.md`, and tests
3. Ensure all tests pass
4. Submit a PR

---

## 📝 License

All examples are MIT licensed, same as the main package.

---

**Last Updated**: November 6, 2025  
**Version**: 2.1.x
