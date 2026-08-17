/**
 * Capability Contracts — registry + client hooks (task F-03)
 *
 * Covers:
 *  - registry: register/get/unregister, replace-warns-once, subscribe-notifies
 *  - useAuth: no-provider contract (ready:false + NO_PROVIDER_FOR_CAPABILITY, safe no-op
 *    action methods that throw the same error only when called), registering a provider
 *    (before AND after mount) flips it to ready:true with a loaded session
 *  - useLive: subscribe/receive/unsubscribe lifecycle, no-provider contract, callback-ref
 *    stability (identity changes on the callback do not resubscribe)
 *  - useCheckout / useStorage: no-provider contract + action methods against a fake provider
 *  - hook-order regression: alternating provider registered/unregistered across renders must
 *    never throw "rendered fewer/more hooks than expected" (every hook call is unconditional)
 *  - getProviderClient returns the raw underlying client object
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  registerCapabilityProvider,
  getCapabilityProvider,
  subscribeCapabilityRegistry,
} from '../src/contracts/registry';
import type { CapabilityProvider } from '../src/contracts/registry';
import type { AuthContract, PaymentsContract, StorageContract, LiveContract } from '../src/contracts/types';
import { useAuth, useCheckout, useStorage, useLive } from '../src/hooks/contracts';
import { MinderError } from '../src/errors/MinderError';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

// There is no exported "clear all" helper on the registry (by design — see
// src/contracts/registry.ts). Every registration made via `register()` below is tracked so
// `afterEach` can fully unregister it, keeping the module-level registry state isolated between
// tests regardless of pass/fail.
let cleanups: Array<() => void> = [];

function register<T>(provider: CapabilityProvider<T>): () => void {
  const unregister = registerCapabilityProvider(provider as unknown as CapabilityProvider);
  cleanups.push(unregister);
  return unregister;
}

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  jest.restoreAllMocks();
});

function makeAuthProvider(overrides: Partial<AuthContract> = {}): CapabilityProvider<AuthContract> {
  const implementation: AuthContract = {
    getSession: jest.fn(async () => ({ userId: 'u1', raw: {} })),
    signOut: jest.fn(async () => undefined),
    ...overrides,
  };
  const client = { fakeAuthClient: true };
  return {
    providerName: '@minder/test-auth',
    capability: 'auth',
    implementation,
    getProviderClient: () => client,
  };
}

function makePaymentsProvider(): CapabilityProvider<PaymentsContract> {
  const implementation: PaymentsContract = {
    createCheckout: jest.fn(async () => ({ url: 'https://checkout.example.com/session/123' })),
  };
  const client = { fakePaymentsClient: true };
  return {
    providerName: '@minder/test-payments',
    capability: 'payments',
    implementation,
    getProviderClient: () => client,
  };
}

function makeStorageProvider(): CapabilityProvider<StorageContract> {
  const implementation: StorageContract = {
    upload: jest.fn(async () => ({ url: 'https://cdn.example.com/file.png' })),
    remove: jest.fn(async () => undefined),
  };
  const client = { fakeStorageClient: true };
  return {
    providerName: '@minder/test-storage',
    capability: 'storage',
    implementation,
    getProviderClient: () => client,
  };
}

/** A fake LiveContract that records live subscriber counts per channel for assertions. */
function makeLiveProvider() {
  let subscriberCount = 0;
  const listeners = new Map<string, Set<(event: unknown) => void>>();

  const implementation: LiveContract = {
    subscribe: jest.fn((channel: string, cb: (event: unknown) => void) => {
      subscriberCount++;
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(cb);
      return () => {
        subscriberCount--;
        listeners.get(channel)?.delete(cb);
      };
    }),
  };

  const provider: CapabilityProvider<LiveContract> = {
    providerName: '@minder/test-live',
    capability: 'live',
    implementation,
    getProviderClient: () => ({ fakeLiveClient: true }),
  };

  return {
    provider,
    emit: (channel: string, event: unknown) => {
      listeners.get(channel)?.forEach((cb) => cb(event));
    },
    getSubscriberCount: () => subscriberCount,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('capability registry', () => {
  it('register / get / unregister', () => {
    expect(getCapabilityProvider('auth')).toBeNull();

    const provider = makeAuthProvider();
    const unregister = register(provider);
    expect(getCapabilityProvider('auth')).toBe(provider);

    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
  });

  it('replaces an existing provider for the same capability with exactly one console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const first = makeAuthProvider();
    register(first);
    expect(getCapabilityProvider('auth')).toBe(first);

    const second = makeAuthProvider();
    register(second);

    expect(getCapabilityProvider('auth')).toBe(second);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('unregister is a no-op if the provider has already been replaced', () => {
    const first = makeAuthProvider();
    const unregisterFirst = register(first);

    const second = makeAuthProvider();
    register(second);

    // The stale unregister callback for `first` must not tear down `second`.
    unregisterFirst();
    expect(getCapabilityProvider('auth')).toBe(second);
  });

  it('subscribeCapabilityRegistry notifies subscribers on register and unregister', () => {
    const cb = jest.fn();
    const unsubscribe = subscribeCapabilityRegistry(cb);

    const provider = makeAuthProvider();
    const unregister = register(provider);
    expect(cb).toHaveBeenCalledTimes(1);

    unregister();
    expect(cb).toHaveBeenCalledTimes(2);

    unsubscribe();
    register(makeAuthProvider());
    // No further notifications after unsubscribing.
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// useAuth
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  it('no provider registered -> ready:false, NO_PROVIDER_FOR_CAPABILITY error, session null', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.ready).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeInstanceOf(MinderError);
    expect(result.current.error?.code).toBe('NO_PROVIDER_FOR_CAPABILITY');
    expect(result.current.error?.message).toContain("capability 'auth'");
  });

  it('signOut() rejects with NO_PROVIDER_FOR_CAPABILITY when called with no provider registered', async () => {
    const { result } = renderHook(() => useAuth());

    await expect(result.current.signOut()).rejects.toMatchObject({
      code: 'NO_PROVIDER_FOR_CAPABILITY',
    });
  });

  it('getProviderClient() throws NO_PROVIDER_FOR_CAPABILITY when called with no provider registered', () => {
    const { result } = renderHook(() => useAuth());

    expect(() => result.current.getProviderClient()).toThrow(MinderError);
    try {
      result.current.getProviderClient();
      throw new Error('expected getProviderClient to throw');
    } catch (e) {
      expect((e as MinderError).code).toBe('NO_PROVIDER_FOR_CAPABILITY');
    }
  });

  it('flips to ready:true and loads the session once a provider is registered (registered AFTER mount)', async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.ready).toBe(false);

    const provider = makeAuthProvider();
    act(() => {
      register(provider);
    });

    // The registry subscription re-renders the hook without needing to remount it.
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(result.current.session).toEqual({ userId: 'u1', raw: {} }));
    expect(result.current.error).toBeNull();
  });

  it('getProviderClient() returns the raw underlying client object once a provider is registered', async () => {
    const provider = makeAuthProvider();
    register(provider);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.getProviderClient()).toBe(provider.getProviderClient());
  });

  it('signOut() calls through to the contract and clears the session', async () => {
    const provider = makeAuthProvider();
    register(provider);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.session).toEqual({ userId: 'u1', raw: {} }));

    await act(async () => {
      await result.current.signOut();
    });

    expect(provider.implementation.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.session).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useCheckout
// ---------------------------------------------------------------------------

describe('useCheckout', () => {
  it('no provider registered -> ready:false + NO_PROVIDER_FOR_CAPABILITY; createCheckout rejects', async () => {
    const { result } = renderHook(() => useCheckout());

    expect(result.current.ready).toBe(false);
    expect(result.current.error?.code).toBe('NO_PROVIDER_FOR_CAPABILITY');

    await expect(
      result.current.createCheckout({ items: [], successUrl: 'https://x/success', cancelUrl: 'https://x/cancel' })
    ).rejects.toMatchObject({ code: 'NO_PROVIDER_FOR_CAPABILITY' });
  });

  it('with a registered provider: ready:true, createCheckout resolves, getProviderClient returns raw client', async () => {
    const provider = makePaymentsProvider();
    register(provider);

    const { result } = renderHook(() => useCheckout());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();

    const checkout = await result.current.createCheckout({
      items: [{ sku: 'abc' }],
      successUrl: 'https://x/success',
      cancelUrl: 'https://x/cancel',
    });
    expect(checkout).toEqual({ url: 'https://checkout.example.com/session/123' });
    expect(result.current.getProviderClient()).toBe(provider.getProviderClient());
  });
});

// ---------------------------------------------------------------------------
// useStorage
// ---------------------------------------------------------------------------

describe('useStorage', () => {
  it('no provider registered -> ready:false + NO_PROVIDER_FOR_CAPABILITY; upload/remove reject', async () => {
    const { result } = renderHook(() => useStorage());

    expect(result.current.ready).toBe(false);
    expect(result.current.error?.code).toBe('NO_PROVIDER_FOR_CAPABILITY');

    await expect(result.current.upload(new Blob(['x']), '/a.png')).rejects.toMatchObject({
      code: 'NO_PROVIDER_FOR_CAPABILITY',
    });
    await expect(result.current.remove('/a.png')).rejects.toMatchObject({
      code: 'NO_PROVIDER_FOR_CAPABILITY',
    });
  });

  it('with a registered provider: upload/remove call through and getProviderClient returns raw client', async () => {
    const provider = makeStorageProvider();
    register(provider);

    const { result } = renderHook(() => useStorage());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const uploaded = await result.current.upload(new Blob(['x']), '/a.png');
    expect(uploaded).toEqual({ url: 'https://cdn.example.com/file.png' });

    await result.current.remove('/a.png');
    expect(provider.implementation.remove).toHaveBeenCalledWith('/a.png');
    expect(result.current.getProviderClient()).toBe(provider.getProviderClient());
  });
});

// ---------------------------------------------------------------------------
// useLive
// ---------------------------------------------------------------------------

describe('useLive', () => {
  it('no provider registered -> ready:false + NO_PROVIDER_FOR_CAPABILITY', () => {
    const { result } = renderHook(() => useLive('room-1', jest.fn()));

    expect(result.current.ready).toBe(false);
    expect(result.current.error?.code).toBe('NO_PROVIDER_FOR_CAPABILITY');
  });

  it('subscribes on mount, delivers events to the callback, and unsubscribes on unmount', () => {
    const { provider, emit, getSubscriberCount } = makeLiveProvider();
    register(provider);

    const received: unknown[] = [];
    const { result, unmount } = renderHook(() => useLive('room-1', (event) => received.push(event)));

    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeNull();
    expect(getSubscriberCount()).toBe(1);

    act(() => {
      emit('room-1', { hello: 'world' });
    });
    expect(received).toEqual([{ hello: 'world' }]);

    unmount();
    expect(getSubscriberCount()).toBe(0);
  });

  it('keeps the callback in a ref so identity changes do not resubscribe', () => {
    const { provider, emit, getSubscriberCount } = makeLiveProvider();
    register(provider);

    const calls: unknown[][] = [];
    const { rerender } = renderHook(({ cb }) => useLive('room-1', cb), {
      initialProps: { cb: (event: unknown) => calls.push(['first', event]) },
    });
    expect(getSubscriberCount()).toBe(1);

    // A brand-new callback identity on rerender must NOT tear down + recreate the subscription.
    rerender({ cb: (event: unknown) => calls.push(['second', event]) });
    expect(getSubscriberCount()).toBe(1);

    act(() => {
      emit('room-1', { n: 1 });
    });
    // The latest callback (from the ref) is the one invoked, not the stale first closure.
    expect(calls).toEqual([['second', { n: 1 }]]);
  });
});

// ---------------------------------------------------------------------------
// Hook-order regression
// ---------------------------------------------------------------------------

describe('hook-order regression — provider registered/unregistered across renders', () => {
  it('useAuth never throws a hook-count error across register/unregister/re-register', async () => {
    const { result, rerender } = renderHook(() => useAuth());
    expect(() => rerender()).not.toThrow();
    expect(result.current.ready).toBe(false);

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = register(makeAuthProvider());
    });
    expect(() => rerender()).not.toThrow();
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      unregister?.();
    });
    expect(() => rerender()).not.toThrow();
    await waitFor(() => expect(result.current.ready).toBe(false));

    act(() => {
      register(makeAuthProvider());
    });
    expect(() => rerender()).not.toThrow();
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('useLive never throws a hook-count error across register/unregister/re-register', () => {
    const { provider, getSubscriberCount } = makeLiveProvider();

    const { result, rerender } = renderHook(() => useLive('room-x', jest.fn()));
    expect(() => rerender()).not.toThrow();
    expect(result.current.ready).toBe(false);

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = register(provider);
    });
    expect(() => rerender()).not.toThrow();
    expect(result.current.ready).toBe(true);
    expect(getSubscriberCount()).toBe(1);

    act(() => {
      unregister?.();
    });
    expect(() => rerender()).not.toThrow();
    expect(result.current.ready).toBe(false);
    expect(getSubscriberCount()).toBe(0);
  });
});
