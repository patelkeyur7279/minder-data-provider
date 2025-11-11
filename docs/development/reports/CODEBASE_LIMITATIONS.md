# 🔍 Codebase Limitations Analysis

**Date:** November 11, 2025  
**Version:** 2.0.3  
**Branch:** feature/complete-overhaul  
**Analysis Type:** End-User Impact Assessment

---

## 📊 Executive Summary

This document identifies **limitations and constraints** that end-users will encounter when using `minder-data-provider`. These are **NOT bugs** but intentional design decisions, technology constraints, or features that are incomplete/missing.

### 🎯 Impact Levels

- 🔴 **CRITICAL** - Blocks common use cases, requires workarounds
- 🟡 **MODERATE** - Limits certain features, alternatives available
- 🟢 **MINOR** - Edge cases, advanced users only

---

## 🔴 Critical Limitations

### 1. **React-Only Framework** 🔴

**Limitation:** Package ONLY works with React-based frameworks.

**Impact:**

```typescript
// ❌ DOES NOT WORK
// - Vue.js applications
// - Angular applications
// - Svelte applications
// - Vanilla JavaScript
// - jQuery projects
```

**Why:** Core architecture depends on:

- React hooks (`useState`, `useEffect`, `useContext`)
- React Query (`@tanstack/react-query`)
- React Redux (`react-redux`)

**Workaround:** None. Must use React.

**User Pain Points:**

- Teams with Vue/Angular can't use this
- Cannot share with non-React projects
- Forces React adoption

**Recommendation:** Document clearly in README that this is React-only.

---

### 2. **No Native GraphQL Support** 🔴

**Limitation:** Only supports REST APIs. No built-in GraphQL client.

**Impact:**

```typescript
// ❌ NOT SUPPORTED
const { data } = useMinder("graphql-query", {
  query: `
    query GetUsers {
      users {
        id
        name
      }
    }
  `,
});

// ✅ MUST USE REST
const { data } = useMinder("users"); // REST only
```

**Why:** Architecture designed around:

- REST endpoints (`/users`, `/posts`)
- CRUD operations (GET, POST, PUT, DELETE)
- Axios HTTP client (not GraphQL client)

**Workaround:**

```typescript
// Manual GraphQL via custom route
const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: {
    customGraphQL: {
      method: "POST",
      url: "/graphql",
      // You manually handle GraphQL query in body
    },
  },
});
```

**User Pain Points:**

- Modern apps use GraphQL extensively
- No Apollo Client integration
- No automatic query generation
- No GraphQL subscriptions
- Must fall back to REST or use separate library

**Recommendation:** Add to roadmap or clearly state "REST-only" in docs.

---

### 3. **WebSocket Implementation is Minimal** 🟡

**Limitation:** WebSocket feature is exported but **not fully implemented**.

**Impact:**

```typescript
// ✅ Exported but functionality is LIMITED
import { useWebSocket } from "minder-data-provider/websocket";

// File exists: src/websocket/index.ts
// But actual WebSocketClient.ts doesn't exist!
// Only has type definitions, no real implementation
```

**Evidence:**

- `src/websocket/index.ts` exists (exports types)
- `src/websocket/WebSocketClient.ts` **DOES NOT EXIST**
- README claims WebSocket support
- Actual implementation: **MISSING**

**Why:** Feature was planned but not completed in v2.0.3.

**User Pain Points:**

- Documentation says WebSocket works
- Users try to use it → runtime errors
- No real-time updates possible
- Chat apps, live dashboards won't work

**Recommendation:**

1. Mark as `🔬 Experimental` in README
2. Add warning in TypeScript: `@experimental - Not fully implemented`
3. Complete implementation in v2.1

---

### 4. **File Upload Implementation is Minimal** 🟡

**Limitation:** Upload feature exported but **not fully implemented**.

**Impact:**

```typescript
// ✅ Exported but functionality is LIMITED
import { useMediaUpload } from "minder-data-provider/upload";

// File exists: src/upload/index.ts
// But MediaUploadManager.ts doesn't exist!
// Only has type definitions, no real implementation
```

**Evidence:**

- `src/upload/index.ts` exists (exports types)
- `src/upload/MediaUploadManager.ts` **DOES NOT EXIST**
- README claims upload support
- Actual implementation: **MISSING**

**Why:** Feature was planned but not completed in v2.0.3.

**User Pain Points:**

- Documentation says upload works
- Users try to upload files → runtime errors
- Image optimization promised but not available
- Progress tracking not working

**Recommendation:**

1. Mark as `🔬 Experimental` in README
2. Complete implementation in v2.1
3. Add example with working file upload

---

### 5. **Next.js Dynamic Import Requirement** 🔴

**Limitation:** Next.js users **MUST** include `dynamic` import or code breaks.

**Impact:**

```typescript
// ❌ BREAKS in Next.js
const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: { users: "/users" },
  // Missing dynamic!
});

// ✅ REQUIRED for Next.js
import dynamic from "next/dynamic";

const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  dynamic: dynamic, // ⚠️ MUST include this
  routes: { users: "/users" },
});
```

**Why:** Next.js has server-side rendering and special module loading.

**User Pain Points:**

- Not obvious from code
- Runtime error if forgotten
- Documentation exists but easy to miss
- Error message unclear

**Recommendation:**

1. Auto-detect Next.js environment
2. Throw clear error with solution if missing
3. Make it optional with auto-detection

---

### 6. **No TypeScript Type Generation from API** 🔴

**Limitation:** Types must be manually defined. No auto-generation from OpenAPI/Swagger.

**Impact:**

```typescript
// ❌ NO AUTO-GENERATION
// Cannot generate types from:
// - OpenAPI/Swagger spec
// - API responses
// - Database schema

// ✅ MUST MANUALLY DEFINE
interface User {
  id: number;
  name: string;
  email: string;
}

const { data } = useMinder<User>("users"); // Manual typing
```

**Why:** No built-in code generation tools integrated.

**User Pain Points:**

- Manual type definitions are error-prone
- API changes → manual type updates needed
- No type safety guarantee with API
- Tedious for large APIs

**Recommendation:**

1. Add CLI tool for type generation
2. Integrate with `openapi-typescript`
3. Add to v2.2 roadmap

---

### 7. **Single API Base URL Only** 🟡

**Limitation:** Can only configure ONE base API URL per config.

**Impact:**

```typescript
// ❌ CANNOT DO THIS - Multiple API servers
const config = createMinderConfig({
  apiUrls: {
    auth: "https://auth.example.com",
    data: "https://api.example.com",
    media: "https://cdn.example.com",
  },
});

// ✅ ONLY ONE BASE URL ALLOWED
const config = createMinderConfig({
  apiUrl: "https://api.example.com", // All requests go here
  routes: { users: "/users" },
});
```

**Why:** Architecture assumes single API gateway.

**Workaround:**

```typescript
// Use full URLs in routes
const config = createMinderConfig({
  apiUrl: "https://api.example.com",
  routes: {
    users: "/users", // Goes to api.example.com
    media: {
      url: "https://cdn.example.com/upload", // Full URL override
      method: "POST",
    },
  },
});
```

**User Pain Points:**

- Microservices architectures need multiple APIs
- Auth servers often separate from data APIs
- Media/CDN on different domains
- Workaround is not intuitive

**Recommendation:**

1. Add `apiUrls` config option
2. Allow per-route base URL override
3. Document workaround clearly

---

### 8. **No Offline Queue Persistence** 🟡

**Limitation:** Offline queue exists but **NOT persisted** across page refreshes.

**Impact:**

```typescript
// Scenario:
// 1. User offline, creates post
// 2. Post queued in memory
// 3. User refreshes page
// 4. Queue is LOST ❌

// ✅ Works within same session
const { operations } = useMinder("posts", { offline: true });
await operations.create({ title: "Test" }); // Queued in memory

// ❌ Loses data on refresh
window.location.reload(); // Queue cleared!
```

**Why:** Offline queue stored in memory, not persisted to storage.

**User Pain Points:**

- Mobile apps: page refresh = data loss
- PWAs need persistent queue
- Unreliable for critical data

**Recommendation:**

1. Add queue persistence to localStorage/AsyncStorage
2. Add in v2.1
3. Make it opt-in for performance

---

### 9. **Bundle Size for Simple Apps** 🟡

**Limitation:** Even "minimal" config is ~48KB (may be too large for tiny apps).

**Impact:**

```typescript
// Minimal setup is 47.82 KB
import { useMinder } from "minder-data-provider";

// For comparison:
// - Pure Axios: 15 KB
// - Native fetch: 0 KB
// - SWR: 5 KB
// - React Query alone: 12 KB
```

**Why:** Includes:

- Redux Toolkit (~20 KB)
- React Query (~12 KB)
- Axios (~15 KB)
- Core logic

**User Pain Points:**

- Landing pages need tiny bundles
- Simple forms don't need full stack
- Performance budgets exceeded

**Workaround:**

```typescript
// Use lightweight alternatives for tiny apps
import axios from "axios"; // 15 KB
// OR
import useSWR from "swr"; // 5 KB
```

**Recommendation:**

1. Create "micro" version (CRUD only, no Redux)
2. Target <20 KB
3. Advanced features opt-in only

---

### 10. **No Built-in Pagination Helper** 🟡

**Limitation:** Pagination must be manually implemented.

**Impact:**

```typescript
// ❌ NO BUILT-IN PAGINATION
const { data } = useMinder("users"); // Gets ALL users

// ✅ MUST MANUALLY HANDLE
const [page, setPage] = useState(1);
const { data } = useMinder(`users?page=${page}&limit=10`);

// No helpers for:
// - hasNextPage
// - fetchNextPage
// - isFetchingNextPage
// - prefetch next page
```

**Why:** Core focuses on CRUD, pagination is custom logic.

**User Pain Points:**

- Large datasets cause performance issues
- No cursor-based pagination
- No infinite scroll helper
- Manual state management needed

**Recommendation:**

1. Add `usePaginatedMinder` hook
2. Support cursor & offset pagination
3. Add infinite scroll example

---

### 11. **No Request Cancellation API** 🟢

**Limitation:** Cannot manually cancel in-flight requests.

**Impact:**

```typescript
// ❌ NO CANCELLATION API
const { data, operations, cancel } = useMinder("users");
// ^ cancel doesn't exist

// Use case: User types search, changes mind
// Old request still running, wastes bandwidth
```

**Why:** React Query handles this automatically with `queryClient.cancelQueries()`.

**Workaround:**

```typescript
import { useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
queryClient.cancelQueries(["users"]); // Manual cancellation
```

**User Pain Points:**

- Fast typers trigger many requests
- Mobile data waste
- Race conditions possible

**Recommendation:**

1. Expose `cancel()` method in hook
2. Auto-cancel on component unmount
3. Add debounce helper

---

### 12. **No Built-in Validation** 🟡

**Limitation:** No data validation before API calls.

**Impact:**

```typescript
// ❌ NO VALIDATION
const { operations } = useMinder("users");

await operations.create({
  email: "not-an-email", // Invalid email
  age: -5, // Invalid age
  // API call happens anyway!
});

// ✅ MUST VALIDATE MANUALLY
if (!isValidEmail(data.email)) {
  throw new Error("Invalid email");
}
await operations.create(data);
```

**Why:** Validation is app-specific, not generic.

**User Pain Points:**

- Waste API calls with invalid data
- No Zod/Yup integration
- Error handling after the fact

**Recommendation:**

1. Add optional `validate` callback
2. Integrate with Zod/Yup
3. Example in docs

---

### 13. **Limited Error Retry Configuration** 🟢

**Limitation:** Retry logic is fixed (3 attempts, exponential backoff).

**Impact:**

```typescript
// ❌ CANNOT CONFIGURE
const config = createMinderConfig({
  performance: {
    retries: 3, // Fixed at 3
    // Cannot customize:
    // - Which status codes to retry (currently only 5xx)
    // - Retry delay
    // - Exponential vs linear backoff
  },
});

// Want: Retry 408, 429, 503 only
// Want: Custom backoff strategy
```

**Why:** Simplified API, reasonable defaults.

**User Pain Points:**

- Some APIs use different status codes
- Some need more/fewer retries
- Custom backoff strategies not possible

**Recommendation:**

1. Add advanced retry config
2. Allow custom retry logic callback

---

### 14. **No Multi-Tenancy Support** 🟢

**Limitation:** No built-in multi-tenant support (different APIs per tenant).

**Impact:**

```typescript
// ❌ CANNOT DO
// Tenant A → https://tenant-a.api.com
// Tenant B → https://tenant-b.api.com

const config = createMinderConfig({
  apiUrl: "???", // Which tenant?
});
```

**Workaround:**

```typescript
// Create config dynamically
const createTenantConfig = (tenantId: string) => {
  return createMinderConfig({
    apiUrl: `https://${tenantId}.api.com`,
    routes: { users: '/users' }
  });
};

// Change provider config when tenant changes
<MinderDataProvider config={tenantConfig}>
```

**User Pain Points:**

- SaaS apps need multi-tenancy
- Provider must re-mount
- Cache not shared across tenants

**Recommendation:**

1. Add tenant context
2. Dynamic API URL resolution
3. Tenant-isolated cache

---

### 15. **CORS is Client-Side Only** 🟢

**Limitation:** CORS helper only adds headers. Real CORS must be configured on server.

**Impact:**

```typescript
// ❌ MISCONCEPTION
const config = createMinderConfig({
  cors: { enabled: true }, // This does NOT solve CORS!
});

// What it actually does:
// ✅ Adds 'Origin' header
// ✅ Sets withCredentials
// ✅ Provides helpful error messages

// What it CANNOT do:
// ❌ Cannot bypass CORS policy
// ❌ Cannot configure server CORS
// ❌ Cannot fix CORS errors
```

**Why:** CORS is a browser security feature enforced by servers.

**User Pain Points:**

- Users think enabling CORS fixes issues
- Confusion about client vs server config
- Error messages mention CORS but it's server issue

**Recommendation:**

1. Rename to `corsHelper` not `cors`
2. Add clear docs: "CORS must be configured on your API server"
3. Better error messages

---

### 16. **No Server-Side Request Batching** 🟢

**Limitation:** Multiple requests to same route → multiple API calls.

**Impact:**

```typescript
// Three components request same data
const UserProfile = () => {
  const { data } = useMinder("users"); // Request 1
};
const UserList = () => {
  const { data } = useMinder("users"); // Deduped ✅
};
const UserStats = () => {
  const { data } = useMinder("users"); // Deduped ✅
};

// ✅ Deduplication works (only 1 request)

// ❌ But different params → separate requests
const A = () => useMinder("users?role=admin"); // Request 1
const B = () => useMinder("users?role=user"); // Request 2
// Could batch into: GET /users?role[]=admin&role[]=user
```

**Why:** Request deduplication exists, but not batching.

**User Pain Points:**

- Dashboard with many widgets → many requests
- Could batch into fewer requests
- Network waterfall

**Recommendation:**

1. Add request batching API
2. Support DataLoader pattern
3. Opt-in feature for v2.2

---

## 🟡 Moderate Limitations

### 17. **React Query Devtools Always Included** 🟡

**Limitation:** React Query DevTools included in production build.

**Impact:**

```bash
# DevTools add ~10KB to production bundle
# Users pay for debugging tools in production
```

**Why:** Imported in core without tree-shaking.

**Recommendation:**

1. Only import DevTools in development
2. Use dynamic import

---

### 18. **No React Native AsyncStorage Auto-Detection** 🟡

**Limitation:** React Native users must manually install AsyncStorage.

**Impact:**

```typescript
// ❌ Doesn't work out of box
import { useMinder } from 'minder-data-provider/native';

// ✅ Must install separately
npm install @react-native-async-storage/async-storage
```

**Recommendation:**

1. Make AsyncStorage optional peer dependency
2. Auto-detect and warn if missing

---

### 19. **No Built-in Optimistic Update Conflict Resolution** 🟡

**Limitation:** If optimistic update fails, simple rollback only.

**Impact:**

```typescript
// Optimistic update fails
operations.update(1, { name: "New" }); // Optimistically updates UI
// API fails
// ✅ Rolls back to old value
// ❌ No merge strategy for partial success
```

**Recommendation:**

1. Add conflict resolution strategies
2. Allow custom rollback logic

---

## 🟢 Minor Limitations (Advanced Users)

### 20. **No Custom HTTP Client** 🟢

**Limitation:** Locked into Axios, cannot use Fetch or custom client.

**Recommendation:** Add HTTP client adapter pattern.

---

### 21. **No Request/Response Transformers** 🟢

**Limitation:** Cannot globally transform all requests/responses.

**Recommendation:** Add middleware system.

---

### 22. **No Built-in Analytics Integration** 🟢

**Limitation:** No hooks for analytics (track API calls, errors, performance).

**Recommendation:** Add analytics plugin system.

---

## 📋 Summary of Limitations by Category

| Category          | Critical (🔴)                                       | Moderate (🟡)                       | Minor (🟢)                    |
| ----------------- | --------------------------------------------------- | ----------------------------------- | ----------------------------- |
| **Platform**      | React-only                                          | React Native setup                  | -                             |
| **Features**      | No GraphQL, WebSocket incomplete, Upload incomplete | No pagination helper, No validation | No analytics, No transformers |
| **Configuration** | Next.js requires dynamic, Single API URL            | Bundle size                         | Custom HTTP client            |
| **Performance**   | -                                                   | DevTools in production              | No request batching           |
| **Offline**       | -                                                   | Queue not persisted                 | -                             |
| **Types**         | No type generation                                  | -                                   | -                             |
| **CORS**          | -                                                   | Client-side only                    | -                             |

---

## 🎯 Recommendations for Documentation

### README Updates Needed:

1. **Clearly State:**

   - ✅ React-only (no Vue/Angular)
   - ⚠️ REST APIs only (no GraphQL yet)
   - 🔬 WebSocket & Upload are experimental
   - 📦 Minimum bundle size is ~48 KB

2. **Feature Status Table:**

```markdown
| Feature         | Status           | Notes            |
| --------------- | ---------------- | ---------------- |
| CRUD Operations | ✅ Stable        | Production ready |
| Authentication  | ✅ Stable        | Production ready |
| Caching         | ✅ Stable        | Production ready |
| WebSocket       | 🔬 Experimental  | Coming in v2.1   |
| File Upload     | 🔬 Experimental  | Coming in v2.1   |
| GraphQL         | ❌ Not Supported | REST only        |
```

3. **Known Limitations Section:**
   - Add LIMITATIONS.md
   - Link from README
   - Be transparent about constraints

---

## 🚀 Roadmap Suggestions

### v2.1 (High Priority):

- ✅ Complete WebSocket implementation
- ✅ Complete Upload implementation
- ✅ Add pagination helpers
- ✅ Persist offline queue

### v2.2 (Medium Priority):

- ✅ Add validation integration (Zod/Yup)
- ✅ Type generation from OpenAPI
- ✅ Request batching
- ✅ Multi-tenancy support

### v3.0 (Future):

- ✅ GraphQL support
- ✅ Non-React frameworks (Vue adapter?)
- ✅ Micro version (<20 KB)

---

**End of Analysis** ✅
