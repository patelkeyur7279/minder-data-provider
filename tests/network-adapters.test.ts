/**
 * Network Adapter Tests
 * Tests for platform-specific HTTP clients
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  NetworkAdapter,
  WebNetworkAdapter,
  NativeNetworkAdapter,
  NetworkAdapterFactory,
  createNetworkAdapter,
  createNetworkError,
} from '../src/platform/adapters/network';

// Mock fetch globally with proper typing
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch as any;

describe('NetworkAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('WebNetworkAdapter', () => {
    let adapter: WebNetworkAdapter;

    beforeEach(() => {
      adapter = new WebNetworkAdapter({
        baseURL: 'https://api.example.com',
        timeout: 5000,
      });
    });

    it('should create adapter with default config', () => {
      const defaultAdapter = new WebNetworkAdapter();
      expect(defaultAdapter).toBeInstanceOf(NetworkAdapter);
      expect(defaultAdapter.getName()).toBe('WebNetworkAdapter');
    });

    it('should be available in browser environment', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should make GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(mockData),
      } as any);

      const response = await adapter.get('/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(200);
    });

    it('should make POST request with body', async () => {
      const requestData = { name: 'New User' };
      const mockResponse = { id: 2, ...requestData };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(mockResponse),
      } as any);

      const response = await adapter.post('/users', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        })
      );
      expect(response.data).toEqual(mockResponse);
    });

    it('should build URL with query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '[]',
      } as any);

      await adapter.get('/users', {
        params: { page: 1, limit: 10, search: 'test' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users?page=1&limit=10&search=test',
        expect.any(Object)
      );
    });

    it('should merge headers correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '{}',
      } as any);

      await adapter.get('/users', {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom': 'value',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      const headers = (fetchCall as any)[1].headers;
      
      expect(headers['Authorization']).toBe('Bearer token123');
      expect(headers['X-Custom']).toBe('value');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.get('/users')).rejects.toMatchObject({
        message: expect.stringContaining('Network error'),
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });
    });

    it('should handle HTTP errors', async () => {
      const errorData = { error: 'Not found' };
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(errorData),
      } as any);

      await expect(adapter.get('/users/999')).rejects.toMatchObject({
        message: expect.stringContaining('404'),
        code: 'ERR_BAD_RESPONSE',
      });
    });

    it('should handle PUT request', async () => {
      const updateData = { name: 'Updated' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => JSON.stringify(updateData),
      } as any);

      const response = await adapter.put('/users/1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
      expect(response.data).toEqual(updateData);
    });

    it('should handle DELETE request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        text: async () => '',
      } as any);

      const response = await adapter.delete('/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(response.status).toBe(204);
    });

    it('should handle PATCH request', async () => {
      const patchData = { name: 'Patched' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => JSON.stringify(patchData),
      } as any);

      const response = await adapter.patch('/users/1', patchData);

      expect(response.data).toEqual(patchData);
    });
  });

  describe('NativeNetworkAdapter', () => {
    let adapter: NativeNetworkAdapter;

    beforeEach(() => {
      adapter = new NativeNetworkAdapter({
        baseURL: 'https://api.example.com',
      });
    });

    it('should create adapter with longer default timeout', () => {
      expect(adapter).toBeInstanceOf(NetworkAdapter);
      expect(adapter.getName()).toBe('NativeNetworkAdapter');
    });

    it('should make GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(mockData),
      } as any);

      const response = await adapter.get('/users/1');

      expect(response.data).toEqual(mockData);
    });

    it('should handle network errors with mobile-specific message', async () => {
      mockFetch.mockRejectedValue({
        message: 'Network request failed',
      });

      await expect(adapter.get('/users')).rejects.toMatchObject({
        message: expect.stringContaining('Network error'),
        code: 'NETWORK_ERROR',
      });
    });
  });

  describe('NetworkAdapterFactory', () => {
    it('should create web adapter for web platform', () => {
      const adapter = NetworkAdapterFactory.createAdapter('web');
      expect(adapter).toBeInstanceOf(WebNetworkAdapter);
    });

    it('should create native adapter for react-native platform', () => {
      const adapter = NetworkAdapterFactory.createAdapter('native');
      expect(adapter).toBeInstanceOf(NativeNetworkAdapter);
    });

    it('should auto-create adapter for current platform', () => {
      const adapter = NetworkAdapterFactory.create();
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });

    it('should create adapter with config', () => {
      const config = {
        baseURL: 'https://test.com',
        timeout: 10000,
      };
      const adapter = NetworkAdapterFactory.create(config);
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });

    it('should fallback to web adapter on error', () => {
      const adapter = NetworkAdapterFactory.createWithFallback();
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });

    it('should list available adapters', () => {
      const adapters = NetworkAdapterFactory.getAvailableAdapters();
      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBeGreaterThan(0);
    });

    it('should check adapter availability', () => {
      const isAvailable = NetworkAdapterFactory.isAdapterAvailable('web');
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Helper Functions', () => {
    it('should create network error', () => {
      const error = createNetworkError('Test error', undefined, 'TEST_CODE');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.isNetworkError).toBe(true);
    });

    it('should create adapter via helper function', () => {
      const adapter = createNetworkAdapter({
        baseURL: 'https://api.test.com',
      });
      
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });
  });

  describe('Request Interceptors', () => {
    it('should call onRequest interceptor', async () => {
      const onRequest = jest.fn((config: any) => {
        config.headers = { ...config.headers, 'X-Intercepted': 'true' };
        return config;
      }) as any;

      const adapter = new WebNetworkAdapter({
        onRequest,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '{}',
      } as any);

      await adapter.get('/test');

      expect(onRequest).toHaveBeenCalled();
    });

    it('should call onResponse interceptor', async () => {
      const onResponse = jest.fn((response: any) => response) as any;

      const adapter = new WebNetworkAdapter({
        onResponse,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '{}',
      } as any);

      await adapter.get('/test');

      expect(onResponse).toHaveBeenCalled();
    });

    it('should call onError interceptor', async () => {
      const onError = jest.fn((error: any) => {
        throw error;
      }) as any;

      const adapter = new WebNetworkAdapter({
        onError,
      });

      mockFetch.mockRejectedValue(new Error('Test error'));

      await expect(adapter.get('/test')).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
    });
  });
});


describe('NetworkAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('WebNetworkAdapter', () => {
    let adapter: WebNetworkAdapter;

    beforeEach(() => {
      adapter = new WebNetworkAdapter({
        baseURL: 'https://api.example.com',
        timeout: 5000,
      });
    });

    it('should create adapter with default config', () => {
      const defaultAdapter = new WebNetworkAdapter();
      expect(defaultAdapter).toBeInstanceOf(NetworkAdapter);
      expect(defaultAdapter.getName()).toBe('WebNetworkAdapter');
    });

    it('should be available in browser environment', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should make GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(mockData),
      });

      const response = await adapter.get('/users/1');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(200);
    });

    it('should make POST request with body', async () => {
      const requestData = { name: 'New User' };
      const mockResponse = { id: 2, ...requestData };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(mockResponse),
      });

      const response = await adapter.post('/users', requestData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        })
      );
      expect(response.data).toEqual(mockResponse);
    });

    it('should build URL with query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '[]',
      });

      await adapter.get('/users', {
        params: { page: 1, limit: 10, search: 'test' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users?page=1&limit=10&search=test',
        expect.any(Object)
      );
    });

    it('should merge headers correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '{}',
      });

      await adapter.get('/users', {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom': 'value',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;
      
      expect(headers['Authorization']).toBe('Bearer token123');
      expect(headers['X-Custom']).toBe('value');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(adapter.get('/users')).rejects.toMatchObject({
        message: expect.stringContaining('Network error'),
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });
    });

    it('should handle HTTP errors', async () => {
      const errorData = { error: 'Not found' };
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(errorData),
      });

      await expect(adapter.get('/users/999')).rejects.toMatchObject({
        message: expect.stringContaining('404'),
        code: 'ERR_BAD_RESPONSE',
      });
    });

    it('should handle PUT request', async () => {
      const updateData = { name: 'Updated' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => JSON.stringify(updateData),
      });

      const response = await adapter.put('/users/1', updateData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
      expect(response.data).toEqual(updateData);
    });

    it('should handle DELETE request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        text: async () => '',
      });

      const response = await adapter.delete('/users/1');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(response.status).toBe(204);
    });

    it('should handle PATCH request', async () => {
      const patchData = { name: 'Patched' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => JSON.stringify(patchData),
      });

      const response = await adapter.patch('/users/1', patchData);

      expect(response.data).toEqual(patchData);
    });
  });

  describe('NativeNetworkAdapter', () => {
    let adapter: NativeNetworkAdapter;

    beforeEach(() => {
      adapter = new NativeNetworkAdapter({
        baseURL: 'https://api.example.com',
      });
    });

    it('should create adapter with longer default timeout', () => {
      expect(adapter).toBeInstanceOf(NetworkAdapter);
      expect(adapter.getName()).toBe('NativeNetworkAdapter');
    });

    it('should make GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () => JSON.stringify(mockData),
      });

      const response = await adapter.get('/users/1');

      expect(response.data).toEqual(mockData);
    });

    it('should handle network errors with mobile-specific message', async () => {
      mockFetch.mockRejectedValue({
        message: 'Network request failed',
      });

      await expect(adapter.get('/users')).rejects.toMatchObject({
        message: expect.stringContaining('Network error'),
        code: 'NETWORK_ERROR',
      });
    });
  });

  describe('NetworkAdapterFactory', () => {
    it('should create web adapter for web platform', () => {
      const adapter = NetworkAdapterFactory.createAdapter('web');
      expect(adapter).toBeInstanceOf(WebNetworkAdapter);
    });

    it('should create native adapter for react-native platform', () => {
      const adapter = NetworkAdapterFactory.createAdapter('native');
      expect(adapter).toBeInstanceOf(NativeNetworkAdapter);
    });

    it('should auto-create adapter for current platform', () => {
      const adapter = NetworkAdapterFactory.create();
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });

    it('should create adapter with config', () => {
      const config = {
        baseURL: 'https://test.com',
        timeout: 10000,
      };
      const adapter = NetworkAdapterFactory.create(config);
      expect(adapter.getConfig().baseURL).toBe('https://test.com');
    });

    it('should fallback to web adapter on error', () => {
      const adapter = NetworkAdapterFactory.createWithFallback();
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });

    it('should list available adapters', () => {
      const adapters = NetworkAdapterFactory.getAvailableAdapters();
      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBeGreaterThan(0);
    });

    it('should check adapter availability', () => {
      const isAvailable = NetworkAdapterFactory.isAdapterAvailable('web');
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Helper Functions', () => {
    it('should create network error', () => {
      const error = createNetworkError('Test error', undefined, 'TEST_CODE');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.isNetworkError).toBe(true);
    });

    it('should create adapter via helper function', () => {
      const adapter = createNetworkAdapter({
        baseURL: 'https://api.test.com',
      });
      
      expect(adapter).toBeInstanceOf(NetworkAdapter);
    });
  });

  describe('Request Interceptors', () => {
    it('should call onRequest interceptor', async () => {
      const onRequest = jest.fn((config) => {
        config.headers = { ...config.headers, 'X-Intercepted': 'true' };
        return config;
      });

      const adapter = new WebNetworkAdapter({
        onRequest,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '{}',
      });

      await adapter.get('/test');

      expect(onRequest).toHaveBeenCalled();
    });

    it('should call onResponse interceptor', async () => {
      const onResponse = jest.fn((response) => response);

      const adapter = new WebNetworkAdapter({
        onResponse,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map(),
        text: async () => '{}',
      });

      await adapter.get('/test');

      expect(onResponse).toHaveBeenCalled();
    });

    it('should call onError interceptor', async () => {
      const onError = jest.fn((error) => {
        throw error;
      });

      const adapter = new WebNetworkAdapter({
        onError,
      });

      mockFetch.mockRejectedValue(new Error('Test error'));

      await expect(adapter.get('/test')).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
    });
  });
});
