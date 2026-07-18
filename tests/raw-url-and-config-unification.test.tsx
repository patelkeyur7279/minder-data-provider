/**
 * @jest-environment jsdom
 *
 * M0-05 — Fix the ad-hoc-URL escape hatch and unify the dual global configs.
 *
 * DEFECT 1: In PROVIDER mode useMinder routes through ApiClient.request(), which
 *           only knew how to look a route NAME up in the registry and threw
 *           "Route not found" for absolute URLs / rawUrl paths. These tests lock
 *           in the escape hatch:
 *             - an absolute `https?://` route bypasses the registry (used verbatim)
 *             - a `rawUrl:true` option bypasses the registry (resolved vs baseURL)
 *             - an ad-hoc relative path ("/x") that is not a registered NAME is
 *               treated as a raw path (so useMinder('/ad-hoc') works in provider
 *               mode without the hook having to thread the rawUrl flag)
 *             - a BARE unknown route name still throws MinderConfigError (regression)
 *
 * DEFECT 2: `configureMinder()` (routes-aware) and minder()'s own baseURL bag were
 *           disconnected — configureMinder validated but minder() resolved routes
 *           by NAME literally, silently ignoring the registry entry. These tests
 *           lock in that minder() now consults the unified registry, and that
 *           minder.config() keeps working as a deprecated alias.
 */
import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';

import { ApiClient } from '../src/core/ApiClient';
import { HttpMethod } from '../src/constants/enums';
import { MinderConfigError } from '../src/errors/MinderError';
import type { MinderConfig } from '../src/core/types';

import { useMinder } from '../src/hooks/useMinder';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';

import { minder } from '../src/core/minder';
import { configureMinder } from '../src/config/index';
import { clearGlobalMinderConfig } from '../src/core/globalConfig';

// ── Module mocks ────────────────────────────────────────────────────────────
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../src/core/AuthManager');
jest.mock('../src/core/ProxyManager');
jest.mock('../src/utils/security', () => ({
  CSRFTokenManager: jest.fn().mockImplementation(() => ({ getToken: jest.fn().mockReturnValue('csrf') })),
  XSSSanitizer: jest.fn().mockImplementation(() => ({ sanitize: jest.fn((d: unknown) => d) })),
  RateLimiter: jest.fn().mockImplementation(() => ({ check: jest.fn().mockReturnValue(true) })),
  getSecurityHeaders: jest.fn().mockReturnValue({}),
}));
jest.mock('../src/utils/performance', () => ({
  RequestBatcher: jest.fn().mockImplementation(() => ({})),
  RequestDeduplicator: jest.fn().mockImplementation(() => ({ deduplicate: jest.fn((_k: string, fn: any) => fn()) })),
  PerformanceMonitor: jest.fn().mockImplementation(() => ({
    recordLatency: jest.fn(),
    getMetrics: jest.fn().mockReturnValue({}),
    reset: jest.fn(),
  })),
}));

// Inject a controllable context for the provider-mode useMinder tests without
// constructing a real ApiClient (mirrors tests/useMinder-params.test.tsx).
jest.mock('../src/core/MinderDataProvider', () => {
  const actual = jest.requireActual('../src/core/MinderDataProvider');
  const useMinderContext = jest.fn();
  return {
    ...actual,
    useMinderContext,
    useMinderContextSafe: () => {
      try {
        return useMinderContext();
      } catch {
        return null;
      }
    },
  };
});

const mockAuthManager = {
  getToken: jest.fn().mockReturnValue('test-token'),
  clearAuth: jest.fn(),
} as any;

// =============================================================================
// DEFECT 2 (part b): minder.config() deprecated alias — declared FIRST so the
// module-level "warn once" flag is pristine when this runs.
// =============================================================================
describe('minder.config() — deprecated alias (unified config)', () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    mockedAxios.mockResolvedValue({ data: {}, status: 200, statusText: 'OK', headers: {}, config: {} } as any);
  });

  it('still configures the resolution baseURL and warns deprecation exactly once', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    (minder as any).config({ baseURL: 'http://legacy1.example.com' });
    (minder as any).config({ baseURL: 'http://legacy2.example.com' });

    // Deprecation warning fires once, not on every call.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/deprecat/i);

    // ...and it still writes the shared store (last write wins).
    await minder('/thing');
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://legacy2.example.com', url: '/thing' })
    );

    warnSpy.mockRestore();
  });
});

// =============================================================================
// DEFECT 1: ApiClient.request() — the provider-mode request path.
// =============================================================================
describe('ApiClient.request() — ad-hoc URL escape hatch (provider path)', () => {
  let mockAxiosInstance: any;
  let config: MinderConfig;

  beforeEach(() => {
    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance) as any;

    config = {
      apiBaseUrl: 'http://api.example.com',
      routes: {
        getUser: { url: '/users/:id', method: HttpMethod.GET },
        createUser: { url: '/users', method: HttpMethod.POST },
      },
    };
  });

  it('sends an absolute URL verbatim, bypassing the registry and baseURL', async () => {
    const client = new ApiClient(config, mockAuthManager);
    mockAxiosInstance.request.mockResolvedValueOnce({ data: { ok: true } });

    const result = await client.request('https://external.example.com/data');

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://external.example.com/data',
        baseURL: '', // used verbatim, not prefixed with apiBaseUrl
      })
    );
    expect(result).toEqual({ ok: true });
  });

  it('honors an explicit rawUrl:true option for a relative path (resolved vs baseURL)', async () => {
    const client = new ApiClient(config, mockAuthManager);
    mockAxiosInstance.request.mockResolvedValueOnce({ data: { ok: true } });

    await client.request('/ad-hoc', undefined, undefined, { rawUrl: true } as any);

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/ad-hoc' })
    );
    // A relative raw path is NOT forced to bypass baseURL — the axios instance
    // was created with baseURL = apiBaseUrl, so resolution happens there.
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://api.example.com' })
    );
  });

  it('treats an ad-hoc relative path (leading "/") as raw when not a registered name', async () => {
    // This is exactly how the provider-mode hook forwards useMinder('/ad-hoc'):
    //   apiClient.request('/ad-hoc', undefined, undefined, { params, headers })
    const client = new ApiClient(config, mockAuthManager);
    mockAxiosInstance.request.mockResolvedValueOnce({ data: { ok: true } });

    await client.request('/ad-hoc', undefined, undefined, { params: undefined, headers: undefined } as any);

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/ad-hoc' })
    );
  });

  it('still throws MinderConfigError for an unknown BARE route name (regression)', async () => {
    const client = new ApiClient(config, mockAuthManager);

    await expect(client.request('totallyUnknownRoute')).rejects.toThrow(MinderConfigError);
    await expect(client.request('totallyUnknownRoute')).rejects.toThrow(/not found/i);
  });

  it('still resolves registered route names against the registry (regression)', async () => {
    const client = new ApiClient(config, mockAuthManager);
    mockAxiosInstance.request.mockResolvedValue({ data: { id: 1 } });

    await client.request('getUser', undefined, { id: '7' });

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: '/users/7' })
    );
  });

  it('mutation: an absolute URL with a body defaults to POST', async () => {
    const client = new ApiClient(config, mockAuthManager);
    mockAxiosInstance.request.mockResolvedValueOnce({ data: { created: true } });

    await client.request('https://external.example.com/things', { name: 'x' });

    expect(mockAxiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://external.example.com/things',
        baseURL: '',
        data: { name: 'x' },
      })
    );
  });
});

// =============================================================================
// DEFECT 1: useMinder (provider mode) forwards ad-hoc routes into ApiClient.
// =============================================================================
describe('Provider mode: useMinder forwards ad-hoc URLs to ApiClient', () => {
  let fakeApiClient: { request: jest.Mock };

  const makeWrapper = () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
  };

  beforeEach(() => {
    fakeApiClient = { request: jest.fn() };
    (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue({
      apiClient: fakeApiClient,
      config: { apiBaseUrl: 'http://api.example.com', routes: { users: { url: '/users', method: 'GET' } } },
    });
  });

  it('forwards an absolute URL to apiClient.request without a registry error', async () => {
    fakeApiClient.request.mockResolvedValue({ id: 1 });

    const { result } = renderHook(() => useMinder('https://external.example.com/data'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fakeApiClient.request).toHaveBeenCalledWith(
      'https://external.example.com/data',
      undefined,
      undefined,
      expect.any(Object)
    );
    expect(result.current.error).toBeFalsy();
  });

  it('forwards a rawUrl relative path to apiClient.request without a registry error', async () => {
    fakeApiClient.request.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useMinder('/ad-hoc', { rawUrl: true }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fakeApiClient.request).toHaveBeenCalledWith('/ad-hoc', undefined, undefined, expect.any(Object));
    expect(result.current.error).toBeFalsy();
  });
});

// =============================================================================
// DEFECT 2: standalone minder() consults the unified route registry.
// =============================================================================
describe('Standalone minder(): unified route registry resolution', () => {
  beforeEach(() => {
    clearGlobalMinderConfig();
    mockedAxios.mockResolvedValue({ data: {}, status: 200, statusText: 'OK', headers: {}, config: {} } as any);
  });

  it('resolves a registered route NAME via the registry (url + method + baseURL)', async () => {
    configureMinder({
      apiUrl: 'http://api.example.com',
      routes: { users: { url: '/real-users', method: HttpMethod.GET } },
    });

    await minder('users');

    // Before the fix the route NAME "users" was used as a literal path against
    // an empty baseURL; now it resolves through the registry entry.
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://api.example.com',
        url: '/real-users',
        method: 'GET',
      })
    );
  });

  it('uses the registry entry method even when data-based auto-detection would differ', async () => {
    configureMinder({
      apiUrl: 'http://api.example.com',
      routes: { createUser: { url: '/create-user', method: HttpMethod.POST } },
    });

    // No body → detectMethod() would say GET, but the registry says POST.
    await minder('createUser');

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/create-user', method: 'POST' })
    );
  });

  it('leaves non-registered URL/path routes untouched (current behavior preserved)', async () => {
    configureMinder({
      apiUrl: 'http://api.example.com',
      routes: { users: { url: '/real-users', method: HttpMethod.GET } },
    });

    await minder('/raw/path');

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/raw/path' })
    );
  });
});
