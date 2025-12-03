/**
 * Authentication Debug Test
 * 
 * This test verifies the authentication flow to identify any bugs:
 * 1. Does setToken() store the token correctly?
 * 2. Does isAuthenticated() return the correct value?
 * 3. Is there a timing issue between setting and checking?
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MinderDataProvider } from '../src/core/MinderDataProvider';
import { useAuth } from '../src/hooks/index';
import { useMinder } from '../src/hooks/useMinder';
import { globalAuthManager } from '../src/auth/GlobalAuthManager';

// Test configuration
const testConfig = {
    apiBaseUrl: 'https://api.test.com',
    routes: {
        posts: { method: 'GET' as const, url: '/posts' },
    },
    auth: {
        tokenKey: 'test_token',
        storage: 'localStorage' as const,
    },
};

describe('AUTH DEBUG: setToken & isAuthenticated Flow', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        // Clear all storage before each test
        localStorage.clear();
        sessionStorage.clear();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
    });

    describe('TEST 1: Direct AuthManager Usage', () => {
        it('should store token and return authenticated', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            console.log('🔍 BEFORE setToken:');
            console.log('  isAuthenticated:', result.current.isAuthenticated());
            console.log('  getToken:', result.current.getToken());

            // Set token
            await act(async () => {
                result.current.setToken('test-token-123');
            });

            console.log('\n🔍 AFTER setToken:');
            console.log('  isAuthenticated:', result.current.isAuthenticated());
            console.log('  getToken:', result.current.getToken());
            console.log('  localStorage:', localStorage.getItem('test_token'));

            // Verify token is stored
            expect(result.current.getToken()).toBe('test-token-123');
            expect(localStorage.getItem('test_token')).toBe('test-token-123');

            // THIS IS THE KEY TEST - does isAuthenticated work?
            expect(result.current.isAuthenticated()).toBe(true);
        });

        it('should handle JWT tokens correctly', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            // Create a valid JWT (expires in 1 hour)
            const exp = Math.floor(Date.now() / 1000) + 3600;
            const payload = Buffer.from(JSON.stringify({ exp, userId: '123' })).toString('base64');
            const jwt = `header.${payload}.signature`;

            console.log('🔍 Testing JWT token:');
            console.log('  Token:', jwt);

            await act(async () => {
                result.current.setToken(jwt);
            });

            console.log('  Stored:', result.current.getToken());
            console.log('  isAuthenticated:', result.current.isAuthenticated());

            expect(result.current.getToken()).toBe(jwt);
            expect(result.current.isAuthenticated()).toBe(true);
        });

        it('should handle expired JWT tokens', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            // Create an expired JWT (expired 1 hour ago)
            const exp = Math.floor(Date.now() / 1000) - 3600;
            const payload = Buffer.from(JSON.stringify({ exp, userId: '123' })).toString('base64');
            const jwt = `header.${payload}.signature`;

            console.log('🔍 Testing EXPIRED JWT token:');

            await act(async () => {
                result.current.setToken(jwt);
            });

            console.log('  Stored:', result.current.getToken());
            console.log('  isAuthenticated:', result.current.isAuthenticated());

            expect(result.current.getToken()).toBe(jwt);
            // Expired token should return false
            expect(result.current.isAuthenticated()).toBe(false);
        });
    });

    describe('TEST 2: useMinder Hook Integration', () => {
        it('should work with useMinder auth methods', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useMinder('posts'), { wrapper });

            console.log('🔍 useMinder BEFORE setToken:');
            console.log('  isAuthenticated:', result.current.auth.isAuthenticated());
            console.log('  getToken:', result.current.auth.getToken());

            await act(async () => {
                await result.current.auth.setToken('minder-token-456');
            });

            console.log('\n🔍 useMinder AFTER setToken:');
            console.log('  isAuthenticated:', result.current.auth.isAuthenticated());
            console.log('  getToken:', result.current.auth.getToken());

            expect(result.current.auth.getToken()).toBe('minder-token-456');
            expect(result.current.auth.isAuthenticated()).toBe(true);
        });
    });

    describe('TEST 3: GlobalAuthManager (Without Provider)', () => {
        beforeEach(() => {
            // Reset global auth manager
            globalAuthManager.clearAuth();
        });

        it('should work without MinderDataProvider', async () => {
            console.log('🔍 GlobalAuth BEFORE setToken:');
            console.log('  isAuthenticated:', globalAuthManager.isAuthenticated());
            console.log('  getToken:', globalAuthManager.getToken());

            await globalAuthManager.setToken('global-token-789');

            console.log('\n🔍 GlobalAuth AFTER setToken:');
            console.log('  isAuthenticated:', globalAuthManager.isAuthenticated());
            console.log('  getToken:', globalAuthManager.getToken());
            console.log('  localStorage:', localStorage.getItem('minder_auth_token'));

            expect(globalAuthManager.getToken()).toBe('global-token-789');
            expect(globalAuthManager.isAuthenticated()).toBe(true);
        });

        // Skip: Requires --experimental-vm-modules flag for Jest
        // Dynamic imports work correctly in production
        it.skip('should restore token on page refresh', async () => {
            // Simulate setting token
            await globalAuthManager.setToken('persistent-token');
            expect(globalAuthManager.isAuthenticated()).toBe(true);

            // Simulate page refresh by creating a new instance
            const { GlobalAuthManager } = await import('../src/auth/GlobalAuthManager');
            const newManager = new GlobalAuthManager();

            console.log('🔍 After "page refresh":');
            console.log('  isAuthenticated:', newManager.isAuthenticated());
            console.log('  getToken:', newManager.getToken());

            // Should restore from localStorage
            expect(newManager.getToken()).toBe('persistent-token');
            expect(newManager.isAuthenticated()).toBe(true);
        });
    });

    describe('TEST 4: Timing & Synchronization', () => {
        it('should be immediately authenticated after setToken (sync)', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            await act(async () => {
                result.current.setToken('immediate-token');
                // Check IMMEDIATELY after setting
                console.log('🔍 IMMEDIATE check:', result.current.isAuthenticated());
                expect(result.current.isAuthenticated()).toBe(true);
            });
        });

        it('should synchronize between multiple hook instances', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result: auth1 } = renderHook(() => useAuth(), { wrapper });
            const { result: auth2 } = renderHook(() => useAuth(), { wrapper });

            console.log('🔍 Before setToken:');
            console.log('  auth1.isAuthenticated:', auth1.current.isAuthenticated());
            console.log('  auth2.isAuthenticated:', auth2.current.isAuthenticated());

            // Set token in first instance
            await act(async () => {
                auth1.current.setToken('sync-token');
            });

            console.log('\n🔍 After setToken in auth1:');
            console.log('  auth1.isAuthenticated:', auth1.current.isAuthenticated());
            console.log('  auth2.isAuthenticated:', auth2.current.isAuthenticated());

            // Both should be authenticated
            expect(auth1.current.isAuthenticated()).toBe(true);
            expect(auth2.current.isAuthenticated()).toBe(true);
        });
    });

    describe('TEST 5: Common Bug Scenarios', () => {
        it('BUG CHECK: setToken called but isAuthenticated returns false', async () => {
            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            // This is the exact scenario the user described
            await act(async () => {
                result.current.setToken('bug-test-token');
            });

            const isAuth = result.current.isAuthenticated();
            const token = result.current.getToken();

            console.log('🐛 BUG CHECK:');
            console.log('  Token set:', 'bug-test-token');
            console.log('  Token retrieved:', token);
            console.log('  isAuthenticated:', isAuth);
            console.log('  Expected: true, Got:', isAuth);

            if (!isAuth) {
                console.error('❌ BUG FOUND: Token is set but isAuthenticated returns false!');
            } else {
                console.log('✅ No bug: isAuthenticated works correctly');
            }

            expect(token).toBe('bug-test-token');
            expect(isAuth).toBe(true);
        });

        it('BUG CHECK: Token in storage but isAuthenticated returns false', async () => {
            // Manually set token in localStorage (simulating what might happen in a real app)
            localStorage.setItem('test_token', 'manual-token');

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={testConfig}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            console.log('🐛 BUG CHECK (manual storage):');
            console.log('  Token in localStorage:', localStorage.getItem('test_token'));
            console.log('  getToken:', result.current.getToken());
            console.log('  isAuthenticated:', result.current.isAuthenticated());

            // Should read from storage
            expect(result.current.getToken()).toBe('manual-token');
            expect(result.current.isAuthenticated()).toBe(true);
        });
    });
});
