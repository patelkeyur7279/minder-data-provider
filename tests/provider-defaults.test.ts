/**
 * Tests for MinderDataProvider default configuration
 * Specifically tests default retry count changes from 3 to 1
 */

import { describe, it, expect } from '@jest/globals';
import { getQueryClientConfig } from '../src/core/MinderDataProvider';
import type { MinderConfig } from '../src/core/types';

describe('MinderDataProvider Defaults', () => {
  describe('Query Retry Defaults', () => {
    it('should have default retry count of 1 when no retries specified', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.queries.retry).toBe(1);
    });

    it('should respect explicit retries: 0 (nullish coalescing fix)', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 0,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      // This is the key fix: retries: 0 should result in retry: 0, not fall back to 1
      expect(queryConfig.defaultOptions.queries.retry).toBe(0);
    });

    it('should use custom retries value when specified', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 5,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.queries.retry).toBe(5);
    });
  });

  describe('Mutation Retry Defaults', () => {
    it('should have default retry count of 1 for mutations when no retries specified', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.mutations.retry).toBe(1);
    });

    it('should respect explicit retries: 0 for mutations (nullish coalescing fix)', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 0,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.mutations.retry).toBe(0);
    });

    it('should use custom retries value for mutations when specified', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 3,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.mutations.retry).toBe(3);
    });
  });

  describe('Retry Delay Defaults', () => {
    it('should have default retryDelay of 1000ms when not specified', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.queries.retryDelay).toBe(1000);
    });

    it('should respect explicit retryDelay: 0 (nullish coalescing fix)', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retryDelay: 0,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      // This is the key fix: retryDelay: 0 should result in retryDelay: 0, not fall back to 1000
      expect(queryConfig.defaultOptions.queries.retryDelay).toBe(0);
    });

    it('should use custom retryDelay value when specified', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retryDelay: 2000,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.queries.retryDelay).toBe(2000);
    });
  });

  describe('Combined Configuration', () => {
    it('should properly configure all retry-related defaults together', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
      };

      const queryConfig = getQueryClientConfig(config);

      // Verify all defaults work together
      expect(queryConfig.defaultOptions.queries.retry).toBe(1);
      expect(queryConfig.defaultOptions.queries.retryDelay).toBe(1000);
      expect(queryConfig.defaultOptions.mutations.retry).toBe(1);
    });

    it('should respect full custom performance configuration', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 5,
          retryDelay: 2000,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      expect(queryConfig.defaultOptions.queries.retry).toBe(5);
      expect(queryConfig.defaultOptions.queries.retryDelay).toBe(2000);
      expect(queryConfig.defaultOptions.mutations.retry).toBe(5);
    });
  });

  describe('Zero-value handling (Nullish Coalescing)', () => {
    it('should allow retries: 0 to override default', () => {
      const config: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 0,
          retryDelay: 0,
        },
      };

      const queryConfig = getQueryClientConfig(config);

      // Both should be 0, not fall back to defaults
      expect(queryConfig.defaultOptions.queries.retry).toBe(0);
      expect(queryConfig.defaultOptions.queries.retryDelay).toBe(0);
      expect(queryConfig.defaultOptions.mutations.retry).toBe(0);
    });

    it('should distinguish between undefined and explicit 0', () => {
      // With undefined (no performance config)
      const config1: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
      };

      const queryConfig1 = getQueryClientConfig(config1);
      expect(queryConfig1.defaultOptions.queries.retry).toBe(1);
      expect(queryConfig1.defaultOptions.queries.retryDelay).toBe(1000);

      // With explicit 0
      const config2: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        routes: {},
        performance: {
          retries: 0,
          retryDelay: 0,
        },
      };

      const queryConfig2 = getQueryClientConfig(config2);
      expect(queryConfig2.defaultOptions.queries.retry).toBe(0);
      expect(queryConfig2.defaultOptions.queries.retryDelay).toBe(0);
    });
  });
});
