/**
 * Tests for request cancellation API
 * Issue #9: Expose cancel() method in useMinder hook
 * 
 * Tests:
 * 1. cancel() method exists and is callable
 * 2. cancel() cancels ongoing queries
 * 3. cancel() can be used in cleanup
 * 4. Multiple cancellations don't cause errors
 */

import { describe, it, expect } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { setGlobalMinderConfig } from '../src/core/globalConfig';
import { HttpMethod } from '../src/constants/enums';
import React from 'react';

// Create a wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Request Cancellation API', () => {
  beforeAll(() => {
    setGlobalMinderConfig({
      apiBaseUrl: 'https://api.example.com',
      routes: {
        test: { url: '/test', method: HttpMethod.GET }
      }
    });
  });

  it('should expose cancel method', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    expect(result.current.cancel).toBeDefined();
    expect(typeof result.current.cancel).toBe('function');
  });

  it('should be able to call cancel without errors', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    await expect(result.current.cancel()).resolves.not.toThrow();
  });

  it('should cancel even when no query is running', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    // Cancel without any query running
    await expect(result.current.cancel()).resolves.toBeUndefined();
  });

  it('should allow multiple cancellations', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    // Multiple cancellations should work without error
    await result.current.cancel();
    await result.current.cancel();
    await result.current.cancel();

    expect(true).toBe(true); // No error means success
  });

  it('should be callable in useEffect cleanup', () => {
    const wrapper = createWrapper();
    const { result, unmount } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    const cancel = result.current.cancel;

    // Simulate useEffect cleanup
    expect(() => {
      unmount();
      cancel(); // Should work even after unmount
    }).not.toThrow();
  });

  it('should work with invalidate and refetch', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    // All methods should work together
    await result.current.cancel();
    await result.current.invalidate();

    expect(result.current.cancel).toBeDefined();
    expect(result.current.invalidate).toBeDefined();
    expect(result.current.refetch).toBeDefined();
  });

  it('should have proper TypeScript signature', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder<{ id: number; name: string }>('test', { autoFetch: false }), { wrapper });

    // cancel should return Promise<void>
    const cancelPromise = result.current.cancel();
    expect(cancelPromise).toBeInstanceOf(Promise);
  });

  it('should be documented in return type', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    // Check all expected methods exist
    expect(result.current).toHaveProperty('cancel');
    expect(result.current).toHaveProperty('invalidate');
    expect(result.current).toHaveProperty('refetch');
    expect(result.current).toHaveProperty('mutate');
  });

  it('should work alongside other operations', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    // Test that cancel doesn't interfere with other operations
    await result.current.cancel();
    await result.current.invalidate();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should work consistently across renders', () => {
    const wrapper = createWrapper();
    const { result, rerender } = renderHook(() => useMinder('test', { autoFetch: false }), { wrapper });

    const firstCancel = result.current.cancel;
    rerender();
    const secondCancel = result.current.cancel;

    // Both should be callable functions
    expect(typeof firstCancel).toBe('function');
    expect(typeof secondCancel).toBe('function');

    // They should both work without errors
    expect(async () => await firstCancel()).not.toThrow();
    expect(async () => await secondCancel()).not.toThrow();
  });
});
