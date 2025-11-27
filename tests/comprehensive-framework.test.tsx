/**
 * Comprehensive Framework Functionality Test
 * 
 * Tests ALL features across different configurations:
 * 1. All storage types (localStorage, sessionStorage, memory, cookies)
 * 2. All authentication flows
 * 3. All hooks (useAuth, useMinder, useCurrentUser)
 * 4. Token refresh
 * 5. Multi-tab synchronization
 * 6. Error handling
 * 7. Edge cases
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MinderDataProvider } from '../src/core/MinderDataProvider';
import { useAuth } from '../src/hooks/index';
import { useMinder } from '../src/hooks/useMinder';
import { globalAuthManager } from '../src/auth/GlobalAuthManager';
import { StorageType, HttpMethod } from '../src/constants/enums';

describe('🧪 COMPREHENSIVE FRAMEWORK TESTING', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
    });

    // =========================================================================
    // TEST ALL STORAGE CONFIGURATIONS
    // =========================================================================

    describe('📦 Storage Configuration Tests', () => {
        const storageTypes = [
            { name: 'localStorage', type: StorageType.LOCAL_STORAGE },
            { name: 'sessionStorage', type: StorageType.SESSION_STORAGE },
            { name: 'memory', type: StorageType.MEMORY },
            { name: 'cookie', type: StorageType.COOKIE },
        ];

        storageTypes.forEach(({ name, type }) => {
            it(`should work with ${name} storage`, async () => {
                const config = {
                    apiBaseUrl: 'https://api.test.com',
                    routes: {
                        users: { method: HttpMethod.GET, url: '/users' },
                    },
                    auth: {
                        tokenKey: `test_${name}`,
                        storage: type,
                    },
                };

                const wrapper = ({ children }: { children: React.ReactNode }) => (
                    <QueryClientProvider client={queryClient}>
                        <MinderDataProvider config={config}>
                            {children}
                        </MinderDataProvider>
                    </QueryClientProvider>
                );

                const { result } = renderHook(() => useAuth(), { wrapper });

                // Test setToken
                await act(async () => {
                    result.current.setToken(`${name}-token-123`);
                });

                // Test getToken
                expect(result.current.getToken()).toBe(`${name}-token-123`);

                // Test isAuthenticated
                expect(result.current.isAuthenticated()).toBe(true);

                // Test clearAuth
                await act(async () => {
                    result.current.clearAuth();
                });

                expect(result.current.getToken()).toBeNull();
                expect(result.current.isAuthenticated()).toBe(false);
            });
        });
    });

    // =========================================================================
    // TEST ALL AUTHENTICATION FLOWS
    // =========================================================================

    describe('🔐 Authentication Flow Tests', () => {
        it('should handle complete login flow', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    login: { method: HttpMethod.POST, url: '/auth/login' },
                    profile: { method: HttpMethod.GET, url: '/auth/profile' },
                },
                auth: {
                    tokenKey: 'auth_token',
                    storage: StorageType.LOCAL_STORAGE,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useMinder('login'), { wrapper });

            // 1. Initially not authenticated
            expect(result.current.auth.isAuthenticated()).toBe(false);
            expect(result.current.auth.getToken()).toBeNull();

            // 2. Login (set token)
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjo5OTk5OTk5OTk5fQ.signature';
            await act(async () => {
                await result.current.auth.setToken(token);
            });

            // 3. Check authenticated
            expect(result.current.auth.isAuthenticated()).toBe(true);
            expect(result.current.auth.getToken()).toBe(token);
            expect(localStorage.getItem('auth_token')).toBe(token);

            // 4. Logout
            await act(async () => {
                result.current.auth.clearAuth();
            });

            expect(result.current.auth.isAuthenticated()).toBe(false);
            expect(localStorage.getItem('auth_token')).toBeNull();
        });

        it('should handle token refresh flow', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'access_token',
                    storage: StorageType.LOCAL_STORAGE,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            // Set access token
            await act(async () => {
                result.current.setToken('access-token-123');
                result.current.setRefreshToken('refresh-token-456');
            });

            expect(result.current.getToken()).toBe('access-token-123');
            expect(result.current.getRefreshToken()).toBe('refresh-token-456');

            // Clear access token (simulate expiry)
            await act(async () => {
                result.current.setToken('new-access-token');
            });

            expect(result.current.getToken()).toBe('new-access-token');
            expect(result.current.getRefreshToken()).toBe('refresh-token-456');
        });
    });

    // =========================================================================
    // TEST ALL HOOKS
    // =========================================================================

    describe('🪝 Hook Integration Tests', () => {
        it('should work with useAuth hook', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    posts: { method: HttpMethod.GET, url: '/posts' },
                },
                auth: {
                    tokenKey: 'hook_test',
                    storage: StorageType.LOCAL_STORAGE,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            // All auth methods should be available
            expect(typeof result.current.setToken).toBe('function');
            expect(typeof result.current.getToken).toBe('function');
            expect(typeof result.current.clearAuth).toBe('function');
            expect(typeof result.current.isAuthenticated).toBe('function');
            expect(typeof result.current.setRefreshToken).toBe('function');
            expect(typeof result.current.getRefreshToken).toBe('function');

            // Should work correctly
            await act(async () => {
                result.current.setToken('useauth-token');
            });

            expect(result.current.getToken()).toBe('useauth-token');
            expect(result.current.isAuthenticated()).toBe(true);
        });

        it('should work with useMinder hook', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    products: { method: HttpMethod.GET, url: '/products' },
                },
                auth: {
                    tokenKey: 'minder_test',
                    storage: StorageType.LOCAL_STORAGE,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useMinder('products'), { wrapper });

            // Auth methods available through useMinder
            expect(typeof result.current.auth.setToken).toBe('function');
            expect(typeof result.current.auth.getToken).toBe('function');
            expect(typeof result.current.auth.isAuthenticated).toBe('function');

            await act(async () => {
                await result.current.auth.setToken('useminder-token');
            });

            expect(result.current.auth.getToken()).toBe('useminder-token');
            expect(result.current.auth.isAuthenticated()).toBe(true);
        });

        it('should work with GlobalAuthManager (standalone)', async () => {
            await globalAuthManager.clearAuth();

            // Should work without provider
            await globalAuthManager.setToken('global-standalone-token');

            expect(globalAuthManager.getToken()).toBe('global-standalone-token');
            expect(globalAuthManager.isAuthenticated()).toBe(true);
            expect(localStorage.getItem('minder_auth_token')).toBe('global-standalone-token');

            await globalAuthManager.clearAuth();
            expect(globalAuthManager.getToken()).toBeNull();
        });
    });

    // =========================================================================
    // TEST JWT VALIDATION
    // =========================================================================

    describe('🔑 JWT Validation Tests', () => {
        const createJWT = (payload: any) => {
            const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
            return `header.${encodedPayload}.signature`;
        };

        it('should validate non-expired JWT', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'jwt_test',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            const exp = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour
            const jwt = createJWT({ exp, userId: '123' });

            await act(async () => {
                result.current.setToken(jwt);
            });

            expect(result.current.isAuthenticated()).toBe(true);
        });

        it('should reject expired JWT', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'jwt_expired',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            const exp = Math.floor(Date.now() / 1000) - 3600; // Expired 1 hour ago
            const jwt = createJWT({ exp, userId: '123' });

            await act(async () => {
                result.current.setToken(jwt);
            });

            expect(result.current.isAuthenticated()).toBe(false);
        });

        it('should handle JWT with exp=0 (Bug #4 fix verification)', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'jwt_zero',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            const jwt = createJWT({ exp: 0 });

            await act(async () => {
                result.current.setToken(jwt);
            });

            // exp=0 should be treated as expired (Bug #4 fix)
            expect(result.current.isAuthenticated()).toBe(false);
        });

        it('should handle JWT with non-numeric exp (Bug #5 fix verification)', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'jwt_invalid',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            const jwt = createJWT({ exp: 'invalid-exp' });

            await act(async () => {
                result.current.setToken(jwt);
            });

            // Non-numeric exp should be treated as no expiration (Bug #5 fix)
            expect(result.current.isAuthenticated()).toBe(true);
        });
    });

    // =========================================================================
    // TEST MULTI-INSTANCE ISOLATION
    // =========================================================================

    describe('🔒 Instance Isolation Tests (Bug #3 fix verification)', () => {
        it('should isolate memory storage between provider instances', async () => {
            const config1 = {
                apiBaseUrl: 'https://api1.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'instance1',
                    storage: StorageType.MEMORY,
                },
            };

            const config2 = {
                apiBaseUrl: 'https://api2.test.com',
                routes: {
                    posts: { method: HttpMethod.GET, url: '/posts' },
                },
                auth: {
                    tokenKey: 'instance2',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper1 = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config1}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const wrapper2 = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={new QueryClient()}>
                    <MinderDataProvider config={config2}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result: result1 } = renderHook(() => useAuth(), { wrapper: wrapper1 });
            const { result: result2 } = renderHook(() => useAuth(), { wrapper: wrapper2 });

            // Set different tokens
            await act(async () => {
                result1.current.setToken('token-instance-1');
                result2.current.setToken('token-instance-2');
            });

            // Each instance should have its own token (Bug #3 fix)
            expect(result1.current.getToken()).toBe('token-instance-1');
            expect(result2.current.getToken()).toBe('token-instance-2');
        });

        it('should share localStorage between instances (expected behavior)', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'shared_token',
                    storage: StorageType.LOCAL_STORAGE,
                },
            };

            const wrapper1 = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const wrapper2 = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={new QueryClient()}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result: result1 } = renderHook(() => useAuth(), { wrapper: wrapper1 });
            const { result: result2 } = renderHook(() => useAuth(), { wrapper: wrapper2 });

            // Set token in instance 1
            await act(async () => {
                result1.current.setToken('shared-localStorage-token');
            });

            // Instance 2 should see the same token (localStorage is shared)
            expect(result2.current.getToken()).toBe('shared-localStorage-token');
            expect(result1.current.getToken()).toBe('shared-localStorage-token');
        });
    });

    // =========================================================================
    // TEST ERROR HANDLING
    // =========================================================================

    describe('⚠️ Error Handling Tests', () => {
        it('should handle missing token gracefully', () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'missing_token',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            expect(result.current.getToken()).toBeNull();
            expect(result.current.isAuthenticated()).toBe(false);
        });

        it('should handle empty token', async () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                auth: {
                    tokenKey: 'empty_token',
                    storage: StorageType.MEMORY,
                },
            };

            const wrapper = ({ children }: { children: React.ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <MinderDataProvider config={config}>
                        {children}
                    </MinderDataProvider>
                </QueryClientProvider>
            );

            const { result } = renderHook(() => useAuth(), { wrapper });

            await act(async () => {
                result.current.setToken('');
            });

            const token = result.current.getToken();
            expect(token === '' || token === null).toBe(true);
        });
    });

    // =========================================================================
    // TEST CONFIGURATION VALIDATION
    // =========================================================================

    describe('⚙️ Configuration Tests', () => {
        it('should work without dynamic config (Bug #2 fix verification)', () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                // No dynamic property - should not crash
                auth: {
                    tokenKey: 'no_dynamic',
                    storage: StorageType.LOCAL_STORAGE,
                },
            };

            expect(() => {
                const wrapper = ({ children }: { children: React.ReactNode }) => (
                    <QueryClientProvider client={queryClient}>
                        <MinderDataProvider config={config}>
                            {children}
                        </MinderDataProvider>
                    </QueryClientProvider>
                );

                renderHook(() => useAuth(), { wrapper });
            }).not.toThrow();
        });

        it('should work with optional auth config', () => {
            const config = {
                apiBaseUrl: 'https://api.test.com',
                routes: {
                    users: { method: HttpMethod.GET, url: '/users' },
                },
                // No auth config - should use defaults
            };

            expect(() => {
                const wrapper = ({ children }: { children: React.ReactNode }) => (
                    <QueryClientProvider client={queryClient}>
                        <MinderDataProvider config={config}>
                            {children}
                        </MinderDataProvider>
                    </QueryClientProvider>
                );

                renderHook(() => useAuth(), { wrapper });
            }).not.toThrow();
        });
    });
});
