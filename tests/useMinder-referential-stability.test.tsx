/**
 * @jest-environment jsdom
 *
 * Phase 1 DX: useMinder's auth/cache/websocket/upload sub-objects must keep a
 * stable identity across re-renders with unchanged inputs, so memoized consumers
 * (React.memo children, effect/callback dependency arrays) don't re-render or
 * re-run needlessly.
 */
import React from 'react';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { setGlobalMinderConfig } from '../src/core/globalConfig';

beforeAll(() => {
  // Standalone mode (no provider) requires a global config to be present.
  setGlobalMinderConfig({
    apiBaseUrl: 'http://localhost',
    routes: { users: { url: '/users', method: 'GET' } },
  } as any);
});

const createWrapper = () => {
  // One QueryClient per wrapper instance => stable across rerenders of the tree.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, enabled: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useMinder referential stability (Phase 1)', () => {
  it('keeps auth/cache/websocket/upload identity stable across re-renders', () => {
    const { result, rerender } = renderHook(
      () => useMinder('users', { autoFetch: false }),
      { wrapper: createWrapper() }
    );

    const first = result.current;
    rerender();
    const second = result.current;

    expect(second.auth).toBe(first.auth);
    expect(second.cache).toBe(first.cache);
    expect(second.websocket).toBe(first.websocket);
    expect(second.upload).toBe(first.upload);
  });
});
