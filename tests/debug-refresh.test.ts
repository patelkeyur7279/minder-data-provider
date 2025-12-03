import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { StorageType } from '../src/constants/enums';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Debug Refresh Token Failure', () => {
    let apiClient: ApiClient;
    let authManager: AuthManager;
    let mockAxiosInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup AuthManager
        authManager = new AuthManager({
            tokenKey: 'accessToken',
            storage: StorageType.MEMORY,
            refreshUrl: '/auth/refresh',
        });

        // Setup Axios Instance Mock
        mockAxiosInstance = {
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() }
            },
            request: jest.fn(),
            defaults: { headers: { common: {} } }
        };

        mockedAxios.create.mockReturnValue(mockAxiosInstance);
        mockedAxios.isAxiosError.mockReturnValue(true);

        apiClient = new ApiClient({
            apiBaseUrl: 'https://api.example.com',
            routes: {},
            auth: {
                tokenKey: 'accessToken',
                storage: StorageType.MEMORY,
                refreshUrl: '/auth/refresh',
            }
        }, authManager);

        // Manually trigger setupInterceptors (it's called in constructor but we need to capture the interceptors)
        // The constructor calls it, so mockAxiosInstance.interceptors.response.use should have been called.
    });

    it('should succeed if response has "accessToken" property', async () => {
        // 1. Setup initial state
        authManager.setToken('expired-token');
        authManager.setRefreshToken('valid-refresh-token');

        // 2. Mock the 401 error
        const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

        const originalRequest = {
            headers: {},
            url: '/data',
            method: 'get',
            _retry: false
        };

        const error401 = {
            config: originalRequest,
            response: { status: 401 }
        };

        // 3. Mock the Refresh API call to return 'accessToken'
        mockedAxios.post.mockResolvedValue({
            data: {
                accessToken: 'new-valid-token', // Matches fallback logic
                refreshToken: 'new-refresh-token'
            }
        });

        // Mock retry request success
        mockAxiosInstance.request.mockResolvedValue({ status: 200, data: 'success' });

        // 4. Expect the refresh flow to SUCCEED
        await expect(errorInterceptor(error401)).resolves.toEqual({ status: 200, data: 'success' });
    });

    it('should send Authorization header with expired token', async () => {
        // 1. Setup initial state
        authManager.setToken('expired-token');
        authManager.setRefreshToken('valid-refresh-token');

        // 2. Mock the 401 error
        const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

        const originalRequest = {
            headers: {},
            url: '/data',
            method: 'get',
            _retry: false
        };

        const error401 = {
            config: originalRequest,
            response: { status: 401 }
        };

        // 3. Mock success
        mockedAxios.post.mockResolvedValue({
            data: { token: 'new-token' }
        });
        mockAxiosInstance.request.mockResolvedValue({ status: 200 });

        // 4. Trigger
        await errorInterceptor(error401);

        // 5. Verify axios.post was called WITH Authorization header
        const callArgs = mockedAxios.post.mock.calls[0];
        const config = callArgs[2];
        expect(config).toBeDefined();
        expect(config?.headers).toBeDefined();
        expect(config?.headers?.['Authorization']).toBe('Bearer expired-token');
    });

    it('should fail if response property name does not match any supported key', async () => {
        // 1. Setup initial state
        authManager.setToken('expired-token');
        authManager.setRefreshToken('valid-refresh-token');

        // 2. Mock the 401 error
        const errorInterceptor = mockAxiosInstance.interceptors.response.use.mock.calls[0][1];

        const originalRequest = {
            headers: {},
            url: '/data',
            method: 'get',
            _retry: false
        };

        const error401 = {
            config: originalRequest,
            response: { status: 401 }
        };

        // 3. Mock the Refresh API call to return a TRULY unsupported property
        mockedAxios.post.mockResolvedValue({
            data: {
                weirdToken: 'new-valid-token', // This should fail
                refreshToken: 'new-refresh-token'
            }
        });

        // 4. Expect the refresh flow to fail because it can't find 'token'
        await expect(errorInterceptor(error401)).rejects.toThrow('No token returned from refresh endpoint');
    });

    // Define Mock Model outside
    class MockRefreshModel {
        token: string = '';
        refreshToken: string = '';

        fromJSON(json: any) {
            // Simulate transformation: API returns 'access_token', model maps it to 'token'
            this.token = json.access_token;
            this.refreshToken = json.refresh_token;
            return this;
        }
    }

    it('should use refreshModel if provided', async () => {
        // 2. Re-initialize ApiClient with the model
        apiClient = new ApiClient({
            apiBaseUrl: 'https://api.example.com',
            routes: {},
            auth: {
                tokenKey: 'token',
                storage: StorageType.MEMORY,
                refreshUrl: '/auth/refresh',
                refreshModel: MockRefreshModel as any
            }
        }, authManager);

        // 3. Setup initial state
        authManager.setToken('expired-token');
        authManager.setRefreshToken('valid-refresh-token');

        // 4. Mock the 401 error
        // We need to get the interceptor from the NEW apiClient instance.
        // Since mockAxiosInstance is reused, it now has 2 calls to response.use.
        // The last one is from our new apiClient.
        const calls = mockAxiosInstance.interceptors.response.use.mock.calls;
        const errorInterceptor = calls[calls.length - 1][1];

        const originalRequest = {
            headers: {},
            url: '/data',
            method: 'get',
            _retry: false
        };

        const error401 = {
            config: originalRequest,
            response: { status: 401 }
        };

        // 5. Mock the Refresh API call to return snake_case (which the model handles)
        mockedAxios.post.mockResolvedValue({
            data: {
                access_token: 'model-parsed-token',
                refresh_token: 'model-parsed-refresh'
            }
        });

        // Mock retry success
        mockAxiosInstance.request.mockResolvedValue({ status: 200, data: 'success' });

        // 6. Trigger
        await errorInterceptor(error401);

        // 7. Verify that the token from the MODEL was used
        expect(authManager.getToken()).toBe('model-parsed-token');
    });
});

