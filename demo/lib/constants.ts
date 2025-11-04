export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';

export const ROUTES = {
  HOME: '/',
  CRUD: '/crud',
  AUTH: '/auth',
  CACHE: '/cache',
  WEBSOCKET: '/websocket',
  UPLOAD: '/upload',
  OFFLINE: '/offline',
  PERFORMANCE: '/performance',
  SECURITY: '/security',
  SSR: '/ssr',
  PLATFORM: '/platform',
  EXAMPLES: '/examples',
  DOCS: '/docs',
} as const;

export const FEATURES = [
  { id: 'crud', name: 'CRUD Operations', route: ROUTES.CRUD },
  { id: 'auth', name: 'Authentication', route: ROUTES.AUTH },
  { id: 'cache', name: 'Smart Caching', route: ROUTES.CACHE },
  { id: 'websocket', name: 'Real-time WebSocket', route: ROUTES.WEBSOCKET },
  { id: 'upload', name: 'File Upload', route: ROUTES.UPLOAD },
  { id: 'offline', name: 'Offline Support', route: ROUTES.OFFLINE },
  { id: 'performance', name: 'Performance', route: ROUTES.PERFORMANCE },
  { id: 'security', name: 'Security', route: ROUTES.SECURITY },
  { id: 'ssr', name: 'SSR/CSR/SSG', route: ROUTES.SSR },
  { id: 'platform', name: 'Platform Detection', route: ROUTES.PLATFORM },
] as const;

export const CACHE_KEYS = {
  POSTS: 'posts',
  POST: 'post',
  USERS: 'users',
  USER: 'user',
  PRODUCTS: 'products',
  PRODUCT: 'product',
  ORDERS: 'orders',
  ORDER: 'order',
  NOTIFICATIONS: 'notifications',
  CHAT_ROOMS: 'chat_rooms',
  CHAT_MESSAGES: 'chat_messages',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;
