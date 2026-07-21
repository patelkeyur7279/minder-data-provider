/**
 * @jest-environment jsdom
 *
 * MDPD (unified OfflineManager) — THE defect fix.
 *
 * Before: two unrelated classes were both named OfflineManager. ApiClient
 * auto-queued failed requests into a hook-less CORE manager, while
 * configureMinder wired a SEPARATE platform manager that emitted onSync /
 * onConnectivityChange. So `configureMinder({ offline:{enabled:true} })` + an
 * ApiClient whose request failed with a network error NEVER fired onSync for
 * that real, auto-queued failure — hooks only fired for items pushed manually
 * via getOfflineManager().addToQueue().
 *
 * After: there is ONE OfflineManager per configuration. ApiClient reuses the
 * configureMinder-wired instance, routes auto-queued failures into it, and
 * injects its axios instance as the replay executor — so onSync fires with real
 * phases when the queue processes, and onConnectivityChange fires on a flip.
 *
 * These tests construct an ApiClient (NOT a manual addToQueue) and fail the
 * request through the REAL axios interceptor pipeline (via a rejecting adapter),
 * which is what exercises the auto-queue path in apiClient/errors.ts.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { configureMinder, getOfflineManager } from '../src/config/index';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { HttpMethod, StorageType } from '../src/constants/enums';
import { pluginManager, type SyncLifecycleEvent } from '../src/plugins/PluginSystem';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

/** An adapter that rejects every request with an axios-style ERR_NETWORK. */
function rejectingAdapter() {
  return async (config: any) => {
    const err: any = new Error('Network Error');
    err.config = config;
    err.request = {};
    err.code = 'ERR_NETWORK';
    throw err;
  };
}

/** An adapter that resolves with a 200 payload. */
function resolvingAdapter(data: unknown) {
  return async (config: any) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  });
}

describe('MDPD: unified OfflineManager — ApiClient auto-queue drives onSync', () => {
  let syncs: SyncLifecycleEvent[];
  let connectivity: boolean[];

  beforeEach(() => {
    syncs = [];
    connectivity = [];
    setOnline(true);
    pluginManager.register({
      name: 'unified-observer',
      onSync: (e) => syncs.push(e),
      onConnectivityChange: (online) => connectivity.push(online),
    });
  });

  afterEach(async () => {
    pluginManager.unregister('unified-observer');
    await getOfflineManager()?.destroy?.();
  });

  function makeClient(): ApiClient {
    // retries:0 avoids the 1s retry backoff default so the test is fast/deterministic.
    // corsHelper:false mirrors the offline-first mobile configs (RN/Expo default
    // cors off + offline on) where the auto-queue path is exercised — with the CORS
    // helper enabled a network error is reclassified as a CORS error upstream.
    const config = configureMinder({
      apiUrl: 'https://api.example.com',
      routes: { createTodo: { url: '/todos', method: HttpMethod.POST } },
      offline: { enabled: true, autoSync: true },
      corsHelper: { enabled: false },
      performance: { retries: 0 },
    });
    return new ApiClient(config, new AuthManager({ storage: StorageType.MEMORY, tokenKey: 't' }));
  }

  it('(1) a network-failed ApiClient request lands in the WIRED manager and onSync fires on processing', async () => {
    const client = makeClient();
    const mgr = getOfflineManager()!;
    expect(mgr).toBeTruthy();
    await mgr.initialize();

    // ApiClient and configureMinder share ONE manager instance.
    expect((client as unknown as { offlineManager: unknown }).offlineManager).toBe(mgr);

    // Fail the transport with a network error -> auto-queue path in errors.ts.
    client.getAxiosInstance().defaults.adapter = rejectingAdapter();

    await expect(client.request('createTodo', { title: 'x' })).rejects.toBeTruthy();
    await flush();

    // The REAL failed request is now in the unified manager's queue.
    expect(mgr.getQueueSize()).toBe(1);
    expect(mgr.getQueue()[0]).toMatchObject({ method: 'POST', url: '/todos' });

    // Replay succeeds now; onSync fires with real phases.
    client.getAxiosInstance().defaults.adapter = resolvingAdapter({ ok: true });

    await mgr.sync();
    await flush();

    const phases = syncs.map((s) => s.phase);
    expect(phases).toContain('start');
    expect(phases).toContain('success');
    const success = syncs.find((s) => s.phase === 'success')!;
    expect(success.processed).toBe(1);
    expect(mgr.getQueueSize()).toBe(0);
  });

  it('(1b) onConnectivityChange fires on a connectivity flip', async () => {
    makeClient();
    const mgr = getOfflineManager()!;
    await mgr.initialize();
    await flush();
    connectivity.length = 0;

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    await flush();
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await flush();

    expect(connectivity).toEqual([false, true]);
  });

  it('(2) replay re-dispatches through the executor; onSync error phase fires when replay fails', async () => {
    const client = makeClient();
    const mgr = getOfflineManager()!;
    await mgr.initialize();

    // First: queue a genuinely-failed request.
    client.getAxiosInstance().defaults.adapter = rejectingAdapter();
    await expect(client.request('createTodo', { title: 'y' })).rejects.toBeTruthy();
    await flush();
    expect(mgr.getQueueSize()).toBe(1);

    // Replay keeps failing -> executor re-dispatches through axios and rejects.
    const adapterSpy = jest.fn(rejectingAdapter());
    client.getAxiosInstance().defaults.adapter = adapterSpy as any;

    await mgr.sync();
    await flush();

    // The executor (client axios instance) actually attempted the re-send, and
    // the replay attempt was NOT itself re-auto-queued (still exactly one item).
    expect(adapterSpy).toHaveBeenCalled();
    const phases = syncs.map((s) => s.phase);
    expect(phases).toContain('start');
    expect(phases).toContain('error');
    expect(phases).not.toContain('success');
    // maxRetries default is 3, so after one failed sync it is retained (retries=1),
    // and NOT duplicated by the replay's own network error.
    expect(mgr.getQueueSize()).toBe(1);
  });

  it('(3) exactly ONE window online/offline listener registration for the active manager', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');

    makeClient();
    const mgr = getOfflineManager()!;
    await mgr.initialize();
    await flush();

    const online = addSpy.mock.calls.filter((c) => c[0] === 'online').length;
    const offline = addSpy.mock.calls.filter((c) => c[0] === 'offline').length;
    expect(online).toBe(1);
    expect(offline).toBe(1);

    addSpy.mockRestore();
  });
});
