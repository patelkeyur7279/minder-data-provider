import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCart } from '../src/hooks/useCart';
import type { Product } from '../src/types';

/**
 * Tests for useCart Hook
 * 
 * Why test this?
 * - Critical business logic (cart management)
 * - localStorage persistence needs validation
 * - Edge cases (quantity 0, duplicates, etc.)
 */

describe('useCart', () => {
  // Clear localStorage before each test
  beforeEach(() => {
    localStorage.clear();
  });

  const mockProduct: Product = {
    id: 1,
    title: 'Test Product',
    description: 'Test description',
    price: 99.99,
    image: 'test.jpg',
    category: 'electronics',
    rating: { rate: 4.5, count: 100 },
  };

  it('should initialize with empty cart', () => {
    const { result } = renderHook(() => useCart());
    
    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.cart.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it('should add product to cart', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct, 2);
    });

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0].quantity).toBe(2);
    expect(result.current.cart.total).toBe(199.98);
    expect(result.current.itemCount).toBe(2);
  });

  it('should update quantity if product already in cart', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct, 1);
      result.current.addToCart(mockProduct, 2);
    });

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0].quantity).toBe(3);
    expect(result.current.cart.total).toBe(299.97);
  });

  it('should remove product from cart', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct);
      result.current.removeFromCart(mockProduct.id);
    });

    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.cart.total).toBe(0);
  });

  it('should update product quantity', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct, 2);
      result.current.updateQuantity(mockProduct.id, 5);
    });

    expect(result.current.cart.items[0].quantity).toBe(5);
    expect(result.current.cart.total).toBe(499.95);
  });

  it('should remove product when quantity updated to 0', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct);
      result.current.updateQuantity(mockProduct.id, 0);
    });

    expect(result.current.cart.items).toHaveLength(0);
  });

  it('should clear entire cart', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct);
      result.current.addToCart({ ...mockProduct, id: 2 });
      result.current.clearCart();
    });

    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.cart.total).toBe(0);
  });

  it('should check if product is in cart', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct);
    });

    expect(result.current.isInCart(mockProduct.id)).toBe(true);
    expect(result.current.isInCart(999)).toBe(false);
  });

  it('should get product quantity', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct, 3);
    });

    expect(result.current.getQuantity(mockProduct.id)).toBe(3);
    expect(result.current.getQuantity(999)).toBe(0);
  });

  it('should persist cart to localStorage', () => {
    const { result } = renderHook(() => useCart());
    
    act(() => {
      result.current.addToCart(mockProduct);
    });

    const saved = localStorage.getItem('minder-cart');
    expect(saved).toBeTruthy();
    
    const parsed = JSON.parse(saved!);
    expect(parsed.items).toHaveLength(1);
  });

  it('should load cart from localStorage on mount', () => {
    // Pre-populate localStorage
    const savedCart = {
      items: [{ product: mockProduct, quantity: 2 }],
      total: 199.98,
    };
    localStorage.setItem('minder-cart', JSON.stringify(savedCart));

    const { result } = renderHook(() => useCart());

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0].quantity).toBe(2);
    expect(result.current.cart.total).toBe(199.98);
  });

  it('should calculate total correctly with multiple products', () => {
    const { result } = renderHook(() => useCart());
    
    const product2: Product = { ...mockProduct, id: 2, price: 49.99 };
    
    act(() => {
      result.current.addToCart(mockProduct, 2); // 199.98
      result.current.addToCart(product2, 3); // 149.97
    });

    expect(result.current.cart.total).toBe(349.95);
  });
});
