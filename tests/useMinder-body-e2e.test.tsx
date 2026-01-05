import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { ApiClient } from '../src/core/ApiClient';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';
import axios from 'axios';



// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

describe('useMinder Body Parameter End-to-End', () => {
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
                    createUser: { url: '/api/users', method: 'POST' },
                    updateUser: { url: '/api/users/:id', method: 'PUT' },
                }
            }
        });
    });

    it('should pass body data to POST request (simple case)', async () => {
        mockApiClient.request.mockResolvedValue({ success: true, id: 123 });

        const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
            wrapper: createWrapper(),
        });

        // Simulate end user code
        const userData = {
            firstName: 'Keyur',
            lastName: 'Patel',
            email: 'keyur@example.com'
        };

        await result.current.mutate(userData);

        // Verify body was passed as 2nd argument
        expect(mockApiClient.request).toHaveBeenCalledWith(
            'createUser',
            userData, // This is the body!
            {}, // Empty params object
            expect.objectContaining({
                params: {},
                headers: {}
            })
        );
    });

    it('should pass body data to POST request with query params', async () => {
        mockApiClient.request.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
            wrapper: createWrapper(),
        });

        const userData = { name: 'John' };
        const queryParams = { notify: true, sendEmail: false };

        await act(async () => {
            await result.current.mutate(userData, { params: queryParams });
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'createUser',
            userData, // Body preserved!
            queryParams, // 3rd arg
            expect.objectContaining({
                params: queryParams
            })
        );
    });

    it('should pass body data to PUT request with path params', async () => {
        mockApiClient.request.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMinder('updateUser', { autoFetch: false }), {
            wrapper: createWrapper(),
        });

        const updateData = {
            name: 'Updated Name',
            email: 'updated@example.com'
        };
        const pathParams = { id: 456 };

        await act(async () => {
            await result.current.mutate(updateData, { params: pathParams });
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'updateUser',
            updateData, // Body preserved!
            pathParams,
            expect.objectContaining({
                params: pathParams
            })
        );
    });

    it('should handle complex nested objects in body', async () => {
        mockApiClient.request.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
            wrapper: createWrapper(),
        });

        const complexData = {
            user: {
                profile: {
                    firstName: 'Test',
                    lastName: 'User',
                    metadata: {
                        tags: ['admin', 'superuser'],
                        permissions: {
                            read: true,
                            write: true,
                            delete: false
                        }
                    }
                }
            },
            settings: {
                theme: 'dark',
                language: 'en'
            }
        };

        await act(async () => {
            await result.current.mutate(complexData);
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'createUser',
            complexData, // Complex nested object preserved!
            {}, // Empty params object
            expect.anything()
        );
    });

    it('should pass empty object as body', async () => {
        mockApiClient.request.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
            wrapper: createWrapper(),
        });

        await act(async () => {
            await result.current.mutate({});
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'createUser',
            {}, // Empty object is still a valid body
            {}, // Empty params object
            expect.anything()
        );
    });

    it('should handle null/undefined body correctly', async () => {
        mockApiClient.request.mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMinder('createUser', { autoFetch: false }), {
            wrapper: createWrapper(),
        });

        await act(async () => {
            await result.current.mutate(undefined);
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'createUser',
            undefined, // undefined body (for DELETE, etc.)
            {}, // Empty params object
            expect.anything()
        );
    });
});
