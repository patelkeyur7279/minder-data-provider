/**
 * D2 regression suite — `useAuth` consolidation (2.2.0 BREAKING).
 *
 * Before this fix, `useAuth` resolved to two incompatible implementations
 * depending on which subpath it was imported from:
 *   - the capability-contract hook (root, /web, /nextjs, /electron)
 *   - a legacy client-side token store (/auth, /native, /expo)
 *
 * This suite proves:
 *   1. `useAuth` is now the SAME capability-contract hook on every subpath
 *      (identity-checked, not just shape-checked).
 *   2. The legacy token store is exported under its honest name,
 *      `useAuthToken`, with its shape unchanged.
 *   3. The legacy shape is no longer reachable under the name `useAuth`
 *      from any subpath.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MinderDataProvider } from '../src/core/MinderDataProvider';

import { useAuth as useAuthFromAuthSubpath, useAuthToken as useAuthTokenFromAuthSubpath } from '../src/auth/index';
import { useAuth as useAuthFromContracts } from '../src/hooks/contracts';
import { useAuth as useAuthFromRoot } from '../src/index';
import { useAuth as useAuthFromNative } from '../src/platforms/native';
import { useAuth as useAuthFromWeb } from '../src/platforms/web';
import { useAuthToken as useAuthTokenFromHooks } from '../src/hooks/index';

const testConfig = {
  apiBaseUrl: 'https://api.test.com',
  routes: {
    posts: { method: 'GET' as const, url: '/posts' },
  },
  auth: {
    tokenKey: 'use-auth-consolidation-test-token',
    storage: 'localStorage' as const,
  },
};

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

function ProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MinderDataProvider config={testConfig}>{children}</MinderDataProvider>
    </QueryClientProvider>
  );
}

describe('canonical useAuth is the contract hook on every subpath', () => {
  it('useAuth imported from ../src/auth/index === useAuth imported from ../src/hooks/contracts', () => {
    expect(useAuthFromAuthSubpath).toBe(useAuthFromContracts);
  });

  it('useAuth imported from ../src/index === useAuth imported from ../src/hooks/contracts', () => {
    expect(useAuthFromRoot).toBe(useAuthFromContracts);
  });

  it('useAuth imported from ../src/platforms/native === useAuth imported from ../src/hooks/contracts', () => {
    expect(useAuthFromNative).toBe(useAuthFromContracts);
  });

  it('useAuth imported from ../src/platforms/web === useAuth imported from ../src/hooks/contracts', () => {
    expect(useAuthFromWeb).toBe(useAuthFromContracts);
  });

  it('with NO provider registered, useAuth() from ../src/auth/index returns ready:false + NO_PROVIDER_FOR_CAPABILITY and exposes no token-store keys', async () => {
    const { result } = renderHook(() => useAuthFromAuthSubpath());

    await waitFor(() => expect(result.current.ready).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.code).toBe('NO_PROVIDER_FOR_CAPABILITY');
    expect(result.current.session).toBeNull();

    // The legacy token-store shape must not leak through.
    expect('isLoggedIn' in result.current).toBe(false);
    expect('setToken' in result.current).toBe(false);
    expect('getToken' in result.current).toBe(false);
    expect('clearAuth' in result.current).toBe(false);
  });

  it('signOut() rejects with the no-provider error when called with no provider registered', async () => {
    const { result } = renderHook(() => useAuthFromAuthSubpath());
    await waitFor(() => expect(result.current.ready).toBe(false));

    await expect(result.current.signOut()).rejects.toThrow(/NO_PROVIDER_FOR_CAPABILITY|No provider/);
  });
});

describe('useAuthToken is the renamed legacy token-storage hook', () => {
  it('useAuthToken imported from ../src/auth/index === useAuthToken imported from ../src/hooks/index', () => {
    expect(useAuthTokenFromAuthSubpath).toBe(useAuthTokenFromHooks);
  });

  it('renderHook(() => useAuthToken()) exposes exactly the legacy token-store shape', () => {
    const { result } = renderHook(() => useAuthTokenFromHooks(), { wrapper: ProviderWrapper });

    const keys = Object.keys(result.current).sort();
    expect(keys).toEqual(
      [
        'clearAuth',
        'getRefreshToken',
        'getToken',
        'isAuthenticated',
        'isLoggedIn',
        'setRefreshToken',
        'setToken',
      ].sort()
    );
  });

  it('setToken/getToken/isLoggedIn/clearAuth round-trip correctly', async () => {
    const { result } = renderHook(() => useAuthTokenFromHooks(), { wrapper: ProviderWrapper });

    expect(result.current.isLoggedIn).toBe(false);

    await act(async () => {
      result.current.setToken('token-x');
    });
    await waitFor(() => expect(result.current.isLoggedIn).toBe(true));
    expect(result.current.getToken()).toBe('token-x');

    await act(async () => {
      result.current.clearAuth();
    });
    await waitFor(() => expect(result.current.isLoggedIn).toBe(false));
  });

  it('the legacy token-store shape is NOT reachable under the name useAuth from /auth, /native, or /web', () => {
    const fromAuth = renderHook(() => useAuthFromAuthSubpath());
    const fromNative = renderHook(() => useAuthFromNative());
    const fromWeb = renderHook(() => useAuthFromWeb());

    for (const { result } of [fromAuth, fromNative, fromWeb]) {
      expect('setToken' in result.current).toBe(false);
      expect('isLoggedIn' in result.current).toBe(false);
    }
  });
});
