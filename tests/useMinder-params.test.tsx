
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
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

describe('useMinder Params Passing', () => {
    let mockApiClient: jest.Mocked<ApiClient>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockApiClient = {
            request: jest.fn(),
        } as unknown as jest.Mocked<ApiClient>;

        // Setup mock context
        (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue({
            apiClient: mockApiClient,
            config: {
                routes: {
                    users: { url: '/users', method: 'GET' }
                }
            }
        });
    });

    it('should pass params to ApiClient.request as the 4th argument', async () => {
        mockApiClient.request.mockResolvedValue({
            success: true,
            data: { id: 1 },
        });

        const params = { search: 'test', limit: 10 };

        const { result } = renderHook(() => useMinder('users', { params }), {
            wrapper: createWrapper(),
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // This expectation is what we want to achieve:
        // request(route, data, params, options)
        // 3rd arg is for URL path replacement (e.g. /users/:id)
        // 4th arg is for Axios config, which includes 'params' for query string
        expect(mockApiClient.request).toHaveBeenCalledWith(
            'users',
            undefined, // data (body)
            params,    // 3rd arg: path params (current behavior)
            expect.objectContaining({ params }) // 4th arg: axios config with params (DESIRED behavior)
        );
    });

    it('should pass params to ApiClient.request during mutation', async () => {
        mockApiClient.request.mockResolvedValue({
            success: true,
            data: { id: 1 },
        });

        const mutationParams = { type: 'admin' };
        const { result } = renderHook(() => useMinder('users', { params: mutationParams }), {
            wrapper: createWrapper(),
        });

        await result.current.mutate({ name: 'New User' });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'users',
            { name: 'New User' },
            expect.objectContaining(mutationParams), // 3rd arg
            expect.objectContaining({ params: mutationParams }) // 4th arg
        );
    });
});
