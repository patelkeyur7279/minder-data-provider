import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { CacheManager } from '../src/core/CacheManager';
import { WebSocketManager } from '../src/core/WebSocketManager';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';

// Mock Managers
jest.mock('../src/core/ApiClient');
jest.mock('../src/core/AuthManager');
jest.mock('../src/core/CacheManager');
jest.mock('../src/core/WebSocketManager');

// Mock useMinderContext
jest.mock('../src/core/MinderDataProvider', () => ({
    ...jest.requireActual('../src/core/MinderDataProvider'),
    useMinderContext: jest.fn(),
}));

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useMinder Wrapper Linkage', () => {
    let mockApiClient: jest.Mocked<ApiClient>;
    let mockAuthManager: jest.Mocked<AuthManager>;
    let mockCacheManager: jest.Mocked<CacheManager>;
    let mockWebSocketManager: jest.Mocked<WebSocketManager>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup Mocks
        mockApiClient = {
            request: jest.fn(),
            uploadFile: jest.fn(),
        } as unknown as jest.Mocked<ApiClient>;

        mockAuthManager = {
            setToken: jest.fn(),
            getToken: jest.fn(),
            clearAuth: jest.fn(),
            isAuthenticated: jest.fn(),
            setRefreshToken: jest.fn(),
            getRefreshToken: jest.fn(),
        } as unknown as jest.Mocked<AuthManager>;

        mockCacheManager = {
            invalidateQueries: jest.fn(),
            clearCache: jest.fn(),
            isQueryFresh: jest.fn(),
        } as unknown as jest.Mocked<CacheManager>;

        mockWebSocketManager = {
            connect: jest.fn(),
            disconnect: jest.fn(),
            send: jest.fn(),
            subscribe: jest.fn(),
            isConnected: jest.fn(),
        } as unknown as jest.Mocked<WebSocketManager>;

        // Setup mock context
        (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue({
            apiClient: mockApiClient,
            authManager: mockAuthManager,
            cacheManager: mockCacheManager,
            websocketManager: mockWebSocketManager,
            config: {
                routes: {
                    users: { url: '/users', method: 'GET' },
                    upload: { url: '/upload', method: 'POST' }
                }
            }
        });
    });

    it('should delegate auth methods to AuthManager', async () => {
        const { result } = renderHook(() => useMinder('users'), {
            wrapper: createWrapper(),
        });

        await result.current.auth.setToken('test-token');
        expect(mockAuthManager.setToken).toHaveBeenCalledWith('test-token');

        result.current.auth.getToken();
        expect(mockAuthManager.getToken).toHaveBeenCalled();

        await result.current.auth.clearAuth();
        expect(mockAuthManager.clearAuth).toHaveBeenCalled();
    });

    it('should delegate cache methods to CacheManager', async () => {
        const { result } = renderHook(() => useMinder('users'), {
            wrapper: createWrapper(),
        });

        await result.current.cache.invalidate(['users']);
        expect(mockCacheManager.invalidateQueries).toHaveBeenCalledWith(['users']);

        result.current.cache.clear('users');
        expect(mockCacheManager.clearCache).toHaveBeenCalledWith('users');

        result.current.cache.isQueryFresh('users');
        expect(mockCacheManager.isQueryFresh).toHaveBeenCalledWith('users');
    });

    it('should delegate websocket methods to WebSocketManager', () => {
        const { result } = renderHook(() => useMinder('users'), {
            wrapper: createWrapper(),
        });

        result.current.websocket.connect();
        expect(mockWebSocketManager.connect).toHaveBeenCalled();

        result.current.websocket.send('chat', { msg: 'hello' });
        expect(mockWebSocketManager.send).toHaveBeenCalledWith('chat', { msg: 'hello' });

        const callback = jest.fn();
        result.current.websocket.subscribe('event', callback);
        expect(mockWebSocketManager.subscribe).toHaveBeenCalledWith('event', callback);
    });

    it('should delegate upload methods to ApiClient', async () => {
        const { result } = renderHook(() => useMinder('upload'), {
            wrapper: createWrapper(),
        });

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        await result.current.upload.uploadFile(file);

        expect(mockApiClient.uploadFile).toHaveBeenCalledWith(
            'upload',
            file,
            expect.any(Function) // Progress callback
        );
    });

    it('should delegate CRUD operations to ApiClient', async () => {
        mockApiClient.request.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMinder('users'), {
            wrapper: createWrapper(),
        });

        // Verify operations object exists (it's conditional on context)
        expect(result.current.operations).toBeDefined();

        if (result.current.operations) {
            await result.current.operations.create({ name: 'New' }, { params: { q: 1 } });
            expect(mockApiClient.request).toHaveBeenCalledWith(
                'users',
                { name: 'New' },
                { q: 1 }
            );

            await result.current.operations.update(1, { name: 'Updated' }, { params: { q: 2 } });
            expect(mockApiClient.request).toHaveBeenCalledWith(
                'users',
                { name: 'Updated' },
                { q: 2, id: 1 }
            );

            await result.current.operations.delete(1, { params: { q: 3 } });
            expect(mockApiClient.request).toHaveBeenCalledWith(
                'users',
                undefined,
                { q: 3, id: 1 }
            );
        }
    });
});
