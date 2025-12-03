import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MinderDataProvider, useMinder } from '../src/index';
import { configureMinder } from '../src/config/index';
import { AuthManager } from '../src/auth/index';
import { ProxyManager } from '../src/core/ProxyManager';
import { HttpMethod, StorageType } from '../src/constants/enums';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock components
const UserProfile = () => {
    const { data, loading, error, mutate } = useMinder('getUser', { staleTime: 5000, queryKey: ['getUser'] });

    if (loading) return <div data-testid="loading">Loading...</div>;
    if (error) return <div data-testid="error">{error.message}</div>;

    return (
        <div>
            <div data-testid="user-name">{data?.name}</div>
            <button data-testid="refresh-btn" onClick={() => mutate()}>Refresh</button>
        </div>
    );
};

describe('Comprehensive Integration Verification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();

        // Simulate logged-in user via LocalStorage
        localStorage.setItem('auth_token', 'fake-jwt-token');

        // Mock axios create
        mockedAxios.create.mockReturnThis();
        mockedAxios.interceptors = {
            request: { use: jest.fn((success) => success) },
            response: { use: jest.fn((success) => success) }
        } as any;
    });

    it('should integrate Auth, Proxy, and Cache features correctly', async () => {
        // 1. Configure Minder with ALL features
        const config = {
            apiBaseUrl: 'https://api.example.com',
            routes: {
                getUser: {
                    url: '/users/me',
                    method: HttpMethod.GET,
                    cache: true, // Enable Cache
                    cacheDuration: 5000
                }
            },
            auth: {
                enabled: true,
                tokenKey: 'auth_token',
                storage: StorageType.LOCAL_STORAGE // Use LocalStorage
            },
            corsHelper: {
                enabled: true,
                proxy: '/api/proxy', // Enable Proxy
                origin: 'http://localhost:3000',
                credentials: true
            }
        };

        // Mock API Response with dynamic logic
        let callCount = 0;
        mockedAxios.request.mockImplementation(async (config) => {
            callCount++;
            // Return 'Jane Doe' for mutation/refetch (calls > 2 to handle double-mount)
            if (callCount > 2) {
                return {
                    data: { name: 'Jane Doe' },
                    status: 200,
                    config: {}
                };
            }
            // Return 'John Doe' for initial fetch(es)
            return {
                data: { name: 'John Doe' },
                status: 200,
                config: {}
            };
        });

        // 2. Render Provider (No authManager prop needed)
        render(
            <MinderDataProvider config={config}>
                <UserProfile />
            </MinderDataProvider>
        );

        // 3. Verify Loading State
        expect(screen.getByTestId('loading')).toBeInTheDocument();

        // 4. Verify Data Fetch & Proxy Usage
        await waitFor(() => {
            expect(screen.getByTestId('user-name')).toHaveTextContent('John Doe');
        });

        // Verify Proxy URL rewriting
        expect(mockedAxios.request).toHaveBeenCalledWith(expect.objectContaining({
            url: '/api/proxy/users/me', // Should be rewritten
            headers: expect.objectContaining({
                'X-Target-URL': 'https://api.example.com' // Proxy header check
            })
        }));

        // 5. Verify Mutation (Invalidates Cache & Refetches)
        const refreshBtn = screen.getAllByTestId('refresh-btn')[0];

        await act(async () => {
            refreshBtn.click();
        });

        await waitFor(() => {
            expect(screen.getAllByTestId('user-name')[0]).toHaveTextContent('Jane Doe');
        });

        // Should have called API again (Initial 2 + Mutation 1 = 3)
        expect(mockedAxios.request).toHaveBeenCalledTimes(3);
    });
});
