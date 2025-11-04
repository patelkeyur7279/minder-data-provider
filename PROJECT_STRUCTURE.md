# Minder Data Provider - Clean Project Structure

## 🎯 Project Overview
A modern React data provider with a single universal `minder()` function that handles all data operations including authentication, CRUD, caching, and real-time features.

## 📁 Project Structure

```
minder-data-provider/
├── src/                          # Source code (bundled package)
│   ├── index.ts                  # Main exports: minder(), useMinder(), BaseModel
│   ├── core/                     # Core functionality
│   │   ├── minder.ts            # Universal minder() function (510KB bundled)
│   │   ├── ApiClient.ts         # HTTP client
│   │   ├── AuthManager.ts       # Authentication
│   │   ├── CacheManager.ts      # TanStack Query integration
│   │   └── ...                  # Other core modules
│   ├── hooks/                    # React hooks
│   │   └── useMinder.ts         # Main hook for using minder()
│   └── utils/                    # Utilities
│
├── demo/                         # Next.js demo application
│   ├── pages/                    # Next.js pages
│   │   ├── _app.tsx             # App wrapper
│   │   ├── index.tsx            # Homepage with demo links
│   │   ├── test-new-api.tsx     # API testing page
│   │   └── auth/                # Authentication demo
│   │       ├── login.tsx        # Login page (DummyJSON API)
│   │       ├── register.tsx     # Registration page
│   │       └── dashboard.tsx    # Protected dashboard with user list
│   │
│   ├── config/                   # Configuration files
│   │   ├── minder.base.ts       # Base configuration
│   │   ├── minder.config.ts     # Main config
│   │   ├── minder.environments.ts
│   │   └── minder.types.ts
│   │
│   ├── AUTH_DEMO_README.md      # Authentication demo documentation
│   ├── package.json             # Demo dependencies
│   ├── next.config.js           # Next.js configuration
│   └── tsconfig.json            # TypeScript config
│
├── dist/                         # Built package (510KB)
├── tests/                        # Test files
├── package.json                  # Package configuration
├── tsconfig.json                 # Root TypeScript config
├── tsup.config.ts               # Build configuration
└── README.md                     # Main documentation
```

## 🚀 Quick Start

### Install Package
```bash
npm install minder-data-provider
# or
yarn add minder-data-provider
```

### Run Demo
```bash
cd demo
npm install
npm run dev
# Visit http://localhost:5100
```

## 📦 What's Included

### ✅ Kept Files
- **Source Code**: All `/src` files for package functionality
- **Demo App**: Complete authentication example with DummyJSON API
- **Configuration**: All config files needed for Next.js and TypeScript
- **Documentation**: README.md and AUTH_DEMO_README.md
- **Build Files**: package.json, tsconfig.json, tsup.config.ts

### 🗑️ Removed Files (Cleanup)
- ❌ `/demo/features/` - 17 old demo files using legacy hooks
- ❌ `/demo/App.tsx` - Old app component
- ❌ `/demo/docker/` - Docker configuration
- ❌ `/demo/types/` - Unused type definitions
- ❌ `/demo/styles.css` - Old styles (19KB)
- ❌ `/demo/index.html` - Old HTML file
- ❌ `/demo/test-cors.html` - CORS test file
- ❌ `/demo/cors-solution-guide.tsx` - Old guide
- ❌ `/demo/generate-proxy.tsx` - Proxy generator
- ❌ `/demo/pages/api/` - Unused API routes
- ❌ `/demo/pages/test.tsx` - Old test page
- ❌ `CORS_SOLUTION.md` - Old documentation
- ❌ `NEW_ARCHITECTURE.md` - Old architecture doc

## 🎨 Demo Features

### Authentication Demo
Complete authentication system using DummyJSON API:

1. **Login Page** (`/auth/login`)
   - Email/password authentication
   - Token storage (accessToken, refreshToken)
   - Demo credentials: emilys/emilyspass

2. **Register Page** (`/auth/register`)
   - User registration form
   - Password validation
   - Auto-login after registration

3. **Dashboard** (`/auth/dashboard`)
   - Protected route
   - User profile display
   - User list with pagination (10 per page)
   - Search functionality
   - Logout

### API Demo
- **Test New API** (`/test-new-api`)
  - Complete API testing page
  - Examples of all minder() features

## 🔧 Main API

### minder() Function
```typescript
import { minder } from 'minder-data-provider';

// GET request
const users = await minder({
  url: 'https://dummyjson.com/users',
  method: 'GET'
});

// POST with auth
const result = await minder({
  url: 'https://api.example.com/data',
  method: 'POST',
  data: { name: 'John' },
  auth: true,
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### useMinder() Hook
```typescript
import { useMinder } from 'minder-data-provider';

function MyComponent() {
  const { data, isLoading, error } = useMinder({
    url: 'https://dummyjson.com/users',
    method: 'GET'
  });
  
  return <div>{data?.users?.map(u => u.name)}</div>;
}
```

## 📊 Package Size
- **Total Bundle**: 510KB (includes TanStack Query, Redux Toolkit, axios)
- **Zero peer dependencies** (except React)
- **Tree-shakeable**: Import only what you need

## 🛠️ Tech Stack
- **React 18.2.0**
- **Next.js 14.0.3**
- **TypeScript 5.4.3**
- **TanStack Query 5.59.20** (bundled)
- **Redux Toolkit 2.3.0** (bundled)
- **axios 1.7.7** (bundled)

## 📝 Development

### Build Package
```bash
npm run build
# or
yarn build
```

### Run Tests
```bash
npm test
# or
yarn test
```

## 🎯 Key Features
- ✅ Single universal `minder()` function
- ✅ Complete authentication system
- ✅ Token management (localStorage)
- ✅ Automatic caching with TanStack Query
- ✅ TypeScript support
- ✅ Clean, production-ready code
- ✅ Zero configuration needed
- ✅ All dependencies bundled

## 📚 Documentation
- Main README: `/README.md`
- Auth Demo Guide: `/demo/AUTH_DEMO_README.md`
- API Reference: See source code in `/src`

## 🌐 Demo API
Using **DummyJSON** (https://dummyjson.com) for demo:
- User authentication
- User management
- CRUD operations
- Search functionality

## 🎉 Clean Code Principles
- No legacy components
- No unused dependencies
- Clear file structure
- Well-documented
- Production-ready examples
- TypeScript strict mode

---

**Version**: 1.0.0  
**License**: MIT  
**Last Updated**: Nov 4, 2024
