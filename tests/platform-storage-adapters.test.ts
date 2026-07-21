/**
 * Wave H (H-01): reliability tests for the platform-specific storage adapters —
 * the actual mobile/desktop delta of the `/expo`, `/native`, `/electron`
 * entries, previously at ~4-6% coverage because their backing modules
 * (electron-store / expo-secure-store / @react-native-async-storage) are
 * uninstalled optional peers.
 *
 * Each backing module is virtual-mocked with a working in-memory fake, so the
 * adapter's real logic (CRUD, TTL wrap/unwrap + expiry, namespace prefixing,
 * enumeration, graceful degradation when the peer is absent) is exercised
 * end-to-end without the native toolchain.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

// ── electron-store fake (sync API: get/set/delete/has/clear/.store/.path) ──
jest.mock(
  'electron-store',
  () => {
    const backing = new Map<string, unknown>();
    const Store = function (this: any) {
      this.get = (k: string) => backing.get(k);
      this.set = (k: string, v: unknown) => backing.set(k, v);
      this.delete = (k: string) => backing.delete(k);
      this.has = (k: string) => backing.has(k);
      this.clear = () => backing.clear();
      Object.defineProperty(this, 'store', {
        get: () => Object.fromEntries(backing),
      });
      this.path = '/fake/minder-cache.json';
      this.onDidChange = () => () => undefined;
      this.openInEditor = () => undefined;
    };
    (Store as any).__reset = () => backing.clear();
    return Store;
  },
  { virtual: true }
);

// ── expo-secure-store fake (async: getItemAsync/setItemAsync/deleteItemAsync) ──
jest.mock(
  'expo-secure-store',
  () => {
    const backing = new Map<string, string>();
    return {
      getItemAsync: async (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItemAsync: async (k: string, v: string) => void backing.set(k, v),
      deleteItemAsync: async (k: string) => void backing.delete(k),
      __reset: () => backing.clear(),
    };
  },
  { virtual: true }
);

// ── async-storage fake (.default with getItem/setItem/removeItem/clear/multi*) ──
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
    };
    return { default: api, ...api };
  },
  { virtual: true }
);

import { ElectronStorageAdapter } from '../src/platform/adapters/storage/ElectronStorageAdapter';
import { ExpoStorageAdapter } from '../src/platform/adapters/storage/ExpoStorageAdapter';
import { NativeStorageAdapter } from '../src/platform/adapters/storage/NativeStorageAdapter';

const resetAll = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('electron-store') as any).__reset();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('expo-secure-store') as any).__reset();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('@react-native-async-storage/async-storage') as any).__reset();
};

// A shared behavioral contract every platform adapter must satisfy.
const adapters: Array<{ name: string; make: (opts?: any) => any }> = [
  { name: 'ElectronStorageAdapter', make: (o) => new ElectronStorageAdapter(o) },
  { name: 'ExpoStorageAdapter', make: (o) => new ExpoStorageAdapter(o) },
  { name: 'NativeStorageAdapter', make: (o) => new NativeStorageAdapter(o) },
];

describe.each(adapters)('$name (platform storage contract)', ({ make }) => {
  beforeEach(resetAll);

  it('round-trips setItem → getItem', async () => {
    const a = make();
    await a.setItem('token', 'abc123');
    expect(await a.getItem('token')).toBe('abc123');
  });

  it('returns null for a missing key', async () => {
    expect(await make().getItem('nope')).toBeNull();
  });

  it('removeItem deletes the value', async () => {
    const a = make();
    await a.setItem('k', 'v');
    await a.removeItem('k');
    expect(await a.getItem('k')).toBeNull();
  });

  it('hasItem reflects presence', async () => {
    const a = make();
    expect(await a.hasItem('k')).toBe(false);
    await a.setItem('k', 'v');
    expect(await a.hasItem('k')).toBe(true);
  });

  it('getAllKeys enumerates stored keys', async () => {
    const a = make();
    await a.setItem('one', '1');
    await a.setItem('two', '2');
    expect((await a.getAllKeys()).sort()).toEqual(['one', 'two']);
  });

  it('clear empties the store', async () => {
    const a = make();
    await a.setItem('a', '1');
    await a.setItem('b', '2');
    await a.clear();
    expect(await a.getAllKeys()).toEqual([]);
  });

  it('expires an item past its TTL and returns null', async () => {
    const a = make();
    await a.setItem('temp', 'v', 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 5));
    expect(await a.getItem('temp')).toBeNull();
  });

  it('honors a non-expired TTL', async () => {
    const a = make();
    await a.setItem('temp', 'v', 60_000);
    expect(await a.getItem('temp')).toBe('v');
  });

  it('isolates keys by namespace', async () => {
    const nsA = make({ namespace: 'appA' });
    const nsB = make({ namespace: 'appB' });
    await nsA.setItem('shared', 'fromA');
    await nsB.setItem('shared', 'fromB');
    expect(await nsA.getItem('shared')).toBe('fromA');
    expect(await nsB.getItem('shared')).toBe('fromB');
    expect((await nsA.getAllKeys())).toEqual(['shared']);
  });
});

// Native-specific batch surface (used by the offline queue on React Native).
describe('NativeStorageAdapter (batch multiGet/multiSet)', () => {
  beforeEach(resetAll);

  it('multiSet then multiGet round-trips a batch, namespace-aware', async () => {
    const a = new NativeStorageAdapter({ namespace: 'ns' });
    await a.multiSet([
      ['k1', 'v1'],
      ['k2', 'v2'],
    ]);
    const got = await a.multiGet(['k1', 'k2', 'missing']);
    const asObj = Object.fromEntries(got);
    expect(asObj.k1).toBe('v1');
    expect(asObj.k2).toBe('v2');
    expect(asObj.missing).toBeNull();
    // keys are stored namespaced but returned unprefixed
    expect((await a.getAllKeys()).sort()).toEqual(['k1', 'k2']);
  });
});

// Electron-specific surface.
describe('ElectronStorageAdapter (electron-specific)', () => {
  beforeEach(resetAll);

  it('exposes the store path and a watch unsubscribe', () => {
    const a = new ElectronStorageAdapter();
    expect(a.getStorePath()).toBe('/fake/minder-cache.json');
    const unsub = a.watch('k', () => undefined);
    expect(typeof unsub).toBe('function');
  });
});

// Graceful degradation: when the optional peer is absent, the adapter must
// no-op safely rather than throw (constructor swallows the require failure).
describe('graceful degradation when the backing peer is unavailable', () => {
  it('ElectronStorageAdapter with no store returns safe empties', async () => {
    const a = new ElectronStorageAdapter();
    (a as any).store = null; // simulate failed require
    await a.setItem('k', 'v');
    expect(await a.getItem('k')).toBeNull();
    expect(await a.hasItem('k')).toBe(false);
    expect(await a.getAllKeys()).toEqual([]);
    expect(await a.getSize()).toBe(0);
    expect(a.getStorePath()).toBeNull();
    await expect(a.clear()).resolves.toBeUndefined();
  });

  it('ExpoStorageAdapter with no SecureStore returns safe empties', async () => {
    const a = new ExpoStorageAdapter();
    (a as any).SecureStore = null;
    await a.setItem('k', 'v');
    expect(await a.getItem('k')).toBeNull();
    expect(await a.getAllKeys()).toEqual([]);
  });

  it('NativeStorageAdapter with no AsyncStorage returns safe empties', async () => {
    const a = new NativeStorageAdapter();
    (a as any).AsyncStorage = null;
    await a.setItem('k', 'v');
    expect(await a.getItem('k')).toBeNull();
    expect(await a.getAllKeys()).toEqual([]);
  });
});
