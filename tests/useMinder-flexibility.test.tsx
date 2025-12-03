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

describe('useMinder Flexibility', () => {
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

    it('should pass custom headers to ApiClient.request', async () => {
        mockApiClient.request.mockResolvedValue({
            success: true,
            data: { id: 1 },
        });

        const headers = { 'X-Custom-Header': 'test-value' };

        const { result } = renderHook(() => useMinder('users', { headers }), {
            wrapper: createWrapper(),
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'users',
            undefined,
            undefined,
            expect.objectContaining({
                headers: expect.objectContaining(headers)
            })
        );
    });

    it('should pass axiosConfig to ApiClient.request', async () => {
        mockApiClient.request.mockResolvedValue({
            success: true,
            data: { id: 1 },
        });

        // @ts-ignore - axiosConfig not yet in type definition
        const axiosConfig = { responseType: 'blob', timeout: 5000 };

        // @ts-ignore
        const { result } = renderHook(() => useMinder('users', { axiosConfig }), {
            wrapper: createWrapper(),
        });

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(mockApiClient.request).toHaveBeenCalledWith(
            'users',
            undefined,
            undefined,
            expect.objectContaining({
                responseType: 'blob',
                timeout: 5000
            })
        );
    });
});
