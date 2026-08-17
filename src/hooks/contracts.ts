"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCapabilityProvider, subscribeCapabilityRegistry } from '../contracts/registry.js';
import type { Capability, CapabilityProvider } from '../contracts/registry.js';
import type { AuthContract, PaymentsContract, StorageContract, LiveContract } from '../contracts/types.js';
import { MinderError } from '../errors/MinderError.js';

// ---------------------------------------------------------------------------
// Capability Contract Hooks
//
// All four hooks below follow the same shape:
//   1. Subscribe to the capability registry via `useSyncExternalStore` so the component
//      re-renders whenever a provider for the relevant capability is registered/unregistered
//      (including AFTER mount — no provider at mount time is not a permanent state).
//   2. Every hook call is UNCONDITIONAL — same hook count/order on every render regardless of
//      whether a provider is currently registered. `react-hooks/rules-of-hooks` is an eslint
//      ERROR in this repo; branching on provider presence must happen in the hook BODY
//      (computing a result), never by skipping a hook call.
//   3. No provider registered -> `ready: false`, a `MinderError` (code
//      'NO_PROVIDER_FOR_CAPABILITY') describing which capability is missing, and any
//      action methods (signOut/createCheckout/upload/remove/getProviderClient) become safe
//      no-ops that THROW that same error only when actually called (never during render).
//
// `getSnapshot` returns the `CapabilityProvider` object itself (the exact reference stored in
// the registry's Map), not a derived boolean/copy. `registerCapabilityProvider` /
// `unregister()` only ever replace or delete that Map entry — they never mutate a provider
// object in place — so the reference is stable across renders that don't change the
// registration, and `Object.is` comparison inside `useSyncExternalStore` correctly treats
// "nothing changed" as "nothing changed" (no needless re-renders) while still catching real
// register/unregister/replace transitions. The snapshot getters are defined once at module
// scope (not per-render closures) purely for tidiness; identity stability of `getSnapshot`
// itself is not required by `useSyncExternalStore`; only the identity of `subscribe` matters
// for avoiding resubscribes, and `subscribeCapabilityRegistry` is imported directly so that is
// already stable. The same snapshot function is passed as `getServerSnapshot` because the
// registry is plain module state with no server/client divergence of its own (a provider must
// still be registered before use during SSR) — this avoids hydration-mismatch warnings.
// ---------------------------------------------------------------------------

function getAuthSnapshot(): CapabilityProvider<AuthContract> | null {
  return getCapabilityProvider<AuthContract>('auth');
}

function getPaymentsSnapshot(): CapabilityProvider<PaymentsContract> | null {
  return getCapabilityProvider<PaymentsContract>('payments');
}

function getStorageSnapshot(): CapabilityProvider<StorageContract> | null {
  return getCapabilityProvider<StorageContract>('storage');
}

function getLiveSnapshot(): CapabilityProvider<LiveContract> | null {
  return getCapabilityProvider<LiveContract>('live');
}

function noProviderError(capability: Capability): MinderError {
  return new MinderError(
    `No provider registered for capability '${capability}'. Install a certified provider or ` +
      'register a custom adapter — see docs/providers/CATALOG.md',
    'NO_PROVIDER_FOR_CAPABILITY',
    500
  );
}

// ---------------------------------------------------------------------------
// useAuth
// ---------------------------------------------------------------------------

export interface UseAuthReturn {
  ready: boolean;
  error: MinderError | null;
  session: { userId: string; raw: unknown } | null;
  signOut: () => Promise<void>;
  getProviderClient: () => unknown;
}

export function useAuth(): UseAuthReturn {
  const provider = useSyncExternalStore(subscribeCapabilityRegistry, getAuthSnapshot, getAuthSnapshot);
  const [session, setSession] = useState<{ userId: string; raw: unknown } | null>(null);

  useEffect(() => {
    if (!provider) {
      setSession(null);
      return;
    }

    let cancelled = false;
    provider.implementation
      .getSession()
      .then((result) => {
        if (!cancelled) {
          setSession(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // Refetch whenever the registered provider's identity changes (register/replace/unregister).
  }, [provider]);

  const signOut = useCallback(async () => {
    if (!provider) {
      throw noProviderError('auth');
    }
    await provider.implementation.signOut();
    setSession(null);
  }, [provider]);

  const getProviderClient = useCallback((): unknown => {
    if (!provider) {
      throw noProviderError('auth');
    }
    return provider.getProviderClient();
  }, [provider]);

  return {
    ready: provider !== null,
    error: provider ? null : noProviderError('auth'),
    session,
    signOut,
    getProviderClient,
  };
}

// ---------------------------------------------------------------------------
// useCheckout
// ---------------------------------------------------------------------------

export interface UseCheckoutReturn {
  ready: boolean;
  error: MinderError | null;
  createCheckout: (input: { items: unknown[]; successUrl: string; cancelUrl: string }) => Promise<{ url: string }>;
  getProviderClient: () => unknown;
}

export function useCheckout(): UseCheckoutReturn {
  const provider = useSyncExternalStore(subscribeCapabilityRegistry, getPaymentsSnapshot, getPaymentsSnapshot);

  const createCheckout = useCallback(
    async (input: { items: unknown[]; successUrl: string; cancelUrl: string }): Promise<{ url: string }> => {
      if (!provider) {
        throw noProviderError('payments');
      }
      return provider.implementation.createCheckout(input);
    },
    [provider]
  );

  const getProviderClient = useCallback((): unknown => {
    if (!provider) {
      throw noProviderError('payments');
    }
    return provider.getProviderClient();
  }, [provider]);

  return {
    ready: provider !== null,
    error: provider ? null : noProviderError('payments'),
    createCheckout,
    getProviderClient,
  };
}

// ---------------------------------------------------------------------------
// useStorage
// ---------------------------------------------------------------------------

export interface UseStorageReturn {
  ready: boolean;
  error: MinderError | null;
  upload: (file: Blob | { uri: string }, path: string) => Promise<{ url: string }>;
  remove: (path: string) => Promise<void>;
  getProviderClient: () => unknown;
}

export function useStorage(): UseStorageReturn {
  const provider = useSyncExternalStore(subscribeCapabilityRegistry, getStorageSnapshot, getStorageSnapshot);

  const upload = useCallback(
    async (file: Blob | { uri: string }, path: string): Promise<{ url: string }> => {
      if (!provider) {
        throw noProviderError('storage');
      }
      return provider.implementation.upload(file, path);
    },
    [provider]
  );

  const remove = useCallback(
    async (path: string): Promise<void> => {
      if (!provider) {
        throw noProviderError('storage');
      }
      return provider.implementation.remove(path);
    },
    [provider]
  );

  const getProviderClient = useCallback((): unknown => {
    if (!provider) {
      throw noProviderError('storage');
    }
    return provider.getProviderClient();
  }, [provider]);

  return {
    ready: provider !== null,
    error: provider ? null : noProviderError('storage'),
    upload,
    remove,
    getProviderClient,
  };
}

// ---------------------------------------------------------------------------
// useLive
// ---------------------------------------------------------------------------

export interface UseLiveReturn {
  ready: boolean;
  error: MinderError | null;
}

export function useLive(channel: string, cb: (event: unknown) => void): UseLiveReturn {
  const provider = useSyncExternalStore(subscribeCapabilityRegistry, getLiveSnapshot, getLiveSnapshot);

  // Keep the latest callback in a ref so identity changes on `cb` don't tear down and
  // re-establish the subscription — only a provider or channel change should do that.
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  useEffect(() => {
    if (!provider) {
      return;
    }
    const unsubscribe = provider.implementation.subscribe(channel, (event: unknown) => {
      cbRef.current(event);
    });
    return () => {
      unsubscribe();
    };
  }, [provider, channel]);

  return {
    ready: provider !== null,
    error: provider ? null : noProviderError('live'),
  };
}
