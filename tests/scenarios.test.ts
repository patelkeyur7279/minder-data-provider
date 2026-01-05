import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { MinderConfig } from '../src/core/types';
import { StorageType, HttpMethod } from '../src/constants/enums';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Comprehensive Scenarios', () => {
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

        mockedAxios.create.mockReturnValue(mockAxiosInstance);

        // Default Config
        config = {
            apiBaseUrl: 'https://api.test.com',
            auth: {
                tokenKey: 'auth_token',
                storage: StorageType.MEMORY,
            },
            routes: {
                getData: { method: HttpMethod.GET, url: '/data' },
            },
            performance: {
                deduplication: true,
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    describe('1. Authentication Storage Types', () => {
        it('should work with LocalStorage', () => {
            const localConfig = { ...config, auth: { ...config.auth, storage: StorageType.LOCAL_STORAGE } };
            const manager = new AuthManager(localConfig.auth);

            manager.setToken('local-token');
            expect(localStorage.getItem('auth_token')).toBe('local-token');
            expect(manager.getToken()).toBe('local-token');

            manager.clearAuth();
            expect(localStorage.getItem('auth_token')).toBeNull();
        });

        it('should work with SessionStorage', () => {
            const sessionConfig = { ...config, auth: { ...config.auth, storage: StorageType.SESSION_STORAGE } };
            const manager = new AuthManager(sessionConfig.auth);

            manager.setToken('session-token');
            expect(sessionStorage.getItem('auth_token')).toBe('session-token');
            expect(manager.getToken()).toBe('session-token');

            manager.clearAuth();
            expect(sessionStorage.getItem('auth_token')).toBeNull();
        });

        it('should work with Memory Storage', () => {
            const memoryConfig = { ...config, auth: { ...config.auth, storage: StorageType.MEMORY } };
            const manager = new AuthManager(memoryConfig.auth);

            manager.setToken('memory-token');
            expect(manager.getToken()).toBe('memory-token');

            manager.clearAuth();
            expect(manager.getToken()).toBeNull();
        });
    });

    describe('2. Concurrency & Performance', () => {
        it('should deduplicate simultaneous GET requests', async () => {
            authManager = new AuthManager(config.auth);
            apiClient = new ApiClient(config, authManager);

            // Mock successful response
            mockAxiosInstance.request.mockResolvedValue({ data: { id: 1 } });

            // Fire 3 requests simultaneously
            const req1 = apiClient.request('getData');
            const req2 = apiClient.request('getData');
            const req3 = apiClient.request('getData');

            await Promise.all([req1, req2, req3]);

            // Should only call axios once due to deduplication
            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
        });

        it('should NOT deduplicate if disabled', async () => {
            const noDedupConfig = { ...config, performance: { deduplication: false } };
            authManager = new AuthManager(noDedupConfig.auth);
            apiClient = new ApiClient(noDedupConfig, authManager);

            mockAxiosInstance.request.mockResolvedValue({ data: { id: 1 } });

            const req1 = apiClient.request('getData');
            const req2 = apiClient.request('getData');

            await Promise.all([req1, req2]);

            expect(mockAxiosInstance.request).toHaveBeenCalledTimes(2);
        });
    });

    describe('3. Security', () => {
        it('should apply security headers', async () => {
            // Re-instantiate to trigger create
            authManager = new AuthManager(config.auth);

            const secureConfig = {
                ...config,
                security: {
                    headers: { 'X-Custom-Security': 'secure' }
                }
            };
            apiClient = new ApiClient(secureConfig, authManager);

            const createConfig = mockedAxios.create.mock.calls[mockedAxios.create.mock.calls.length - 1][0];
            expect(createConfig.headers).toMatchObject({
                'X-Custom-Security': 'secure'
            });
        });
    });
});
