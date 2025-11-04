export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  bio?: string;
  role: 'user' | 'admin' | 'moderator';
  created_at: string;
  updated_at?: string;
}

export interface Post {
  id: number;
  user_id: number;
  title: string;
  content: string;
  excerpt?: string;
  featured_image?: string;
  published: boolean;
  view_count: number;
  created_at: string;
  updated_at?: string;
  // Joined data
  username?: string;
  avatar_url?: string;
  like_count?: number;
  comment_count?: number;
}

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  parent_comment_id?: number;
  content: string;
  created_at: string;
  // Joined data
  username?: string;
  avatar_url?: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  category?: string;
  image_url?: string;
  stock_quantity: number;
  created_at: string;
  updated_at?: string;
}

export interface Order {
  id: number;
  user_id: number;
  total_amount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  shipping_address?: string;
  billing_address?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  price: number;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface ChatRoom {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
  member_count?: number;
  message_count?: number;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  user_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file';
  created_at: string;
  // Joined data
  username?: string;
  avatar_url?: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages?: number;
  };
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}
