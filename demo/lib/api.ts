import { API_BASE_URL } from './constants';
import type { 
  User, 
  Post, 
  Product, 
  Order, 
  Notification, 
  ChatRoom, 
  ChatMessage, 
  PaginatedResponse,
  AuthResponse 
} from '@/types/api';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    
    // Load token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: 'Request failed',
          message: response.statusText,
        }));
        throw new Error(error.error || error.message || 'Request failed');
      }

      return response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    return this.request<T>(`${endpoint}${queryString}`, {
      method: 'GET',
    });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/api/auth/login', { email, password }),
  
  register: (data: {
    username: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }) => apiClient.post<{ user: User; message: string }>('/api/auth/register', data),
  
  logout: () => apiClient.post<{ message: string }>('/api/auth/logout'),
  
  refreshToken: (refreshToken: string) =>
    apiClient.post<{ token: string; expiresIn: number }>('/api/auth/refresh', { refreshToken }),
  
  verifyToken: () => apiClient.get<{ valid: boolean; user: User }>('/api/auth/verify'),
};

// Users API
export const usersApi = {
  getAll: (params?: { page?: number; limit?: number; search?: string; role?: string }) =>
    apiClient.get<PaginatedResponse<User>>('/api/users', params),
  
  getById: (id: number) => apiClient.get<User>(`/api/users/${id}`),
  
  create: (data: any) => apiClient.post<User>('/api/users', data),
  
  update: (id: number, data: any) => apiClient.put<User>(`/api/users/${id}`, data),
  
  delete: (id: number) => apiClient.delete<{ message: string }>(`/api/users/${id}`),
};

// Posts API
export const postsApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    user_id?: number;
    published?: boolean;
  }) => apiClient.get<PaginatedResponse<Post>>('/api/posts', params),
  
  getById: (id: number) => apiClient.get<Post>(`/api/posts/${id}`),
  
  create: (data: {
    title: string;
    content: string;
    excerpt?: string;
    featured_image?: string;
    published?: boolean;
  }) => apiClient.post<Post>('/api/posts', data),
  
  update: (id: number, data: any) => apiClient.put<Post>(`/api/posts/${id}`, data),
  
  delete: (id: number) => apiClient.delete<{ message: string }>(`/api/posts/${id}`),
  
  like: (id: number) => apiClient.post<{ liked: boolean; message: string }>(`/api/posts/${id}/like`),
  
  getComments: (postId: number, params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<any>>(`/api/posts/${postId}/comments`, params),
  
  addComment: (postId: number, content: string, parent_comment_id?: number) =>
    apiClient.post<any>(`/api/posts/${postId}/comments`, { content, parent_comment_id }),
};

// Products API
export const productsApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    min_price?: number;
    max_price?: number;
  }) => apiClient.get<PaginatedResponse<Product>>('/api/products', params),
  
  getById: (id: number) => apiClient.get<Product>(`/api/products/${id}`),
  
  create: (data: any) => apiClient.post<Product>('/api/products', data),
  
  update: (id: number, data: any) => apiClient.put<Product>(`/api/products/${id}`, data),
  
  delete: (id: number) => apiClient.delete<{ message: string }>(`/api/products/${id}`),
};

// Orders API
export const ordersApi = {
  getAll: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<Order>>('/api/orders', params),
  
  getById: (id: number) => apiClient.get<Order>(`/api/orders/${id}`),
  
  create: (data: {
    items: Array<{ product_id: number; quantity: number }>;
    shipping_address?: string;
    billing_address?: string;
  }) => apiClient.post<Order>('/api/orders', data),
};

// Notifications API
export const notificationsApi = {
  getAll: (params?: { page?: number; limit?: number; is_read?: boolean }) =>
    apiClient.get<PaginatedResponse<Notification>>('/api/notifications', params),
  
  markAsRead: (id: number) => apiClient.put<Notification>(`/api/notifications/${id}/read`),
  
  markAllAsRead: () => apiClient.put<{ message: string }>('/api/notifications/read-all'),
};

// Chat API
export const chatApi = {
  getRooms: () => apiClient.get<{ data: ChatRoom[] }>('/api/chat/rooms'),
  
  getMessages: (roomId: number, params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResponse<ChatMessage>>(`/api/chat/rooms/${roomId}/messages`, params),
  
  sendMessage: (roomId: number, content: string, message_type = 'text') =>
    apiClient.post<ChatMessage>(`/api/chat/rooms/${roomId}/messages`, { content, message_type }),
};

export default apiClient;
