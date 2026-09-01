/**
 * @jest-environment node
 *
 * P3 — GlobalAuthManager must feature-detect real storage capability instead
 * of inferring it from `typeof window`. React Native aliases `window = global`
 * but defines neither `localStorage` nor `sessionStorage` at all, so the old
 * `typeof window !== 'undefined'` gate let every read/write reach a bare
 * `localStorage.getItem/setItem/removeItem` call, throw a ReferenceError, and
 * be silently swallowed — tokens never persisted on native.
 *
 * This suite reproduces the exact RN shape in Node (`window` defined, aliased
 * to `global`, `localStorage`/`sessionStorage` undefined — the Node
 * `@jest-environment node` default already has no browser Storage globals) and
 * proves persistence now round-trips through the platform storage adapter
 * (AsyncStorage on React Native) instead of silently no-op'ing.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Virtual-mock the RN AsyncStorage peer dependency exactly like
// tests/platform-storage-adapters.test.ts does — it is not an installed
// dependency of this package.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const backing = new Map<string, string>();
    const api = {
      getItem: async (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: async (k: string, v: string) => void backing.set(k, v),
      removeItem: async (k: string) => void backing.delete(k),
      clear: async () => backing.clear(),
      getAllKeys: async () => [...backing.keys()],
      multiGet: async (keys: string[]) => keys.map((k) => [k, backing.get(k) ?? null]),
      multiSet: async (pairs: [string, string][]) => pairs.forEach(([k, v]) => backing.set(k, v)),
      multiRemove: async (keys: string[]) => keys.forEach((k) => backing.delete(k)),
      __reset: () => backing.clear(),
      __backing: backing,
    };
    return { default: api, ...api };
  },
  { virtual: true }
);

import { GlobalAuthManager } from '../src/auth/GlobalAuthManager';
import { PlatformDetector } from '../src/platform/PlatformDetector';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockAsyncStorage = require('@react-native-async-storage/async-storage') as {
  __reset: () => void;
  __backing: Map<string, string>;
};

/**
 * Read a raw value back out of the mocked AsyncStorage backing map. The real
 * adapter namespaces keys (default namespace `minder`, so `tokenKey` becomes
 * `minder:<tokenKey>`) and wraps values in a `{value, createdAt, expiresAt}`
 * envelope (`BaseStorageAdapter.wrapValue`) — this undoes both so the test
 * asserts on the actual persisted token string.
 */
function rawAdapterValue(key: string): string | undefined {
  const wrapped = mockAsyncStorage.__backing.get(`minder:${key}`);
  if (wrapped === undefined) return undefined;
  return JSON.parse(wrapped).value;
}

describe('P3 — GlobalAuthManager on the React Native shape (window exists, no localStorage)', () => {
  let originalWindow: unknown;
  let originalNavigator: PropertyDescriptor | undefined;

  beforeEach(() => {
    mockAsyncStorage.__reset();
    PlatformDetector.reset();

    // The exact RN shape from the defect report: `window` exists (RN aliases
    // window = global) but there is no localStorage/sessionStorage global at
    // all in this Node environment (@jest-environment node ships neither).
    originalWindow = (globalThis as any).window;
    (globalThis as any).window = globalThis;

    // React Native detection marker (PlatformDetector.isReactNative reads
    // navigator.product) so the storage-adapter factory picks AsyncStorage,
    // the same way it would in a real RN app.
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { product: 'ReactNative' },
      configurable: true,
      writable: true,
    });

    expect((globalThis as any).localStorage).toBeUndefined();
    expect((globalThis as any).sessionStorage).toBeUndefined();
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as any).navigator;
    }
    PlatformDetector.reset();
  });

  it('construction never throws (control: the pre-fix bug only swallowed the ReferenceError, it did not crash)', () => {
    expect(() => new GlobalAuthManager({ storage: 'localStorage' })).not.toThrow();
  });

  it('setToken() actually persists via the platform adapter (AsyncStorage), not silently dropped', async () => {
    const mgr = new GlobalAuthManager({ storage: 'localStorage' });
    await mgr.ready;

    await mgr.setToken('rn-token-123');

    expect(mgr.getToken()).toBe('rn-token-123');
    // Proves the write actually reached AsyncStorage instead of throwing a
    // caught-and-swallowed ReferenceError on a bare `localStorage` reference.
    expect(rawAdapterValue('minder_auth_token')).toBe('rn-token-123');
  });

  it('round-trips across a simulated app restart (new instance restores from AsyncStorage)', async () => {
    const first = new GlobalAuthManager({ storage: 'localStorage' });
    await first.ready;
    await first.setToken('restart-survives-me');

    // Simulate a cold app relaunch: a brand new instance, same backing store.
    const second = new GlobalAuthManager({ storage: 'localStorage' });
    await second.ready; // native restore is necessarily async (no sync AsyncStorage API)

    expect(second.getToken()).toBe('restart-survives-me');
    expect(second.isAuthenticated()).toBe(true);
  });

  it('clearAuth() removes the token from the platform adapter', async () => {
    const mgr = new GlobalAuthManager({ storage: 'localStorage' });
    await mgr.ready;
    await mgr.setToken('to-be-cleared');
    expect(rawAdapterValue('minder_auth_token')).toBe('to-be-cleared');

    await mgr.clearAuth();

    expect(mgr.getToken()).toBeNull();
    expect(rawAdapterValue('minder_auth_token')).toBeUndefined();
  });

  it('setRefreshToken() also persists via the platform adapter', async () => {
    const mgr = new GlobalAuthManager({ storage: 'localStorage' });
    await mgr.ready;
    await mgr.setRefreshToken('refresh-abc');

    expect(mgr.getRefreshToken()).toBe('refresh-abc');
    expect(rawAdapterValue('minder_refresh_token')).toBe('refresh-abc');
  });

  it('storage: "memory" never touches the platform adapter (unchanged behavior)', async () => {
    const mgr = new GlobalAuthManager({ storage: 'memory' });
    await mgr.setToken('mem-token');

    expect(mgr.getToken()).toBe('mem-token');
    expect(mockAsyncStorage.__backing.size).toBe(0);
  });
});

// The jsdom (real browser Storage) path is unmodified and already covered by
// tests/global-auth-jwt.test.ts and the other existing GlobalAuthManager
// suites (auth-debug, auth-security-audit, comprehensive-framework,
// useMinder-enhancements) — all still pass under `@jest-environment jsdom`
// with no changes required (see report).
