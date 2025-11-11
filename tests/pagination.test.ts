/**
 * Tests for usePaginatedMinder hook
 * Issue #10: Add pagination helper with hasNextPage, fetchNextPage support
 */

import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePaginatedMinder } from '../src/hooks/usePaginatedMinder';
import React from 'react';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('usePaginatedMinder', () => {
  describe('Hook Interface', () => {
    it('should accept offset pagination config', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 20,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
      expect(result.current.data).toEqual([]);
      expect(result.current.pages).toEqual([]);
      expect(result.current.loading).toBe(false);
    });

    it('should accept cursor pagination config', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'cursor',
            pageSize: 20,
            getCursor: (item: any) => item.id,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
      expect(result.current.data).toEqual([]);
    });

    it('should provide all required return values', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toMatchObject({
        data: expect.any(Array),
        pages: expect.any(Array),
        loading: expect.any(Boolean),
        isFetchingNextPage: expect.any(Boolean),
        isFetchingPreviousPage: expect.any(Boolean),
        error: null,
        hasNextPage: expect.any(Boolean),
        hasPreviousPage: expect.any(Boolean),
        fetchNextPage: expect.any(Function),
        fetchPreviousPage: expect.any(Function),
        refetch: expect.any(Function),
        invalidate: expect.any(Function),
        query: expect.any(Object),
      });
    });
  });

  describe('Pagination Config Options', () => {
    it('should accept custom page param name', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
            pageParam: 'pageNumber',
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept custom limit param name', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
            limitParam: 'perPage',
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept custom cursor param name', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'cursor',
            pageSize: 10,
            cursorParam: 'nextToken',
            getCursor: (item: any) => item.token,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept custom getCursor function', () => {
      const getCursorMock = jest.fn((item: any) => item.customId);

      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'cursor',
            pageSize: 10,
            getCursor: getCursorMock,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept custom getNextPageParam function', () => {
      const getNextPageParam = jest.fn(() => undefined);

      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
            getNextPageParam,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept initial page number', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
            initialPage: 5,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Hook Options', () => {
    it('should respect autoFetch false', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('should respect enabled false', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          enabled: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.loading).toBe(false);
    });

    it('should accept additional params', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          params: { category: 'tech', status: 'published' },
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept cacheTTL option', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          cacheTTL: 60000,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept refetch options', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          refetchOnWindowFocus: true,
          refetchOnReconnect: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Helper Methods', () => {
    it('should provide fetchNextPage method', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(typeof result.current.fetchNextPage).toBe('function');
    });

    it('should provide fetchPreviousPage method', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(typeof result.current.fetchPreviousPage).toBe('function');
    });

    it('should provide refetch method', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(typeof result.current.refetch).toBe('function');
    });

    it('should provide invalidate method', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(typeof result.current.invalidate).toBe('function');
    });
  });

  describe('State Management', () => {
    it('should initialize with empty data', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.data).toEqual([]);
      expect(result.current.pages).toEqual([]);
    });

    it('should not be loading when autoFetch is false', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.loading).toBe(false);
      expect(result.current.isFetchingNextPage).toBe(false);
      expect(result.current.isFetchingPreviousPage).toBe(false);
    });

    it('should initialize hasNextPage as false', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.hasNextPage).toBe(false);
    });

    it('should initialize hasPreviousPage as false', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.hasPreviousPage).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.error).toBe(null);
    });
  });

  describe('TypeScript Integration', () => {
    it('should work with typed data', () => {
      interface Post {
        id: number;
        title: string;
        content: string;
      }

      const { result } = renderHook(
        () => usePaginatedMinder<Post>('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 20,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.data).toEqual([]);
      expect(result.current).toBeDefined();
    });

    it('should work with custom getCursor type', () => {
      interface Post {
        id: number;
        title: string;
        nextCursor?: string;
      }

      const { result } = renderHook(
        () => usePaginatedMinder<Post>('posts', {
          autoFetch: false,
          pagination: {
            type: 'cursor',
            pageSize: 20,
            getCursor: (item) => item.nextCursor,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Configuration Examples', () => {
    it('example 1: basic offset pagination', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'offset',
            pageSize: 20,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
      expect(result.current.fetchNextPage).toBeDefined();
      expect(result.current.hasNextPage).toBe(false);
    });

    it('example 2: cursor pagination with custom cursor', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          pagination: {
            type: 'cursor',
            pageSize: 20,
            getCursor: (item: any) => item.id,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });

    it('example 3: pagination with filters', () => {
      const { result } = renderHook(
        () => usePaginatedMinder('posts', {
          autoFetch: false,
          params: { category: 'tech', status: 'published' },
          pagination: {
            type: 'offset',
            pageSize: 10,
          },
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current).toBeDefined();
    });
  });
});
