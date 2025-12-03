import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { MinderConfig } from '../src/core/types';
import { StorageType, HttpMethod } from '../src/constants/enums';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Token Refresh Logic', () => {
  let apiClient: ApiClient;
  let authManager: AuthManager;
  let config: MinderConfig;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Setup mock axios instance
    mockAxiosInstance = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      request: jest.fn(),
      post: jest.fn(),
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    // Also mock axios.post for the direct call in refresh logic
    mockedAxios.post.mockResolvedValue({ data: {} });

    // Setup config with refreshUrl
    config = {
      apiBaseUrl: 'https://api.test.com',
      auth: {
        tokenKey: 'auth_token',
        storage: StorageType.MEMORY,
        refreshUrl: '/auth/refresh',
        onAuthError: jest.fn(),
      },
      routes: {
        getData: { method: HttpMethod.GET, url: '/data' },
      },
    };

    authManager = new AuthManager(config.auth);
    // Set initial token
    authManager.setToken('old-token');
    authManager.setRefreshToken('mock-refresh-token'); // Required for refresh logic

    // Create ApiClient
    apiClient = new ApiClient(config, authManager);

    // We need to manually trigger the interceptor logic since we're mocking axios
    // But wait, ApiClient sets up interceptors in constructor.
    // We can capture the error interceptor and call it directly.

    // Capture the response error interceptor
    const useCalls = mockAxiosInstance.interceptors.response.use.mock.calls;
    // The second argument of the first call to use() is the error interceptor
    // Assuming ApiClient calls use() once for response.
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should attempt to refresh token on 401', async () => {
    const onAuthErrorSpy = config.auth?.onAuthError;

    // Get the error interceptor
    const useCalls = mockAxiosInstance.interceptors.response.use.mock.calls;
    const errorInterceptor = useCalls[0][1]; // successHandler, errorHandler

    // Mock refresh endpoint success
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        token: 'new-valid-token',
        refreshToken: 'new-refresh-token'
      }
    });

    // Mock retry success
    mockAxiosInstance.request.mockResolvedValueOnce({ data: 'success', config: {} });

    // Simulate 401 error
    const error = {
      config: {
        url: '/data',
        method: 'get',
        headers: {}
      },
      response: { status: 401 }
    };

    // Call the interceptor
    const result = await errorInterceptor(error);

    // Verify:
    // 1. Refresh endpoint called
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.test.com/auth/refresh',
      expect.any(Object),
      expect.any(Object)
    );

    // 2. AuthManager updated
    expect(authManager.getToken()).toBe('new-valid-token');

    // 3. Request retried with new token
    expect(mockAxiosInstance.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer new-valid-token'
      })
    }));

    // 4. onAuthError NOT called
    expect(onAuthErrorSpy).not.toHaveBeenCalled();
  });

  it('should fail if refresh fails', async () => {
    const onAuthErrorSpy = config.auth?.onAuthError;

    const useCalls = mockAxiosInstance.interceptors.response.use.mock.calls;
    const errorInterceptor = useCalls[0][1];

    // Mock refresh endpoint failure
    mockedAxios.post.mockRejectedValueOnce(new Error('Refresh failed'));

    const error = {
      config: { url: '/data', method: 'get', headers: {} },
      response: { status: 401 }
    };

    // Expect interceptor to reject
    await expect(errorInterceptor(error)).rejects.toThrow('Refresh failed');

    // Verify onAuthError called
    expect(onAuthErrorSpy).toHaveBeenCalled();

    // Verify auth cleared
    expect(authManager.getToken()).toBeNull();
  });
});
