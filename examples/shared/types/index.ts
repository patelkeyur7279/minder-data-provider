/**
 * Shared TypeScript Types
 * 
 * Common types used across all examples.
 * Import these instead of duplicating type definitions.
 */

/**
 * User type (JSONPlaceholder)
 */
export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  address?: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
    geo: {
      lat: string;
      lng: string;
    };
  };
  phone?: string;
  website?: string;
  company?: {
    name: string;
    catchPhrase: string;
    bs: string;
  };
}

/**
 * Post type (JSONPlaceholder)
 */
export interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

/**
 * Comment type (JSONPlaceholder)
 */
export interface Comment {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
}

/**
 * Todo type (JSONPlaceholder)
 */
export interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
}

/**
 * Product type (FakeStore API)
 */
export interface Product {
  id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating: {
    rate: number;
    count: number;
  };
}

/**
 * Cart Item type
 */
export interface CartItem {
  productId: number;
  quantity: number;
}

/**
 * Cart type
 */
export interface Cart {
  id: number;
  userId: number;
  date: string;
  products: CartItem[];
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Error response
 */
export interface ErrorResponse {
  message: string;
  code?: string;
  statusCode?: number;
  stack?: string;
}
