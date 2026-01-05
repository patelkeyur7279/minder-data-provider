/**
 * Test Suite for useMinder React Hooks
 * Tests cover: data fetching, mutations, error handling, cache operations, and loading states
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { useMinder } from '../src/hooks/useMinder';
import { minder } from '../src/core/minder';
import { setGlobalMinderConfig } from '../src/core/globalConfig';
import { HttpMethod } from '../src/constants/enums';

// Mock the minder function
jest.mock('../src/core/minder', () => ({
  minder: jest.fn(),
  configureMinder: jest.fn(),
}));

const mockedMinder = minder as jest.MockedFunction<typeof minder>;

// Helper to create wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
};

describe('useMinder Hook', () => {
  beforeAll(() => {
    setGlobalMinderConfig({
      apiBaseUrl: 'http://localhost:3000/api',
      routes: {
        '/users': { url: '/users', method: HttpMethod.GET },
        'posts': { url: '/posts', method: HttpMethod.GET },
      },
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  describe('Data Fetching', () => {
    it('should fetch data automatically on mount', async () => {
      const mockData = [{ id: 1, name: 'User 1' }];
      mockedMinder.mockResolvedValue({
        success: true,
        data: mockData,
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      const { result } = renderHook(() => useMinder('/users'), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.loading).toBe(true);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // The mocked minder returns MinderResult, so data will be the full result
      expect(result.current.data).toEqual({
        success: true,
        data: mockData,
        error: null,
        status: 200,
        metadata: expect.objectContaining({
          method: 'GET',
          url: '/users',
        }),
      });
    });

    it('should not fetch when autoFetch is false', async () => {
      mockedMinder.mockResolvedValue({
        success: true,
        data: [],
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      renderHook(() => useMinder('/users', { autoFetch: false }), {
        wrapper: createWrapper(),
      });

      // Should not call minder automatically
      expect(mockedMinder).not.toHaveBeenCalled();
    });

    it('should not refetch when params object reference changes but values are the same', async () => {
      const mockData = [{ id: 1, name: 'User 1' }];
      mockedMinder.mockResolvedValue({
        success: true,
        data: mockData,
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      // First render with initial params
      const { result, rerender } = renderHook(
        ({ params }) => useMinder('/users', { params }),
        {
          wrapper: createWrapper(),
          initialProps: { params: { search: 'test' } },
        }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have been called once
      expect(mockedMinder).toHaveBeenCalledTimes(1);

      // Clear mock to track new calls
      mockedMinder.mockClear();

      // Rerender with new object but SAME values
      rerender({ params: { search: 'test' } });

      // Wait a bit to ensure no additional calls
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should NOT refetch because params values are the same
      expect(mockedMinder).not.toHaveBeenCalled();
    });

    it('should refetch when params values actually change', async () => {
      const mockData = [{ id: 1, name: 'User 1' }];
      mockedMinder.mockResolvedValue({
        success: true,
        data: mockData,
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      // First render with initial params
      const { result, rerender } = renderHook(
        ({ params }) => useMinder('/users', { params }),
        {
          wrapper: createWrapper(),
          initialProps: { params: { search: 'test' } },
        }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have been called once
      expect(mockedMinder).toHaveBeenCalledTimes(1);

      // Clear mock to track new calls
      mockedMinder.mockClear();

      // Rerender with DIFFERENT values
      rerender({ params: { search: 'changed' } });

      await waitFor(() => {
        expect(mockedMinder).toHaveBeenCalled();
      });

      // Should refetch because params values changed
      expect(mockedMinder).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  describe('Mutations', () => {
    it('should perform mutation when calling mutate', async () => {
      const mockResponse = { id: 1, name: 'Created User' };
      mockedMinder.mockResolvedValue({
        success: true,
        data: mockResponse,
        error: null,
        status: 201,
        metadata: {
          method: 'POST',
          url: '/users',
          duration: 150,
          cached: false,
        },
      });

      const { result } = renderHook(() => useMinder('/users'), {
        wrapper: createWrapper(),
      });

      // Wait for initial state
      await waitFor(() => {
        expect(result.current.mutate).toBeDefined();
      });

      // Perform mutation
      const mutationResult = await result.current.mutate({ name: 'Created User' });

      expect(mutationResult.success).toBe(true);
      // mutationResult is wrapped - data contains the full MinderResult from mocked minder
      expect(mutationResult.data).toEqual({
        success: true,
        data: mockResponse,
        error: null,
        status: 201,
        metadata: expect.objectContaining({
          method: 'POST',
          url: '/users',
        }),
      });
      expect(mockedMinder).toHaveBeenCalledWith(
        '/users',
        { name: 'Created User' },
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle fetch errors', async () => {
      mockedMinder.mockResolvedValue({
        success: false,
        data: null,
        error: {
          message: 'Network error',
          code: 'NETWORK_ERROR',
          status: 0,
          solution: 'Check your connection',
        },
        status: 0,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 50,
          cached: false,
        },
      });

      const { result } = renderHook(() => useMinder('/users'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // The mocked minder returns MinderResult with error, so data contains the full result
      expect(result.current.data).toBeDefined();
      expect(result.current.data).toEqual(expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'NETWORK_ERROR',
          message: 'Network error',
        }),
      }));
    });
  });

  // ============================================================================
  // CACHE OPERATIONS
  // ============================================================================

  describe('Cache Operations', () => {
    it('should invalidate cache', async () => {
      mockedMinder.mockResolvedValue({
        success: true,
        data: [],
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      const { result } = renderHook(() => useMinder('/users'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.invalidate).toBeDefined();
      });

      // Should not throw
      await expect(result.current.invalidate()).resolves.not.toThrow();
    });

    it('should refetch data', async () => {
      mockedMinder.mockResolvedValue({
        success: true,
        data: [{ id: 1 }],
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      const { result } = renderHook(() => useMinder('/users'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.refetch).toBeDefined();
      });

      // Clear previous calls
      mockedMinder.mockClear();

      // Refetch
      await result.current.refetch();

      // Should call minder again
      expect(mockedMinder).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // LOADING STATES
  // ============================================================================

  describe('Loading States', () => {
    it('should track loading state correctly', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockedMinder.mockReturnValue(promise as any);

      const { result } = renderHook(() => useMinder('/users'), {
        wrapper: createWrapper(),
      });

      // Should be loading
      expect(result.current.loading).toBe(true);

      // Resolve the promise
      resolvePromise!({
        success: true,
        data: [],
        error: null,
        status: 200,
        metadata: {
          method: 'GET',
          url: '/users',
          duration: 100,
          cached: false,
        },
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });
});
