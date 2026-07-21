/**
 * Wave I (I-01): useMinder(route, { source: 'local' | 'local-first' }).
 * Verifies local-only reads never touch the network, local-first persists on
 * success and falls back on network failure, and that omitting `source` leaves
 * the network path byte-identical (regression).
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { ApiClient } from '../src/core/ApiClient';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';
import { LocalStore, __setDefaultLocalStore } from '../src/core/LocalStore';
import { MemoryStorageAdapter } from '../src/platform/adapters/storage/MemoryStorageAdapter';

jest.mock('../src/core/ApiClient');
jest.mock('../src/core/MinderContext', () => {
  const actual = jest.requireActual('../src/core/MinderContext');
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

const wrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useMinder source: local-first', () => {
  let mockApiClient: jest.Mocked<ApiClient>;
  let localStore: LocalStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = { request: jest.fn() } as unknown as jest.Mocked<ApiClient>;
    (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue({
      apiClient: mockApiClient,
      config: { routes: { users: { url: '/users', method: 'GET' } } },
    });
    // Deterministic in-memory local store for every test.
    localStore = new LocalStore(new MemoryStorageAdapter({ namespace: 'lf-test' }));
    __setDefaultLocalStore(localStore);
  });

  afterEach(() => __setDefaultLocalStore(null));

  it("source: 'local' reads persisted data and never calls the network", async () => {
    await localStore.set(['users'], [{ id: 9, name: 'Local Ada' }]);

    const { result } = renderHook(() => useMinder('users', { source: 'local', queryKey: ['users'] }), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 9, name: 'Local Ada' }]));
    expect(mockApiClient.request).not.toHaveBeenCalled();
  });

  it("source: 'local' returns null when nothing is stored (no network)", async () => {
    const { result } = renderHook(() => useMinder('users', { source: 'local', queryKey: ['users'] }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(mockApiClient.request).not.toHaveBeenCalled();
  });

  it("source: 'local-first' fetches, returns network data, and persists it", async () => {
    mockApiClient.request.mockResolvedValue([{ id: 1, name: 'From API' }]);

    const { result } = renderHook(() => useMinder('users', { source: 'local-first', queryKey: ['users'] }), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1, name: 'From API' }]));
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    // The network result is now persisted locally.
    expect(await localStore.get(['users'])).toEqual([{ id: 1, name: 'From API' }]);
  });

  it("source: 'local-first' falls back to the persisted value when the network fails", async () => {
    await localStore.set(['users'], [{ id: 7, name: 'Cached' }]);
    mockApiClient.request.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));

    const { result } = renderHook(() => useMinder('users', { source: 'local-first', queryKey: ['users'] }), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 7, name: 'Cached' }]));
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);
  });

  it("source: 'local-first' surfaces the error when the network fails and no local value exists", async () => {
    mockApiClient.request.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));

    const { result } = renderHook(() => useMinder('users', { source: 'local-first', queryKey: ['users'] }), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('omitting source leaves the network path unchanged (regression)', async () => {
    mockApiClient.request.mockResolvedValue([{ id: 2, name: 'Net' }]);

    const { result } = renderHook(() => useMinder('users'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 2, name: 'Net' }]));
    expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    // Default network reads do NOT write to the local store.
    expect(await localStore.get(['users'])).toBeNull();
  });
});
