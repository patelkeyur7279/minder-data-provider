/**
 * TypeScript Types for Next.js Blog
 * 
 * Why separate types file?
 * - Reusable across pages and API routes
 * - Type safety everywhere
 * - Easy to maintain
 */

export interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  username: string;
}

export interface Comment {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
}

export interface CreatePostInput {
  title: string;
  body: string;
  userId: number;
}

export interface UpdatePostInput {
  title?: string;
  body?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}
