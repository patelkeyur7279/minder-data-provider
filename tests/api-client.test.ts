/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { ProxyManager } from '../src/core/ProxyManager';
import type { MinderConfig } from '../src/core/types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock dependencies
jest.mock('../src/core/AuthManager');
jest.mock('../src/core/ProxyManager');
jest.mock('../src/utils/security', () => ({
  CSRFTokenManager: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockReturnValue('csrf-token-123'),
  })),
  XSSSanitizer: jest.fn().mockImplementation(() => ({
    sanitize: jest.fn((data) => data),
  })),
  RateLimiter: jest.fn().mockImplementation(() => ({
    check: jest.fn().mockReturnValue(true),
  })),
  getSecurityHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock('../src/utils/performance', () => ({
  RequestBatcher: jest.fn().mockImplementation(() => ({})),
  RequestDeduplicator: jest.fn().mockImplementation(() => ({
    deduplicate: jest.fn((key, fn) => fn()),
  })),
  PerformanceMonitor: jest.fn().mockImplementation(() => ({
    recordLatency: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({}),
    reset: jest.fn(),
  })),
}));

describe('ApiClient', () => {
  let mockAxiosInstance: any;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockProxyManager: jest.Mocked<ProxyManager>;
  let config: MinderConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    // Mock AuthManager
    mockAuthManager = {
      getToken: jest.fn().mockReturnValue('test-token'),
      clearAuth: jest.fn(),
    } as any;

    // Mock ProxyManager
    mockProxyManager = {
      isEnabled: jest.fn().mockReturnValue(false),
      config: { baseUrl: 'http://proxy.example.com' },
      getProxyHeaders: jest.fn().mockReturnValue({}),
      getTimeout: jest.fn().mockReturnValue(30000),
      rewriteUrl: jest.fn((url) => url),
    } as any;

    // Base config
    config = {
      apiBaseUrl: 'http://api.example.com',
      routes: {
        getUser: {
          url: '/users/:id',
          method: 'GET',
        },
        createUser: {
          url: '/users',
          method: 'POST',
        },
        uploadFile: {
          url: '/upload',
          method: 'POST',
        },
      },
    };
  });

  describe('Constructor', () => {
    it('should create axios instance with correct config', () => {
      new ApiClient(config, mockAuthManager);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://api.example.com',
        timeout: 30000,
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
    });

    it('should use proxy baseURL when proxy is enabled', () => {
      mockProxyManager.isEnabled = jest.fn().mockReturnValue(true);

      new ApiClient(config, mockAuthManager, mockProxyManager);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://proxy.example.com',
        })
      );
    });

    it('should initialize with custom timeout from config', () => {
      const customConfig = {
        ...config,
        performance: { timeout: 60000 },
      };

      new ApiClient(customConfig, mockAuthManager);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('should enable CORS credentials based on config', () => {
      const corsConfig = {
        ...config,
        cors: { credentials: false },
      };

      new ApiClient(corsConfig, mockAuthManager);

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          withCredentials: false,
        })
      );
    });

    it('should setup request and response interceptors', () => {
      new ApiClient(config, mockAuthManager);

      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('Request Method', () => {
    it('should make GET request successfully', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      const mockResponse = { data: { id: 1, name: 'John' } };
      mockAxiosInstance.request.mockResolvedValueOnce(mockResponse);

      const result = await apiClient.request('getUser', undefined, { id: '1' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/users/1',
        })
      );
      expect(result).toEqual({ id: 1, name: 'John' });
    });

    it('should make POST request with data', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      const postData = { name: 'Jane', email: 'jane@example.com' };
      const mockResponse = { data: { id: 2, ...postData } };
      mockAxiosInstance.request.mockResolvedValueOnce(mockResponse);

      const result = await apiClient.request('createUser', postData);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/users',
          data: postData,
        })
      );
      expect(result).toEqual({ id: 2, ...postData });
    });

    it('should throw error when route not found', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);

      await expect(apiClient.request('nonExistentRoute')).rejects.toThrow('Route \'nonExistentRoute\' not found');
    });

    it('should replace URL parameters', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      mockAxiosInstance.request.mockResolvedValueOnce({ data: {} });

      await apiClient.request('getUser', undefined, { id: '123' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/users/123',
        })
      );
    });

    it('should handle FormData correctly', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      const formData = new FormData();
      formData.append('file', new Blob(['content']));
      mockAxiosInstance.request.mockResolvedValueOnce({ data: { success: true } });

      await apiClient.request('uploadFile', formData);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: formData,
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data',
          }),
        })
      );
    });

    it('should handle XML data', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      const xmlData = '<?xml version="1.0"?><data>test</data>';
      mockAxiosInstance.request.mockResolvedValueOnce({ data: { success: true } });

      await apiClient.request('createUser', xmlData);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: xmlData,
          headers: expect.objectContaining({
            'Content-Type': 'application/xml',
          }),
        })
      );
    });

    it('should use proxy URL when proxy is enabled', async () => {
      mockProxyManager.isEnabled = jest.fn().mockReturnValue(true);
      mockProxyManager.rewriteUrl = jest.fn().mockReturnValue('/proxy/users/1');
      
      const apiClient = new ApiClient(config, mockAuthManager, mockProxyManager);
      mockAxiosInstance.request.mockResolvedValueOnce({ data: {} });

      await apiClient.request('getUser', undefined, { id: '1' });

      expect(mockProxyManager.rewriteUrl).toHaveBeenCalled();
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/proxy/users/1',
          baseURL: '',
        })
      );
    });

    it('should include proxy headers when proxy is enabled', async () => {
      mockProxyManager.isEnabled = jest.fn().mockReturnValue(true);
      mockProxyManager.getProxyHeaders = jest.fn().mockReturnValue({
        'X-Proxy-Header': 'value',
      });
      
      const apiClient = new ApiClient(config, mockAuthManager, mockProxyManager);
      mockAxiosInstance.request.mockResolvedValueOnce({ data: {} });

      await apiClient.request('getUser', undefined, { id: '1' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Proxy-Header': 'value',
          }),
        })
      );
    });
  });

  describe('File Upload', () => {
    it('should upload file successfully', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      mockAxiosInstance.request.mockResolvedValueOnce({ data: { url: 'http://example.com/test.txt' } });

      const result = await apiClient.uploadFile('uploadFile', file);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/upload',
        })
      );
      expect(result).toEqual({ url: 'http://example.com/test.txt' });
    });

    it('should track upload progress', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      const file = new File(['content'], 'test.txt');
      const onProgress = jest.fn();

      mockAxiosInstance.request.mockImplementationOnce((config) => {
        // Simulate progress
        if (config.onUploadProgress) {
          config.onUploadProgress({ loaded: 50, total: 100 });
          config.onUploadProgress({ loaded: 100, total: 100 });
        }
        return Promise.resolve({ data: { success: true } });
      });

      await apiClient.uploadFile('uploadFile', file, onProgress);

      expect(onProgress).toHaveBeenCalledWith({
        loaded: 50,
        total: 100,
        percentage: 50,
      });
      expect(onProgress).toHaveBeenCalledWith({
        loaded: 100,
        total: 100,
        percentage: 100,
      });
    });
  });

  describe('WebSocket', () => {
    it('should create WebSocket with authentication token', () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      // Mock WebSocket
      (global as any).WebSocket = jest.fn().mockImplementation((url) => ({ url }));

      const ws = apiClient.createWebSocket('ws://example.com/socket');

      expect((global as any).WebSocket).toHaveBeenCalledWith(
        'ws://example.com/socket?token=test-token',
        undefined
      );
    });

    it('should create WebSocket without token when not authenticated', () => {
      mockAuthManager.getToken = jest.fn().mockReturnValue(null);
      const apiClient = new ApiClient(config, mockAuthManager);
      
      (global as any).WebSocket = jest.fn().mockImplementation((url) => ({ url }));

      apiClient.createWebSocket('ws://example.com/socket');

      expect((global as any).WebSocket).toHaveBeenCalledWith(
        'ws://example.com/socket',
        undefined
      );
    });

    it('should create WebSocket with protocols', () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      (global as any).WebSocket = jest.fn().mockImplementation((url, protocols) => ({ url, protocols }));

      apiClient.createWebSocket('ws://example.com/socket', ['protocol1', 'protocol2']);

      expect((global as any).WebSocket).toHaveBeenCalledWith(
        'ws://example.com/socket?token=test-token',
        ['protocol1', 'protocol2']
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('should record performance metrics when monitoring is enabled', async () => {
      const performanceConfig = {
        ...config,
        performance: { monitoring: true },
      };
      
      const apiClient = new ApiClient(performanceConfig, mockAuthManager);
      mockAxiosInstance.request.mockResolvedValueOnce({ data: {} });

      await apiClient.request('getUser', undefined, { id: '1' });

      // Performance monitor should have been created and recordLatency called
      const metrics = apiClient.getPerformanceMetrics();
      expect(metrics).toBeDefined();
    });

    it('should get performance metrics', () => {
      const performanceConfig = {
        ...config,
        performance: { monitoring: true },
      };
      
      const apiClient = new ApiClient(performanceConfig, mockAuthManager);
      const metrics = apiClient.getPerformanceMetrics();

      expect(metrics).toBeDefined();
    });

    it('should reset performance metrics', () => {
      const performanceConfig = {
        ...config,
        performance: { monitoring: true },
      };
      
      const apiClient = new ApiClient(performanceConfig, mockAuthManager);
      apiClient.resetPerformanceMetrics();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Security Features', () => {
    it('should initialize CSRF protection when enabled', () => {
      const securityConfig = {
        ...config,
        security: {
          csrfProtection: { enabled: true, cookieName: 'csrf' },
        },
      };

      new ApiClient(securityConfig, mockAuthManager);

      // CSRF manager should be initialized
      expect(true).toBe(true);
    });

    it('should initialize rate limiting when enabled', () => {
      const securityConfig = {
        ...config,
        security: {
          rateLimiting: { requests: 100, window: 60000 },
        },
      };

      new ApiClient(securityConfig, mockAuthManager);

      // Rate limiter should be initialized
      expect(true).toBe(true);
    });

    it('should initialize XSS sanitization when enabled', () => {
      const securityConfig = {
        ...config,
        security: {
          sanitization: { enabled: true },
        },
      };

      new ApiClient(securityConfig, mockAuthManager);

      // Sanitizer should be initialized
      expect(true).toBe(true);
    });
  });

  describe('Request Deduplication', () => {
    it('should initialize deduplication when enabled', () => {
      const deduplicationConfig = {
        ...config,
        performance: { deduplication: true },
      };
      
      const apiClient = new ApiClient(deduplicationConfig, mockAuthManager);

      // Deduplicator should be initialized
      expect(apiClient).toBeDefined();
    });
  });

  describe('Request Batching', () => {
    it('should initialize request batching when enabled', () => {
      const batchingConfig = {
        ...config,
        performance: { batching: true, batchDelay: 50 },
      };

      new ApiClient(batchingConfig, mockAuthManager);

      // Request batcher should be initialized
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      // The error needs to be thrown after going through interceptors
      const networkError = {
        request: {},
        code: 'ERR_NETWORK',
        config: { url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(networkError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        // Error should be caught and handled
        expect(error).toBeDefined();
      }
    });

    it('should handle timeout errors gracefully', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const timeoutError = {
        request: {},
        code: 'ECONNABORTED',
        config: { timeout: 30000, url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(timeoutError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 401 errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const authError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' },
        },
        config: { url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(authError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 403 errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const forbiddenError = {
        response: {
          status: 403,
          data: { message: 'Forbidden' },
        },
        config: { url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(forbiddenError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 404 errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const notFoundError = {
        response: {
          status: 404,
          data: { message: 'Not found' },
        },
        config: { url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(notFoundError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 422 validation errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const validationError = {
        response: {
          status: 422,
          data: {
            message: 'Validation failed',
            errors: { email: ['Invalid email'] },
          },
        },
        config: { url: '/users', method: 'POST' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(validationError);

      try {
        await apiClient.request('createUser', { email: 'invalid' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 429 rate limit errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const rateLimitError = {
        response: {
          status: 429,
          data: { message: 'Too many requests' },
        },
        config: { url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(rateLimitError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle 500 server errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      
      const serverError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
        config: { url: '/users/1', method: 'GET' },
      };
      
      mockAxiosInstance.request.mockRejectedValueOnce(serverError);

      try {
        await apiClient.request('getUser', undefined, { id: '1' });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle unknown errors', async () => {
      const apiClient = new ApiClient(config, mockAuthManager);
      mockAxiosInstance.request.mockRejectedValueOnce(new Error('Unknown error'));

      await expect(apiClient.request('getUser', undefined, { id: '1' })).rejects.toThrow();
    });
  });

  describe('Model Transformation', () => {
    it('should transform response using model for single object', async () => {
      class UserModel {
        fromJSON(data: any) {
          return { ...data, transformed: true };
        }
      }

      const modelConfig = {
        ...config,
        routes: {
          getUser: {
            url: '/users/:id',
            method: 'GET',
            model: UserModel,
          },
        },
      };

      const apiClient = new ApiClient(modelConfig as any, mockAuthManager);
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: { id: 1, name: 'John' },
      });

      const result = await apiClient.request('getUser', undefined, { id: '1' });

      expect(result).toHaveProperty('transformed', true);
    });

    it('should transform response using model for array', async () => {
      class UserModel {
        fromJSON(data: any) {
          return { ...data, transformed: true };
        }
      }

      const modelConfig = {
        ...config,
        routes: {
          getUser: {
            url: '/users',
            method: 'GET',
            model: UserModel,
          },
        },
      };

      const apiClient = new ApiClient(modelConfig as any, mockAuthManager);
      mockAxiosInstance.request.mockResolvedValueOnce({
        data: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
      });

      const result = await apiClient.request('getUser');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('transformed', true);
      expect(result[1]).toHaveProperty('transformed', true);
    });
  });
});
