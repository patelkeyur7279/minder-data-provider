/**
 * User type - matches JSONPlaceholder API
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
 * Post type
 */
export interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

/**
 * Create user input - required fields only
 */
export interface CreateUserInput {
  name: string;
  username: string;
  email: string;
}

/**
 * Update user input - all fields optional
 */
export interface UpdateUserInput {
  name?: string;
  username?: string;
  email?: string;
  phone?: string;
  website?: string;
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
  };
}
