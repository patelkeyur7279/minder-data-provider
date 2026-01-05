import { CorsManager } from '../src/utils/corsManager';
import { HttpMethod } from '../src/constants/enums';
import type { CorsConfig } from '../src/core/types';

describe('CorsManager', () => {
  let corsManager: CorsManager;
  const mockConfig: CorsConfig = {
    enabled: true,
    credentials: true,
    methods: [HttpMethod.GET, HttpMethod.POST],
    headers: ['Content-Type', 'Authorization'],
    origin: 'http://localhost:3000'
  };

  beforeEach(() => {
    corsManager = new CorsManager(mockConfig);
  });

  describe('constructor', () => {
    it('should create CorsManager with config', () => {
      expect(corsManager).toBeDefined();
    });

    it('should enable CORS by default in browser environment', () => {
      const manager = new CorsManager();
      expect(manager).toBeDefined();
    });
  });

  describe('getCorsHeaders', () => {
    it('should return CORS headers when enabled', () => {
      const headers = corsManager.getCorsHeaders(HttpMethod.GET, { 'Custom-Header': 'value' });

      expect(headers).toHaveProperty('Custom-Header', 'value');
      expect(headers).toHaveProperty('Credentials', 'include');
    });

    it('should return original headers when CORS disabled', () => {
      const disabledManager = new CorsManager({ enabled: false });
      const headers = disabledManager.getCorsHeaders(HttpMethod.GET, { 'Test': 'value' });

      expect(headers).toEqual({ 'Test': 'value' });
      expect(headers).not.toHaveProperty('Credentials');
    });
  });

  describe('handleCorsError', () => {
    it('should return no retry for non-CORS errors', async () => {
      const error = new Error('Network error');
      const result = await corsManager.handleCorsError(error, 'https://api.example.com', 'GET', {});

      expect(result.shouldRetry).toBe(false);
      expect(result.userFriendlyMessage).toBe('');
    });

    it('should detect CORS errors and provide user-friendly messages', async () => {
      const corsError = new Error('CORS policy blocked request');
      const result = await corsManager.handleCorsError(corsError, 'https://api.example.com', 'GET', {});

      expect(result.shouldRetry).toBe(false);
      expect(result.userFriendlyMessage).toContain('Connection Blocked');
    });

    it('should try automatic fixes for credentials errors', async () => {
      // Create manager with proxy config to test proxy fallback
      const corsManagerWithProxy = new CorsManager({
        ...mockConfig,
        proxy: 'https://proxy.example.com'
      });

      // Mock development environment
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true
      });

      const corsError = new Error('Credentials flag is true, but the CORS policy');
      const result = await corsManagerWithProxy.handleCorsError(corsError, 'https://api.example.com', 'GET', { 'Credentials': 'include' });

      expect(result.shouldRetry).toBe(true);
      expect(result.useProxy).toBe(true);
      expect(result.userFriendlyMessage).toContain('Using development proxy');

      // Restore original env
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true
      });
    });

    it('should try automatic fixes for header errors', async () => {
      const corsError = new Error('Request header field x-custom-header is not allowed by Access-Control-Allow-Headers');
      const result = await corsManager.handleCorsError(corsError, 'https://api.example.com', 'GET', {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'value'
      });

      expect(result.shouldRetry).toBe(true);
      expect(result.modifiedHeaders).toBeDefined();
      // Should keep essential headers and x- headers
      expect(result.modifiedHeaders!['Content-Type']).toBe('application/json');
      expect(result.modifiedHeaders!['X-Custom-Header']).toBe('value'); // x- headers are kept
    });
  });

  describe('validateConfig', () => {
    it('should validate CORS configuration', () => {
      const result = corsManager.validateConfig();

      expect(result.isValid).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should warn about credentials without origin', () => {
      const configWithCredentials: CorsConfig = {
        enabled: true,
        credentials: true
      };
      const manager = new CorsManager(configWithCredentials);
      const result = manager.validateConfig();

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// Note: ApiClient integration tests are covered by existing api-client.test.ts
// The CorsManager provides the core CORS functionality tested above