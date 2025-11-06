# Shared Configuration and Types

This directory contains shared code used across all examples to maintain consistency and avoid duplication.

## 📁 Structure

```
shared/
├── config/
│   └── api.ts          # Centralized API endpoints
└── types/
    └── index.ts        # Shared TypeScript types
```

## 🎯 Purpose

### Why Shared Code?

1. **Single Source of Truth**

   - One place to update API URLs
   - Consistent types across examples
   - Easy to maintain

2. **Avoid Duplication**

   - Don't repeat type definitions
   - Reuse endpoint configurations
   - DRY principle

3. **Type Safety**
   - TypeScript types are consistent
   - Auto-completion everywhere
   - Catch errors at compile time

## 📚 Usage

### API Configuration

```typescript
// Import in any example
import {
  getJsonPlaceholderUrl,
  JSONPLACEHOLDER_ENDPOINTS,
} from "../shared/config/api";

// Use endpoints
const url = getJsonPlaceholderUrl(JSONPLACEHOLDER_ENDPOINTS.POSTS);
// Result: 'https://jsonplaceholder.typicode.com/posts'

const userUrl = getJsonPlaceholderUrl(JSONPLACEHOLDER_ENDPOINTS.USER_BY_ID(1));
// Result: 'https://jsonplaceholder.typicode.com/users/1'
```

### Shared Types

```typescript
// Import types
import { User, Post, Product } from "../shared/types";

// Use in components
interface Props {
  user: User;
  posts: Post[];
  products: Product[];
}
```

## 🔧 Available APIs

### JSONPlaceholder

Free fake API for testing:

- Posts
- Users
- Comments
- Todos

### FakeStore API

E-commerce testing:

- Products
- Categories
- Carts
- Auth

## 🎨 Benefits

- ✅ Centralized configuration
- ✅ Type-safe endpoints
- ✅ Easy to update URLs
- ✅ Consistent across examples
- ✅ No code duplication
- ✅ Auto-completion support
