/**
 * 🚀 Minder Data Provider - Unified useMinder Hook Examples
 *
 * The SINGLE hook for ALL data operations: fetching, mutations, and CRUD.
 * Context-aware: works with or without MinderDataProvider.
 * Supports parameter replacement for dynamic routes.
 *
 * Key Features:
 * - ✅ Single hook for everything
 * - ✅ Context-aware (ApiClient when available)
 * - ✅ Parameter replacement for :id routes
 * - ✅ CRUD operations included
 * - ✅ Backward compatible
 * - ✅ TypeScript support
 */

import { useMinder } from 'minder-data-provider';
import { useState } from 'react';
import { HttpMethod } from '../src/constants/enums.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Example MinderDataProvider config with dynamic routes
const config = {
  apiUrl: 'https://api.example.com',
  routes: {
    // Collection routes
    posts: { method: HttpMethod.GET, url: '/api/posts' },
    users: { method: HttpMethod.GET, url: '/api/users' },

    // Dynamic routes with parameters
    postById: { method: HttpMethod.GET, url: '/api/posts/:id' },
    userById: { method: HttpMethod.GET, url: '/api/users/:id' },
    likePost: { method: HttpMethod.POST, url: '/api/posts/:id/like' },
    updateUser: { method: HttpMethod.PUT, url: '/api/users/:id' },
  },
};

// ============================================================================
// UNIFIED EXAMPLES - ONE HOOK FOR EVERYTHING
// ============================================================================

interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
}

interface User {
  id: number;
  name: string;
  email: string;
}

// ✅ Example 1: Fetch all posts (collection)
function usePostsManager() {
  const { data: posts, loading, refetch, mutate } = useMinder<Post[]>('posts');

  return { posts, loading, refetch, mutate };
}

// ✅ Example 2: Fetch single post with dynamic ID + CRUD operations
function usePostManager(postId: string) {
  const { data: post, loading, refetch, mutate } = useMinder<Post>('postById', {
    params: { id: postId }  // ✅ Parameter replacement works!
  });

  return { post, loading, refetch, mutate };
}

// ✅ Example 3: Like/unlike operations (custom mutations)
function usePostActions(postId: string) {
  const { mutate: likePost, loading: liking } = useMinder('likePost', {
    params: { id: postId }  // ✅ Parameter replacement for mutations too!
  });

  const { mutate: unlikePost, loading: unliking } = useMinder('unlikePost', {
    params: { id: postId }
  });

  const handleLike = async () => {
    try {
      await likePost();  // POST /api/posts/123/like
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  const handleUnlike = async () => {
    try {
      await unlikePost();  // POST /api/posts/123/unlike
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  return { handleLike, handleUnlike, liking, unliking };
}

// ✅ Example 4: User management with CRUD
function useUserManager(userId: string) {
  const { data: user, loading, refetch, mutate } = useMinder<User>('userById', {
    params: { id: userId },  // ✅ Fetch specific user
  });

  return { user, loading, refetch, mutate };
}

// ✅ Example 5: Manual fetch control
function useLazyPostLoader(postId: string) {
  const { data: post, loading, refetch } = useMinder<Post>('postById', {
    params: { id: postId },
    autoFetch: false,  // Don't fetch automatically
  });

  return { post, loading, refetch };
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

// ✅ Still works: Direct URLs (no parameter replacement needed)
function useDirectURL() {
  const { data } = useMinder<Post>('/api/posts/123');  // Direct URL
  return { post: data };
}

// ✅ Still works: Query parameters (not URL replacement)
function useQueryParams() {
  const { data } = useMinder<Post[]>('/api/posts', {
    params: { userId: 123 }  // Query params: /api/posts?userId=123
  });
  return { posts: data };
}

// ============================================================================
// COMPONENT EXAMPLES (Hook-based only - no JSX)
// ============================================================================

// ✅ Example 6: Complete data management (focus on useMinder API)
function usePostsDataManager() {
  const { data: posts, loading, refetch, mutate } = useMinder('posts');

  const addPost = async (title: string, body: string) => {
    return await mutate({ title, body, userId: 1 });
  };

  return { posts, loading, refetch, addPost };
}

// ✅ Example 8: Complex dynamic API parameters
function useComplexApiParams() {
  // Multiple URL path parameters
  const { data: userPost } = useMinder('userPostById', {
    params: { userId: '123', postId: '456' }  // /api/users/123/posts/456
  });

  // Query parameters for filtering/pagination
  const { data: filteredPosts } = useMinder('posts', {
    params: {
      category: 'tech',
      status: 'published',
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    }  // /api/posts?category=tech&status=published&page=1&limit=20&sortBy=createdAt&sortOrder=desc
  });

  // Dynamic route with complex nested parameters
  const { mutate: updateNested } = useMinder('updateNestedResource', {
    params: {
      parentId: 'parent123',
      childId: 'child456',
      subResource: 'metadata'
    }  // /api/parents/parent123/children/child456/metadata
  });

  // Runtime parameter changes (re-fetches automatically)
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ category: '', status: '' });

  const { data: searchResults, loading: searching } = useMinder('search', {
    params: {
      q: searchTerm,
      ...filters,
      timestamp: Date.now()  // Dynamic timestamp for cache busting
    },
    enabled: searchTerm.length > 2  // Only search when query is meaningful
  });

  return {
    userPost,
    filteredPosts,
    updateNested,
    searchResults,
    searching,
    setSearchTerm,
    setFilters
  };
}

// ============================================================================
// USAGE SUMMARY - ONE HOOK FOR ALL SCENARIOS
// ============================================================================

/**
 * 🎯 Unified useMinder Hook - One API for Everything
 *
 * | Scenario | Code | Result |
 * |----------|------|--------|
 * | All posts | `useMinder('posts')` | `data[] + loading + refetch + mutate` |
 * | Single post | `useMinder('postById', { params: { id } })` | `data + loading + refetch + mutate` |
 * | Custom mutations | `useMinder('likePost', { params: { id } })` | `mutate()` function |
 * | Manual control | `useMinder(route, { autoFetch: false })` | `refetch()` function |
 * | Direct URLs | `useMinder('/api/posts/123')` | Direct API calls |
 *
 * Key Benefits:
 * - ✅ **Single Hook**: useMinder for everything
 * - ✅ **Context-Aware**: ApiClient when available, fallback to core minder
 * - ✅ **Parameter Replacement**: :id routes work automatically
 * - ✅ **CRUD Included**: operations object with create/update/delete/fetch (when in MinderDataProvider)
 * - ✅ **Backward Compatible**: All existing code still works
 * - ✅ **TypeScript Support**: Full type safety
 * - ✅ **Flexible**: Supports collections, single items, and custom mutations
 */

export {
  usePostsManager,
  usePostManager,
  usePostActions,
  useUserManager,
  useLazyPostLoader,
  useDirectURL,
  useQueryParams,
  usePostsDataManager,
  useComplexApiParams,
};