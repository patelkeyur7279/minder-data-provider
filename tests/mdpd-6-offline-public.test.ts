/**
 * @jest-environment jsdom
 *
 * MDPD-6 (offline portion) — onSync / onConnectivityChange fired only from the
 * internal platform OfflineManager, which was NOT publicly exported and NOT
 * instantiated by configureMinder. So `configureMinder({ offline: { enabled:true } })`
 * plus a plugin observed nothing.
 *
 * Fix: export the manager (+ a getOfflineManager() accessor), instantiate/wire it
 * from the config pipeline when offline.enabled, and destroy the previous one on
 * re-configure (no duplicate window listeners).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  configureMinder,
  getOfflineManager,
  OfflineManager,
} from '../src/config/index';
import { pluginManager, type SyncLifecycleEvent } from '../src/plugins/PluginSystem';
// Compile-time proof that both symbols are reachable from the public package root.
import {
  getOfflineManager as rootGetOfflineManager,
  OfflineManager as RootOfflineManager,
} from '../src/index';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

describe('MDPD-6: offline plugin hooks reachable via public configureMinder', () => {
  let connectivity: boolean[];
  let syncs: SyncLifecycleEvent[];

  beforeEach(() => {
    connectivity = [];
    syncs = [];
    setOnline(true);
    pluginManager.register({
      name: 'offline-observer',
      onConnectivityChange: (online) => connectivity.push(online),
      onSync: (e) => syncs.push(e),
    });
  });

  afterEach(async () => {
    pluginManager.unregister('offline-observer');
    // Tear down any manager wired by a test so listeners don't leak between tests.
    await getOfflineManager()?.destroy?.();
  });

  it('(c) exports OfflineManager + getOfflineManager, and configureMinder wires an instance', async () => {
    expect(typeof OfflineManager).toBe('function');
    expect(typeof getOfflineManager).toBe('function');
    // Same symbols reachable from the package root.
    expect(rootGetOfflineManager).toBe(getOfflineManager);
    expect(RootOfflineManager).toBe(OfflineManager);
    expect(getOfflineManager()).toBeNull();

    configureMinder({ apiUrl: 'https://api.example.com', offline: { enabled: true } });
    const mgr = getOfflineManager();
    expect(mgr).toBeInstanceOf(OfflineManager);
    await mgr!.initialize();
  });

  it('(a) window online/offline transitions fire onConnectivityChange exactly once each', async () => {
    configureMinder({ apiUrl: 'https://api.example.com', offline: { enabled: true } });
    await getOfflineManager()!.initialize();
    await flush();
    connectivity.length = 0; // ignore any initial-state emission

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    await flush();

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(connectivity).toEqual([false, true]);
  });

  it('(a2) re-configure destroys the prior manager — no duplicate connectivity emissions', async () => {
    configureMinder({ apiUrl: 'https://api.example.com', offline: { enabled: true } });
    await getOfflineManager()!.initialize();
    const first = getOfflineManager();

    // Re-configure: a new manager replaces the old one, whose window listeners
    // must have been removed on destroy.
    configureMinder({ apiUrl: 'https://api.example.com', offline: { enabled: true } });
    await getOfflineManager()!.initialize();
    expect(getOfflineManager()).not.toBe(first);
    await flush();
    connectivity.length = 0;

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    await flush();

    // Exactly one emission — the destroyed manager's listener is gone.
    expect(connectivity).toEqual([false]);
  });

  it('(b) a queued action processed on reconnect fires onSync with the documented shape', async () => {
    const prevFetch = (global as any).fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ ok: true }),
    });
    (global as any).fetch = fetchMock;

    configureMinder({ apiUrl: 'https://api.example.com', offline: { enabled: true, autoSync: true } });
    const mgr = getOfflineManager()!;
    await mgr.initialize();

    await mgr.addToQueue('POST', 'https://api.example.com/todos', { body: { title: 'x' } });
    await mgr.sync();
    await flush();

    const phases = syncs.map((s) => s.phase);
    expect(phases).toContain('start');
    expect(phases).toContain('success');

    const success = syncs.find((s) => s.phase === 'success')!;
    expect(typeof success.timestamp).toBe('number');
    expect(success.processed).toBe(1);
    expect(typeof success.pending).toBe('number');

    (global as any).fetch = prevFetch;
  });
});
