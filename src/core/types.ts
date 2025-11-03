import { BaseModel } from '../models/BaseModel.js';

// Core configuration types
export interface MinderConfig {
  apiBaseUrl: string;
  routes: Record<string, ApiRoute>;
  auth?: AuthConfig;
  cache?: CacheConfig;
  cors?: CorsConfig;
  websocket?: WebSocketConfig;
  redux?: ReduxConfig;
  performance?: PerformanceConfig;
  environments?: Record<string, EnvironmentOverride>;
  defaultEnvironment?: string;
  autoDetectEnvironment?: boolean;
  onError?: (error: ApiError) => void;
}

export interface EnvironmentOverride {
  apiBaseUrl?: string;
  cors?: CorsConfig;
  auth?: Partial<AuthConfig>;
  cache?: Partial<CacheConfig>;
  debug?: boolean;
}

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  model?: typeof BaseModel;
  headers?: Record<string, string>;
  optimistic?: boolean;
  cache?: boolean;
  timeout?: number;
}

export interface AuthConfig {
  tokenKey: string;
  storage: 'localStorage' | 'sessionStorage' | 'memory' | 'cookie';
  refreshUrl?: string;
  onAuthError?: () => void;
}

export interface CacheConfig {
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
}

export interface CorsConfig {
  enabled?: boolean;
  proxy?: string;
  credentials?: boolean;
  origin?: string | string[];
  methods?: string[];
  headers?: string[];
}

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  reconnect?: boolean;
  heartbeat?: number;
}

export interface ReduxConfig {
  devTools?: boolean;
  middleware?: any[];
  preloadedState?: any;
}

export interface PerformanceConfig {
  deduplication?: boolean;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

// State management types
export interface UIState {
  loading: Record<string, boolean>;
  errors: Record<string, ApiError | null>;
  modals: Record<string, boolean>;
  notifications: Notification[];
}

export interface ServerState {
  data: Record<string, any>;
  cache: Record<string, CacheEntry>;
  queries: Record<string, QueryState>;
}

export interface UserState {
  profile: any;
  preferences: Record<string, any>;
  permissions: string[];
  session: SessionData;
}

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

export interface QueryState {
  data: any;
  isLoading: boolean;
  error: ApiError | null;
  lastFetched: number;
}

export interface SessionData {
  token: string | null;
  refreshToken: string | null;
  expiresAt: number;
  user: any;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
}

// Hook return types
export interface CrudOperations<T = any> {
  data: T;
  loading: {
    fetch: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  errors: {
    current: ApiError | null;
    hasError: boolean;
    message: string;
  };
  operations: {
    fetch: () => Promise<T>;
    create: (item: Partial<T>) => Promise<T>;
    update: (id: string | number, item: Partial<T>) => Promise<T>;
    delete: (id: string | number) => Promise<void>;
    refresh: () => void;
    clear: () => void;
  };
}

export interface MediaUploadResult {
  url: string;
  filename: string;
  size: number;
  type: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}