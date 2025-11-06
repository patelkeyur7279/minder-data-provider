import { configureMinder } from 'minder-data-provider';

// API Configuration
export const API_BASE_URL = 'https://fakestoreapi.com';

// Configure minder globally
configureMinder({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// API Endpoints
export const API_ENDPOINTS = {
  PRODUCTS: '/products',
  PRODUCT_BY_ID: (id: number) => `/products/${id}`,
  CATEGORIES: '/products/categories',
  PRODUCTS_BY_CATEGORY: (category: string) => `/products/category/${category}`,
  ORDERS: '/orders',
} as const;
