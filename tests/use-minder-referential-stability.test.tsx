/**
 * @jest-environment jsdom
 *
 * 🧪 useMinder — referential-stability suite (task M0-04)
 *
 * useMinder's return must be referentially stable so consumers can safely pass
 * its callbacks / sub-objects to React.memo children, useEffect deps, and
 * useCallback deps without churn. This suite proves three properties:
 *
 *   1. A re-render with IDENTICAL props keeps `refetch`, `mutate`, `invalidate`,
 *      `cancel`, `auth`, `cache`, `websocket`, `upload`, and `operations`
 *      Object.is-equal across renders.
 *   2. Upload progress events (driven through the shared progress store) do NOT
 *      change `upload` identity and do NOT re-render the subscribed instance or
 *      a sibling instance — while `upload.progress` still yields fresh values.
 *   3. When query data actually arrives, the container identity DOES change
 *      (the memoization is decoupled from data, not over-aggressive).
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { CacheManager } from '../src/core/CacheManager';
import { WebSocketManager } from '../src/core/WebSocketManager';
import * as MinderDataProviderModule from '../src/core/MinderDataProvider';
// Real (un-mocked) shared progress store — we spy on it to capture the
// per-instance upload id and drive progress events.
import * as uploadProgressStore from '../src/upload/uploadProgressStore';

// Mock the managers so a full provider context is available (gives us
// `operations`, `auth`, `cache`, `websocket` wired to spies).
jest.mock('../src/core/ApiClient');
jest.mock('../src/core/AuthManager');
jest.mock('../src/core/CacheManager');
jest.mock('../src/core/WebSocketManager');

jest.mock('../src/core/MinderContext', () => {
  const actual = jest.requireActual('../src/core/MinderContext');
  const useMinderContext = jest.fn();
  return {
    ...actual,
    useMinderContext,
    // Mirror the real non-throwing accessor (null when no provider).
    useMinderContextSafe: () => {
      try {
        return useMinderContext();
      } catch {
        return null;
      }
    },
  };
});

// A wrapper factory — one QueryClient per wrapper instance, stable across the
// re-renders of that tree.
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

let mockApiClient: jest.Mocked<ApiClient>;

beforeEach(() => {
  jest.clearAllMocks();

  mockApiClient = {
    request: jest.fn(),
    uploadFile: jest.fn(),
  } as unknown as jest.Mocked<ApiClient>;

  const mockAuthManager = {
    setToken: jest.fn(),
    getToken: jest.fn(),
    clearAuth: jest.fn(),
    isAuthenticated: jest.fn(),
    setRefreshToken: jest.fn(),
    getRefreshToken: jest.fn(),
  } as unknown as jest.Mocked<AuthManager>;

  const mockCacheManager = {
    invalidateQueries: jest.fn(),
    clearCache: jest.fn(),
    isQueryFresh: jest.fn(),
    getAllCachedQueries: jest.fn(() => []),
    prefetchQuery: jest.fn(),
  } as unknown as jest.Mocked<CacheManager>;

  const mockWebSocketManager = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn(),
    isConnected: jest.fn(),
  } as unknown as jest.Mocked<WebSocketManager>;

  // Same object reference is returned on every render → stable context identity.
  (MinderDataProviderModule.useMinderContext as jest.Mock).mockReturnValue({
    apiClient: mockApiClient,
    authManager: mockAuthManager,
    cacheManager: mockCacheManager,
    websocketManager: mockWebSocketManager,
    config: {
      routes: {
        users: { url: '/users', method: 'GET' },
        posts: { url: '/posts', method: 'GET' },
      },
    },
  });
});

afterEach(() => {
  // Reset the shared store and any spies between tests.
  uploadProgressStore.clearAllUploadProgress();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Callbacks & sub-objects survive an identical-props re-render
// ---------------------------------------------------------------------------

describe('useMinder referential stability — identical-props re-render', () => {
  it('keeps refetch/mutate/invalidate/cancel and every sub-object Object.is-equal', () => {
    const { result, rerender } = renderHook(
      () => useMinder('users', { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    const first = result.current;
    rerender();
    const second = result.current;

    // Callbacks.
    expect(second.refetch).toBe(first.refetch);
    expect(second.mutate).toBe(first.mutate);
    expect(second.invalidate).toBe(first.invalidate);
    expect(second.cancel).toBe(first.cancel);

    // Sub-objects.
    expect(second.auth).toBe(first.auth);
    expect(second.cache).toBe(first.cache);
    expect(second.websocket).toBe(first.websocket);
    expect(second.upload).toBe(first.upload);

    // CRUD operations (present because the mock context has apiClient + cacheManager).
    expect(second.operations).toBeDefined();
    expect(second.operations).toBe(first.operations);
  });

  it('keeps each individual operation function stable across re-renders', () => {
    const { result, rerender } = renderHook(
      () => useMinder('users', { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    const firstOps = result.current.operations!;
    rerender();
    const secondOps = result.current.operations!;

    expect(secondOps.create).toBe(firstOps.create);
    expect(secondOps.update).toBe(firstOps.update);
    expect(secondOps.delete).toBe(firstOps.delete);
    expect(secondOps.fetch).toBe(firstOps.fetch);
    expect(secondOps.refresh).toBe(firstOps.refresh);
    expect(secondOps.clear).toBe(firstOps.clear);
  });
});

// ---------------------------------------------------------------------------
// 2. Upload progress is decoupled from identity & re-renders
// ---------------------------------------------------------------------------

describe('useMinder referential stability — upload progress decoupling', () => {
  it('does not change `upload` identity or re-render on progress ticks, but the getter stays fresh', () => {
    const subscribedIds: string[] = [];
    const realSubscribe = uploadProgressStore.subscribeToUploadProgress;
    jest
      .spyOn(uploadProgressStore, 'subscribeToUploadProgress')
      .mockImplementation((id: string, cb) => {
        subscribedIds.push(id);
        return realSubscribe(id, cb);
      });

    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useMinder('users', { autoFetch: false });
      },
      { wrapper: createWrapper() }
    );

    const uploadBefore = result.current.upload;
    const rendersBefore = renderCount;

    // The effect subscribed with this instance's upload id.
    expect(subscribedIds.length).toBeGreaterThan(0);
    const uploadId = subscribedIds[subscribedIds.length - 1];

    act(() => {
      uploadProgressStore.setUploadProgress(uploadId, { loaded: 25, total: 100, percentage: 25 });
      uploadProgressStore.setUploadProgress(uploadId, { loaded: 50, total: 100, percentage: 50 });
      uploadProgressStore.setUploadProgress(uploadId, { loaded: 90, total: 100, percentage: 90 });
    });

    // Object identity of `upload` is unchanged and NO re-render was triggered.
    expect(result.current.upload).toBe(uploadBefore);
    expect(renderCount).toBe(rendersBefore);

    // Yet the getter reads the live value from the ref.
    expect(result.current.upload.progress).toEqual({ loaded: 90, total: 100, percentage: 90 });
    expect(result.current.upload.isUploading).toBe(true);
  });

  it('does not increase a sibling useMinder instance render count on another upload’s progress', () => {
    const subscribedIds: string[] = [];
    const realSubscribe = uploadProgressStore.subscribeToUploadProgress;
    jest
      .spyOn(uploadProgressStore, 'subscribeToUploadProgress')
      .mockImplementation((id: string, cb) => {
        subscribedIds.push(id);
        return realSubscribe(id, cb);
      });

    // Uploader instance (subscribes first).
    renderHook(() => useMinder('users', { autoFetch: false }), {
      wrapper: createWrapper(),
    });

    // Sibling instance in a separate tree — counts its own renders.
    let siblingRenders = 0;
    const sibling = renderHook(
      () => {
        siblingRenders++;
        return useMinder('posts', { autoFetch: false });
      },
      { wrapper: createWrapper() }
    );

    const siblingUploadBefore = sibling.result.current.upload;
    const siblingContainerBefore = sibling.result.current;
    const siblingRendersBefore = siblingRenders;

    // Drive progress for the UPLOADER's id (subscribed first).
    const uploaderId = subscribedIds[0];

    act(() => {
      uploadProgressStore.setUploadProgress(uploaderId, { loaded: 40, total: 100, percentage: 40 });
      uploadProgressStore.setUploadProgress(uploaderId, { loaded: 80, total: 100, percentage: 80 });
    });

    // The sibling neither re-rendered nor changed identity.
    expect(siblingRenders).toBe(siblingRendersBefore);
    expect(sibling.result.current.upload).toBe(siblingUploadBefore);
    expect(sibling.result.current).toBe(siblingContainerBefore);
  });
});

// ---------------------------------------------------------------------------
// 3. Container DOES change when meaningful data arrives (memo isn't over-aggressive)
// ---------------------------------------------------------------------------

describe('useMinder referential stability — container reacts to data', () => {
  it('changes the container identity once query data resolves', async () => {
    mockApiClient.request.mockResolvedValue({ id: 1, name: 'Ada' });

    const { result } = renderHook(() => useMinder('users'), {
      wrapper: createWrapper(),
    });

    // Snapshot while still loading (no data yet).
    const before = result.current;
    expect(before.data).toBeNull();

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: 1, name: 'Ada' });
    });

    const after = result.current;

    // The container is a NEW object once data arrived.
    expect(after).not.toBe(before);
    expect(after.success).toBe(true);
    expect(after.data).toEqual({ id: 1, name: 'Ada' });
  });
});
