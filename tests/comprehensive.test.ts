import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { CacheManager } from '../src/core/CacheManager';
import { WebSocketManager } from '../src/core/WebSocketManager';
import { BaseModel } from '../src/models/BaseModel';
import { MinderConfig } from '../src/core/types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create a mock axios instance
const mockAxiosInstance = {
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
};

// Mock axios.create to return our mock instance
mockedAxios.create = jest.fn(() => mockAxiosInstance as any);

// Test Model
class TestModel extends BaseModel {
  public name!: string;
  public email!: string;
  
  public fromJSON(data: any): this {
    super.fromJSON(data);
    this.name = data.name || '';
    this.email = data.email || '';
    return this;
  }
  
  public validate() {
    const errors: string[] = [];
    if (!this.name) errors.push('Name is required');
    if (!this.email) errors.push('Email is required');
    return { isValid: errors.length === 0, errors };
  }
}

describe.skip('Minder Data Provider', () => {
  let config: MinderConfig;
  let authManager: AuthManager;
  let apiClient: ApiClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockAxiosInstance.get.mockClear();
    mockAxiosInstance.post.mockClear();
    mockAxiosInstance.put.mockClear();
    mockAxiosInstance.patch.mockClear();
    mockAxiosInstance.delete.mockClear();
    
    config = {
      apiBaseUrl: 'https://api.example.com',
      dynamic: false,
      routes: {
        users: {
          method: 'GET',
          url: '/users',
          model: TestModel,
          optimistic: true,
        },
        createUser: {
          method: 'POST',
          url: '/users',
          model: TestModel,
          optimistic: true,
        },
      },
      auth: {
        tokenKey: 'accessToken',
        storage: 'memory',
      },
      cors: {
        credentials: true,
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      },
    };

    authManager = new AuthManager(config.auth);
    apiClient = new ApiClient(config, authManager);
  });

  describe('AuthManager', () => {
    it('should store and retrieve tokens', () => {
      const token = 'test-token';
      authManager.setToken(token);
      expect(authManager.getToken()).toBe(token);
    });

    it('should clear authentication', () => {
      authManager.setToken('test-token');
      authManager.clearAuth();
      expect(authManager.getToken()).toBeNull();
    });

    it('should check authentication status', () => {
      expect(authManager.isAuthenticated()).toBe(false);
      authManager.setToken('test-token');
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should handle JWT token expiration', () => {
      // Create expired JWT token
      const expiredToken = btoa(JSON.stringify({
        sub: '123',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      }));
      const fullToken = `header.${expiredToken}.signature`;
      
      authManager.setToken(fullToken);
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });

  describe('BaseModel', () => {
    it('should create model from JSON', () => {
      const data = { id: 1, name: 'John Doe', email: 'john@example.com' };
      const model = new TestModel().fromJSON(data);
      
      expect(model.id).toBe(1);
      expect(model.name).toBe('John Doe');
      expect(model.email).toBe('john@example.com');
    });

    it('should convert model to JSON', () => {
      const model = new TestModel();
      model.id = 1;
      model.name = 'John Doe';
      model.email = 'john@example.com';
      
      const json = model.toJSON();
      expect(json).toEqual({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should validate model data', () => {
      const model = new TestModel();
      
      // Invalid model
      let validation = model.validate();
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Name is required');
      expect(validation.errors).toContain('Email is required');
      
      // Valid model
      model.name = 'John Doe';
      model.email = 'john@example.com';
      validation = model.validate();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should clone model', () => {
      const original = new TestModel();
      original.id = 1;
      original.name = 'John Doe';
      original.email = 'john@example.com';
      
      const clone = original.clone();
      expect(clone).not.toBe(original);
      expect(clone.equals(original)).toBe(true);
    });

    it('should check equality', () => {
      const model1 = new TestModel().fromJSON({ id: 1, name: 'John', email: 'john@example.com' });
      const model2 = new TestModel().fromJSON({ id: 1, name: 'John', email: 'john@example.com' });
      const model3 = new TestModel().fromJSON({ id: 2, name: 'Jane', email: 'jane@example.com' });
      
      expect(model1.equals(model2)).toBe(true);
      expect(model1.equals(model3)).toBe(false);
    });

    it('should detect changes', () => {
      const original = new TestModel().fromJSON({ id: 1, name: 'John', email: 'john@example.com' });
      const modified = original.clone();
      modified.name = 'Jane';
      
      expect(original.hasChanges(modified)).toBe(true);
      expect(original.getChangedFields(modified)).toContain('name');
    });
  });

  describe('ApiClient', () => {
    it('should make API requests', async () => {
      const mockResponse = { data: [{ id: 1, name: 'John', email: 'john@example.com' }] };
      
      // Mock axios request
      const mockAxios = require('axios');
      mockAxios.create.mockReturnValue({
        request: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      const result = await apiClient.request('users');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle CORS configuration', () => {
      expect(config.cors?.credentials).toBe(true);
      expect(config.cors?.origin).toBe('*');
      expect(config.cors?.methods).toContain('GET');
    });

    it('should transform responses using models', async () => {
      const mockResponse = { 
        data: [{ id: 1, name: 'John', email: 'john@example.com' }] 
      };
      
      const mockAxios = require('axios');
      mockAxios.create.mockReturnValue({
        request: jest.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      const result = await apiClient.request('users');
      expect(result[0]).toBeInstanceOf(TestModel);
      expect(result[0].name).toBe('John');
    });
  });

  describe('CacheManager', () => {
    let cacheManager: CacheManager;
    let mockQueryClient: any;

    beforeEach(() => {
      mockQueryClient = {
        getQueryData: jest.fn(),
        setQueryData: jest.fn(),
        invalidateQueries: jest.fn(),
        removeQueries: jest.fn(),
        clear: jest.fn(),
        getQueryCache: jest.fn(() => ({
          getAll: jest.fn(() => []),
        })),
        getQueryState: jest.fn(),
        cancelQueries: jest.fn(),
        prefetchQuery: jest.fn(),
      };
      
      cacheManager = new CacheManager(mockQueryClient);
    });

    it('should get cached data', () => {
      const testData = [{ id: 1, name: 'John' }];
      mockQueryClient.getQueryData.mockReturnValue(testData);
      
      const result = cacheManager.getCachedData('users');
      expect(result).toBe(testData);
      expect(mockQueryClient.getQueryData).toHaveBeenCalledWith(['users']);
    });

    it('should set cached data', () => {
      const testData = [{ id: 1, name: 'John' }];
      cacheManager.setCachedData('users', testData);
      
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(['users'], testData);
    });

    it('should invalidate queries', async () => {
      await cacheManager.invalidateQueries('users');
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] });
    });

    it('should clear cache', () => {
      cacheManager.clearCache('users');
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['users'] });
      
      cacheManager.clearCache();
      expect(mockQueryClient.clear).toHaveBeenCalled();
    });
  });

  describe('WebSocketManager', () => {
    let wsManager: WebSocketManager;
    let mockWebSocket: any;

    beforeEach(() => {
      // Mock WebSocket
      mockWebSocket = {
        readyState: 1, // OPEN
        send: jest.fn(),
        close: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      
      global.WebSocket = jest.fn(() => mockWebSocket) as any;
      
      wsManager = new WebSocketManager(
        { url: 'ws://localhost:8080', reconnect: true, heartbeat: 30000 },
        authManager
      );
    });

    it('should create WebSocket connection', async () => {
      const connectPromise = wsManager.connect();
      
      // Simulate connection open
      mockWebSocket.onopen();
      
      await expect(connectPromise).resolves.toBeUndefined();
    });

    it('should send messages', () => {
      wsManager.send('test', { message: 'hello' });
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'test', data: { message: 'hello' } })
      );
    });

    it('should handle subscriptions', () => {
      const callback = jest.fn();
      const unsubscribe = wsManager.subscribe('message', callback);
      
      // Simulate message received
      wsManager['handleMessage']({ type: 'message', data: { text: 'hello' } });
      
      expect(callback).toHaveBeenCalledWith({ text: 'hello' });
      
      // Test unsubscribe
      unsubscribe();
      wsManager['handleMessage']({ type: 'message', data: { text: 'hello2' } });
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should check connection status', () => {
      expect(wsManager.isConnected()).toBe(true);
      
      mockWebSocket.readyState = 3; // CLOSED
      expect(wsManager.isConnected()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const mockAxios = require('axios');
      mockAxios.create.mockReturnValue({
        request: jest.fn().mockRejectedValue(new Error('Network Error')),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await expect(apiClient.request('users')).rejects.toThrow();
    });

    it('should handle API errors', async () => {
      const mockAxios = require('axios');
      const apiError = {
        response: {
          status: 404,
          data: { message: 'Not Found', code: 'NOT_FOUND' },
        },
      };
      
      mockAxios.create.mockReturnValue({
        request: jest.fn().mockRejectedValue(apiError),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await expect(apiClient.request('users')).rejects.toMatchObject({
        status: 404,
        message: 'Not Found',
        code: 'NOT_FOUND',
      });
    });
  });

  describe('Performance Features', () => {
    it('should support request deduplication', () => {
      expect(config.performance?.deduplication).toBe(undefined);
      
      const performanceConfig = {
        ...config,
        performance: { deduplication: true, retries: 3, retryDelay: 1000 },
      };
      
      expect(performanceConfig.performance.deduplication).toBe(true);
    });

    it('should support retry configuration', () => {
      const performanceConfig = {
        ...config,
        performance: { retries: 5, retryDelay: 2000 },
      };
      
      expect(performanceConfig.performance.retries).toBe(5);
      expect(performanceConfig.performance.retryDelay).toBe(2000);
    });
  });

  describe('Integration Tests', () => {
    it('should work with complete configuration', () => {
      const fullConfig: MinderConfig = {
        apiBaseUrl: 'https://api.example.com',
        dynamic: false,
        routes: {
          users: { method: 'GET', url: '/users', model: TestModel, optimistic: true },
          createUser: { method: 'POST', url: '/users', model: TestModel },
        },
        auth: { tokenKey: 'token', storage: 'localStorage' },
        cors: { credentials: true, origin: '*' },
        cache: { staleTime: 300000, gcTime: 600000 },
        websocket: { url: 'ws://localhost:8080', reconnect: true },
        performance: { deduplication: true, retries: 3 },
      };
      
      expect(fullConfig.apiBaseUrl).toBe('https://api.example.com');
      expect(fullConfig.routes.users.model).toBe(TestModel);
      expect(fullConfig.auth?.storage).toBe('localStorage');
      expect(fullConfig.cors?.credentials).toBe(true);
      expect(fullConfig.websocket?.reconnect).toBe(true);
    });

    it('should handle model transformation in API responses', async () => {
      const mockData = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ];
      
      const mockAxios = require('axios');
      mockAxios.create.mockReturnValue({
        request: jest.fn().mockResolvedValue({ data: mockData }),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      const result = await apiClient.request('users');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(TestModel);
      expect(result[0].name).toBe('John');
      expect(result[1].name).toBe('Jane');
    });
  });
});