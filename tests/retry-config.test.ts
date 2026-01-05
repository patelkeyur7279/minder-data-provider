/**
 * Tests for Enhanced Retry Configuration
 * Issue #13: Allow custom retry logic, status codes, backoff strategies
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { setGlobalMinderConfig } from '../src/core/globalConfig';
import { HttpMethod } from '../src/constants/enums';
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

describe('Enhanced Retry Configuration', () => {
  beforeAll(() => {
    setGlobalMinderConfig({
      apiBaseUrl: 'http://localhost:3000/api',
      routes: {
        test: { url: '/test', method: HttpMethod.GET },
        posts: { url: '/posts', method: HttpMethod.GET },
        'api/data': { url: '/data', method: HttpMethod.GET },
      },
    });
  });
  describe('RetryConfig Interface', () => {
    it('should accept valid retryConfig options', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 5,
            retryableStatusCodes: [500, 502, 503],
            backoff: 'exponential',
            baseDelay: 1000,
            maxDelay: 30000,
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
      expect(result.current.data).toBeNull();
    });

    it('should accept custom shouldRetry function', () => {
      const wrapper = createWrapper();
      const shouldRetry = jest.fn((error: any, attempt: number) => attempt < 3);

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 5,
            shouldRetry,
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept custom backoff function', () => {
      const wrapper = createWrapper();
      const backoffFn = (attempt: number) => Math.pow(2, attempt) * 1000;

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            backoff: backoffFn,
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept linear backoff strategy', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            backoff: 'linear',
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should accept exponential backoff strategy', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            backoff: 'exponential',
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Default Values', () => {
    it('should work without retryConfig', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', { autoFetch: false }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
      expect(result.current.data).toBeNull();
    });

    it('should work with partial retryConfig', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 5,
            // Other options use defaults
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    it('should provide type-safe configuration', () => {
      const wrapper = createWrapper();

      // This should compile without TypeScript errors
      const config = {
        autoFetch: false,
        retryConfig: {
          maxRetries: 5,
          retryableStatusCodes: [408, 429, 500, 502, 503, 504],
          backoff: 'exponential' as const,
          baseDelay: 1000,
          maxDelay: 30000,
          shouldRetry: (error: any, attempt: number): boolean => {
            return attempt < 3 && error.status >= 500;
          },
        },
      };

      const { result } = renderHook(
        () => useMinder('test', config),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should allow custom backoff function with correct signature', () => {
      const wrapper = createWrapper();

      const customBackoff = (attempt: number): number => {
        return Math.min(1000 * Math.pow(2, attempt), 30000);
      };

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          retryConfig: {
            backoff: customBackoff,
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Configuration Examples', () => {
    it('should handle common retry scenario - network errors', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('api/data', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 3,
            retryableStatusCodes: [408, 429, 500, 502, 503, 504],
            backoff: 'exponential',
            baseDelay: 1000,
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should handle rate limiting scenario', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('api/data', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 5,
            retryableStatusCodes: [429], // Only retry rate limits
            backoff: 'linear',
            baseDelay: 2000, // Wait longer for rate limits
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('should handle custom retry logic', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('api/data', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 10,
            shouldRetry: (error, attempt) => {
              // Only retry server errors, not client errors
              if (error?.status && error.status < 500) return false;
              // Stop after 5 attempts even if maxRetries is higher
              if (attempt >= 5) return false;
              return true;
            },
            backoff: (attempt) => {
              // Custom backoff: first 3 attempts fast, then slow down
              if (attempt < 3) return 500;
              return 5000;
            },
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Documentation Examples', () => {
    it('example 1: custom retry count', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('posts', {
          autoFetch: false,
          retryConfig: { maxRetries: 5 },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('example 2: custom retry logic', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('posts', {
          autoFetch: false,
          retryConfig: {
            maxRetries: 3,
            retryableStatusCodes: [408, 429, 503],
            backoff: 'exponential',
            baseDelay: 1000,
            shouldRetry: (error, attempt) => {
              // Only retry on network errors, not client errors
              return error.status >= 500 || error.status === 429;
            },
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });

    it('example 3: custom backoff strategy', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('posts', {
          autoFetch: false,
          retryConfig: {
            backoff: (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000),
          },
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should not break existing code without retryConfig', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', { autoFetch: false }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should work alongside other options', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => useMinder('test', {
          autoFetch: false,
          cacheTTL: 60000,
          retryConfig: {
            maxRetries: 3,
          },
          refetchOnWindowFocus: false,
        }),
        { wrapper }
      );

      expect(result.current).toBeDefined();
    });
  });
});
