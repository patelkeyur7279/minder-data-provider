/**
 * @jest-environment jsdom
 *
 * M1-01 — Zero-config calls + raw error access + axios escape hatch.
 *
 * FEATURE A: zero-config ABSOLUTE URLs — useMinder('https://…') works with NO
 *            provider and NO configureMinder (the config-missing throw is skipped
 *            for absolute URLs, which the standalone minder() path dispatches
 *            verbatim).
 *
 * FEATURE B: registry-less RELATIVE paths — with only configureMinder({ apiUrl })
 *            (no routes), useMinder('/users') works in standalone AND provider mode.
 *
 * FEATURE C: error.raw — every error a consumer sees exposes the ORIGINAL
 *            underlying error via `.raw`, in result-mode and throwOnError-mode,
 *            provider and standalone, plus ApiClient's returned (400) and thrown
 *            (500) paths.
 *
 * FEATURE D: axios escape hatch — ApiClient.getAxiosInstance() returns the live
 *            internal instance, reachable via context.apiClient.
 */
import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';

import { ApiClient } from '../src/core/ApiClient';
import { HttpMethod } from '../src/constants/enums';
import type { MinderConfig } from '../src/core/types';
import { useMinder } from '../src/hooks/useMinder';
import { configureMinder } from '../src/config/index';
import { clearGlobalMinderConfig } from '../src/core/globalConfig';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';

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

// Controllable provider context (mirrors tests/raw-url-and-config-unification.test.tsx).
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

const setContext = (ctx: unknown) =>
  (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue(ctx);

const axiosLikeError = (status: number) =>
  Object.assign(new Error('boom'), {
    isAxiosError: true,
    config: {},
    response: { status, data: { message: 'nope' } },
  });

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const mockAuthManager = {
  getToken: jest.fn().mockReturnValue(null),
  clearAuth: jest.fn(),
} as any;

// =============================================================================
// FEATURE A — zero-config absolute URLs (standalone: no provider, no config)
// =============================================================================
describe('Feature A: zero-config absolute URLs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalMinderConfig();
    setContext(null); // no provider
  });

  it('fetches an absolute URL with NO provider and NO configureMinder', async () => {
    mockedAxios.mockResolvedValue({ data: { id: 1, name: 'Ada' }, status: 200, headers: {} } as any);

    const { result } = renderHook(
      () => useMinder('https://api.example.com/users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toMatchObject({ id: 1, name: 'Ada' });
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.example.com/users', method: 'GET' })
    );
  });

  it('still throws the config-missing error for a NON-absolute route with no config', () => {
    // Bare route name, no provider, no config → the guard must still fire.
    expect(() =>
      renderHook(() => useMinder('users'), { wrapper: makeWrapper() })
    ).toThrow(/Configuration missing/);
  });
});

// =============================================================================
// FEATURE B — registry-less relative paths (only configureMinder({ apiUrl }))
// =============================================================================
describe('Feature B: registry-less relative paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalMinderConfig();
  });

  it('configureMinder accepts a routes-less config (no rejection)', () => {
    expect(() => configureMinder({ apiUrl: 'https://api.x.com' })).not.toThrow();
  });

  it('standalone: useMinder("/users") resolves against apiUrl with no routes registered', async () => {
    configureMinder({ apiUrl: 'https://api.x.com' }); // NO routes
    setContext(null); // standalone
    mockedAxios.mockResolvedValue({ data: [{ id: 1 }], status: 200, headers: {} } as any);

    const { result } = renderHook(
      () => useMinder('/users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.success).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.x.com', url: '/users', method: 'GET' })
    );
  });

  it('provider: useMinder("/users") forwards the raw path to apiClient.request', async () => {
    const fakeApiClient = { request: jest.fn<any>().mockResolvedValue([{ id: 1 }]) };
    setContext({
      apiClient: fakeApiClient,
      config: { apiBaseUrl: 'https://api.x.com', routes: {} },
    });

    const { result } = renderHook(
      () => useMinder('/users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeFalsy();
    expect(fakeApiClient.request).toHaveBeenCalledWith('/users', undefined, undefined, expect.any(Object));
  });
});

// =============================================================================
// FEATURE C — error.raw exposes the original underlying error
// =============================================================================
describe('Feature C: error.raw (ApiClient handleError paths)', () => {
  let onRejected: any;
  let config: MinderConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    onRejected = undefined;
    const mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn((_fulfilled: any, rejected: any) => { onRejected = rejected; }) },
      },
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance) as any;
    // Make the real branches in buildError run under the axios mock.
    (mockedAxios as any).isAxiosError = (e: any) => !!e?.isAxiosError;
    config = { apiBaseUrl: 'http://api.example.com', routes: {} };
  });

  it('attaches .raw to a THROWN error (500 path)', async () => {
    new ApiClient(config, mockAuthManager); // installs interceptors → captures onRejected
    const original = axiosLikeError(500);

    const caught = await onRejected(original).catch((e: any) => e);

    expect(caught).toBeTruthy();
    expect(caught.raw).toBe(original);
    expect((caught.raw as any).isAxiosError).toBe(true);
  });

  it('attaches .raw to the RETURNED error object (400 path)', async () => {
    new ApiClient(config, mockAuthManager);
    const original = axiosLikeError(400);

    const caught = await onRejected(original).catch((e: any) => e);

    expect(caught).toBeTruthy();
    expect(caught.raw).toBe(original);
    expect(caught.code).toBe('BAD_REQUEST');
  });
});

describe('Feature C: error.raw (standalone minder path via useMinder)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalMinderConfig();
    configureMinder({ apiUrl: 'http://localhost', routes: { users: '/users' } });
    setContext(null); // standalone
  });

  it('result-mode: result.error.raw is the original transport error', async () => {
    const original = axiosLikeError(500);
    mockedAxios.mockRejectedValue(original);

    const { result } = renderHook(
      () => useMinder('users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.success).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error.raw).toBe(original);
  });

  it('throwOnError-mode: the thrown error carries .raw (via error boundary)', async () => {
    const original = axiosLikeError(500);
    mockedAxios.mockRejectedValue(original);

    let caught: any;
    class Boundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
      state = { hasError: false };
      static getDerivedStateFromError() { return { hasError: true }; }
      componentDidCatch(err: any) { caught = err; }
      render() {
        return this.state.hasError ? React.createElement('div', null, 'err') : this.props.children;
      }
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <Boundary>{children}</Boundary>
      </QueryClientProvider>
    );
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { /* silence boundary noise */ });

    renderHook(() => useMinder('users', { throwOnError: true, queryOptions: { retry: false } }), { wrapper });

    await waitFor(() => expect(caught).toBeTruthy());
    expect(caught.raw).toBe(original);
    spy.mockRestore();
  });
});

describe('Feature C: error.raw (provider path via useMinder)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('result-mode: an apiClient error with .raw survives into result.error', async () => {
    const original = axiosLikeError(500);
    // Simulate what the real ApiClient produces: a normalized error carrying .raw.
    const normalized = Object.assign(new Error('Server error'), { status: 500, raw: original });
    const fakeApiClient = { request: jest.fn<any>().mockRejectedValue(normalized) };
    setContext({ apiClient: fakeApiClient, config: { apiBaseUrl: 'http://api', routes: { users: { url: '/users', method: 'GET' } } } });

    const { result } = renderHook(
      () => useMinder('users', { queryOptions: { retry: false } }),
      { wrapper: makeWrapper() }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.success).toBe(false);
    expect(result.current.error).toBe(normalized);
    expect(result.current.error.raw).toBe(original);
  });

  it('throwOnError-mode: the thrown apiClient error keeps .raw (via error boundary)', async () => {
    const original = axiosLikeError(500);
    const normalized = Object.assign(new Error('Server error'), { status: 500, raw: original });
    const fakeApiClient = { request: jest.fn<any>().mockRejectedValue(normalized) };
    setContext({ apiClient: fakeApiClient, config: { apiBaseUrl: 'http://api', routes: { users: { url: '/users', method: 'GET' } } } });

    let caught: any;
    class Boundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
      state = { hasError: false };
      static getDerivedStateFromError() { return { hasError: true }; }
      componentDidCatch(err: any) { caught = err; }
      render() {
        return this.state.hasError ? React.createElement('div', null, 'err') : this.props.children;
      }
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <Boundary>{children}</Boundary>
      </QueryClientProvider>
    );
    const spy = jest.spyOn(console, 'error').mockImplementation(() => { /* silence boundary noise */ });

    renderHook(() => useMinder('users', { throwOnError: true, queryOptions: { retry: false } }), { wrapper });

    await waitFor(() => expect(caught).toBeTruthy());
    expect(caught.raw).toBe(original);
    spy.mockRestore();
  });
});

// =============================================================================
// FEATURE D — axios escape hatch
// =============================================================================
describe('Feature D: getAxiosInstance() escape hatch', () => {
  let mockAxiosInstance: any;
  let config: MinderConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance) as any;
    config = { apiBaseUrl: 'http://api.example.com', routes: {} };
  });

  it('returns the live internal axios instance (same reference)', () => {
    const client = new ApiClient(config, mockAuthManager);
    expect(client.getAxiosInstance()).toBe(mockAxiosInstance);
  });

  it('is reachable via context.apiClient.getAxiosInstance()', () => {
    const client = new ApiClient(config, mockAuthManager);
    const context = { apiClient: client };
    expect(context.apiClient.getAxiosInstance()).toBe(mockAxiosInstance);
  });
});
