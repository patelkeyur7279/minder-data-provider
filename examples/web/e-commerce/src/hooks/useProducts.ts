import { useMinder } from 'minder-data-provider';
import { API_ENDPOINTS } from '../utils/api';
import type { Product } from '../types';

/**
 * Custom hook for fetching products
 * Demonstrates best practices with useMinder()
 */
export function useProducts(category?: string) {
  const endpoint = category 
    ? API_ENDPOINTS.PRODUCTS_BY_CATEGORY(category)
    : API_ENDPOINTS.PRODUCTS;

  const { 
    data: products, 
    loading, 
    error,
    refetch 
  } = useMinder<Product[]>(endpoint, {
    // Auto-fetch on mount
    autoFetch: true,
    
    // Refetch on window focus for fresh data
    refetchOnWindowFocus: true,
  });

  return {
    products: products || [],
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for fetching single product
 */
export function useProduct(id: number) {
  const { data: product, loading, error } = useMinder<Product>(
    API_ENDPOINTS.PRODUCT_BY_ID(id),
    {
      autoFetch: !!id, // Only fetch if ID exists
      enabled: !!id,
    }
  );

  return { product, loading, error };
}

/**
 * Hook for fetching categories
 */
export function useCategories() {
  const { data: categories, loading, error } = useMinder<string[]>(
    API_ENDPOINTS.CATEGORIES,
    {
      autoFetch: true,
    }
  );

  return {
    categories: categories || [],
    loading,
    error,
  };
}
