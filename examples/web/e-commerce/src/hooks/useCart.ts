import { useState, useEffect, useCallback } from 'react';
import type { Product, CartItem, Cart } from '../types';

const CART_STORAGE_KEY = 'minder-cart';

/**
 * Shopping cart hook with localStorage persistence
 * Demonstrates state management with minder
 */
export function useCart() {
  const [cart, setCart] = useState<Cart>(() => {
    // Load cart from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return { items: [], total: 0 };
        }
      }
    }
    return { items: [], total: 0 };
  });

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    }
  }, [cart]);

  /**
   * Calculate cart total
   */
  const calculateTotal = useCallback((items: CartItem[]): number => {
    return Number(
      items.reduce((sum, item) => sum + item.product.price * item.quantity, 0).toFixed(2)
    );
  }, []);

  /**
   * Add product to cart
   */
  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    setCart(prevCart => {
      const existingIndex = prevCart.items.findIndex(
        item => item.product.id === product.id
      );

      let newItems: CartItem[];
      
      if (existingIndex >= 0) {
        // Update quantity if product already in cart
        newItems = [...prevCart.items];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + quantity,
        };
      } else {
        // Add new product
        newItems = [...prevCart.items, { product, quantity }];
      }

      return {
        items: newItems,
        total: calculateTotal(newItems),
      };
    });
  }, [calculateTotal]);

  /**
   * Remove product from cart
   */
  const removeFromCart = useCallback((productId: number) => {
    setCart(prevCart => {
      const newItems = prevCart.items.filter(
        item => item.product.id !== productId
      );
      
      return {
        items: newItems,
        total: calculateTotal(newItems),
      };
    });
  }, [calculateTotal]);

  /**
   * Update product quantity
   */
  const updateQuantity = useCallback((productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart(prevCart => {
      const newItems = prevCart.items.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      );

      return {
        items: newItems,
        total: calculateTotal(newItems),
      };
    });
  }, [calculateTotal, removeFromCart]);

  /**
   * Clear entire cart
   */
  const clearCart = useCallback(() => {
    setCart({ items: [], total: 0 });
  }, []);

  /**
   * Get item count
   */
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  /**
   * Check if product is in cart
   */
  const isInCart = useCallback((productId: number): boolean => {
    return cart.items.some(item => item.product.id === productId);
  }, [cart.items]);

  /**
   * Get product quantity in cart
   */
  const getQuantity = useCallback((productId: number): number => {
    const item = cart.items.find(item => item.product.id === productId);
    return item?.quantity || 0;
  }, [cart.items]);

  return {
    cart,
    itemCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    isInCart,
    getQuantity,
  };
}
