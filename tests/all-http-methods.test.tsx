import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { ApiClient } from '../src/core/ApiClient';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';

// Mock ApiClient
jest.mock('../src/core/ApiClient');

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

describe('All HTTP Methods - All Parameter Types Support', () => {
    let mockApiClient: jest.Mocked<ApiClient>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockApiClient = {
            request: jest.fn(),
        } as unknown as jest.Mocked<ApiClient>;

        (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue({
            apiClient: mockApiClient,
            config: {
                routes: {
                    getUsers: { url: '/api/users', method: 'GET' },
                    getUser: { url: '/api/users/:id', method: 'GET' },
                    createUser: { url: '/api/users', method: 'POST' },
                    updateUser: { url: '/api/users/:id', method: 'PUT' },
                    patchUser: { url: '/api/users/:id', method: 'PATCH' },
                    deleteUser: { url: '/api/users/:id', method: 'DELETE' },
                }
            }
        });
    });

    describe('GET requests', () => {
        it('should support query params', async () => {
            mockApiClient.request.mockResolvedValue({ users: [] });

            const { result } = renderHook(() => useMinder('getUsers', {
                params: { page: 1, limit: 10, filter: 'active' }
            }), {
                wrapper: createWrapper(),
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'getUsers',
                undefined,
                { page: 1, limit: 10, filter: 'active' },
                expect.objectContaining({
                    params: { page: 1, limit: 10, filter: 'active' }
                })
            );
        });

        it('should support path params + query params', async () => {
            mockApiClient.request.mockResolvedValue({ user: {} });

            const { result } = renderHook(() => useMinder('getUser', {
                params: { id: 123, include: 'profile' }
            }), {
                wrapper: createWrapper(),
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'getUser',
                undefined,
                { id: 123, include: 'profile' },
                expect.objectContaining({
                    params: { id: 123, include: 'profile' }
                })
            );
        });

        it('should support custom headers', async () => {
            mockApiClient.request.mockResolvedValue({ users: [] });

            const { result } = renderHook(() => useMinder('getUsers', {
                headers: { 'X-Custom-Header': 'test-value' }
            }), {
                wrapper: createWrapper(),
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'getUsers',
                undefined,
                undefined,
                expect.objectContaining({
                    headers: { 'X-Custom-Header': 'test-value' }
                })
            );
        });
    });

    describe('POST requests', () => {
        it('should support body only', async () => {
            mockApiClient.request.mockResolvedValue({ success: true, id: 1 });

            const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'John Doe', email: 'john@example.com' };
            await result.current.mutate(body);

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'createUser',
                body,
                {},
                expect.objectContaining({
                    params: {},
                    headers: {}
                })
            );
        });

        it('should support body + query params', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'John Doe' };
            const params = { notify: true, sendEmail: true };

            await result.current.mutate(body, { params });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'createUser',
                body,
                params,
                expect.objectContaining({
                    params
                })
            );
        });

        it('should support body + headers', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'John Doe' };
            const headers = { 'X-Request-ID': 'abc123' };

            await result.current.mutate(body, { headers });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'createUser',
                body,
                {},
                expect.objectContaining({
                    headers
                })
            );
        });

        it('should support body + query params + headers', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'John Doe' };
            const params = { notify: true };
            const headers = { 'X-Request-ID': 'abc123' };

            await result.current.mutate(body, { params, headers });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'createUser',
                body,
                params,
                expect.objectContaining({
                    params,
                    headers
                })
            );
        });
    });

    describe('PUT requests', () => {
        it('should support body + path params', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('updateUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'Updated Name' };
            const params = { id: 456 };

            await result.current.mutate(body, { params });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'updateUser',
                body,
                params,
                expect.objectContaining({
                    params
                })
            );
        });

        it('should support body + path params + query params', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('updateUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'Updated Name' };
            const params = { id: 456, notify: true, version: 'v2' };

            await result.current.mutate(body, { params });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'updateUser',
                body,
                params,
                expect.objectContaining({
                    params
                })
            );
        });

        it('should support body + path params + headers', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('updateUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const body = { name: 'Updated Name' };
            const params = { id: 456 };
            const headers = { 'If-Match': 'etag123' };

            await result.current.mutate(body, { params, headers });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'updateUser',
                body,
                params,
                expect.objectContaining({
                    params,
                    headers
                })
            );
        });
    });

    describe('PATCH requests', () => {
        it('should support partial body + path params', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('patchUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const partialBody = { email: 'newemail@example.com' };
            const params = { id: 789 };

            await result.current.mutate(partialBody, { params });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'patchUser',
                partialBody,
                params,
                expect.objectContaining({
                    params
                })
            );
        });

        it('should support all param types combined', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('patchUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const partialBody = { email: 'newemail@example.com' };
            const params = { id: 789, validateEmail: true };
            const headers = { 'X-Patch-Version': '1' };

            await result.current.mutate(partialBody, { params, headers });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'patchUser',
                partialBody,
                params,
                expect.objectContaining({
                    params,
                    headers
                })
            );
        });
    });

    describe('DELETE requests', () => {
        it('should support path params only', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('deleteUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const params = { id: 999 };

            await result.current.mutate(undefined, { params });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'deleteUser',
                undefined,
                params,
                expect.objectContaining({
                    params
                })
            );
        });

        it('should support path params + query params', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('deleteUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const params = { id: 999, soft: true, reason: 'inactive' };

            await result.current.mutate(undefined, { params });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'deleteUser',
                undefined,
                params,
                expect.objectContaining({
                    params
                })
            );
        });

        it('should support path params + headers', async () => {
            mockApiClient.request.mockResolvedValue({ success: true });

            const { result } = renderHook(() => useMinder('deleteUser', { autoFetch: false }), {
                wrapper: createWrapper(),
            });

            const params = { id: 999 };
            const headers = { 'X-Delete-Reason': 'user-request' };

            await result.current.mutate(undefined, { params, headers });

            expect(mockApiClient.request).toHaveBeenCalledWith(
                'deleteUser',
                undefined,
                params,
                expect.objectContaining({
                    params,
                    headers
                })
            );
        });
    });
});
