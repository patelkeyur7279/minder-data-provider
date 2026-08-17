/**
 * @jest-environment jsdom
 *
 * Unified OfflineManager (MDPD) — the two-manager split (a hook-less core
 * manager used by ApiClient auto-queue, and a separate platform manager wired by
 * configureMinder that emitted the plugin hooks) was collapsed into the single
 * platform `OfflineManager`. The old `src/core/OfflineManager` was deleted; this
 * suite now exercises the unified manager's queue / executor-replay / retry
 * contract directly (the shapes ApiClient's auto-queue path adapts onto).
 */
import { describe, it, expect } from '@jest/globals';
import { OfflineManager } from '../src/platform/offline/OfflineManager';

describe('OfflineManager (unified)', () => {
  it('queues a mutation request via addToQueue', async () => {
    const mgr = new OfflineManager({ enabled: true });

    await mgr.addToQueue('POST', '/api/users', { body: { name: 'Test' } });

    expect(mgr.getQueueSize()).toBe(1);
    expect(mgr.getQueue()[0]).toMatchObject({ method: 'POST', url: '/api/users' });
  });

  it('replays queued requests through the injected executor and removes them on success', async () => {
    const mgr = new OfflineManager({ enabled: true });
    const executor = jest.fn().mockResolvedValue({ ok: true });
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('POST', '/api/users', { body: { name: 'Test' } });
    await mgr.sync(); // online by default (networkState.isConnected === true)

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0][0]).toMatchObject({ method: 'POST', url: '/api/users' });
    expect(mgr.getQueueSize()).toBe(0);
  });

  it('retries a failing request up to maxRetries, then drops it', async () => {
    const mgr = new OfflineManager({ enabled: true, maxRetries: 2 });
    const executor = jest.fn().mockRejectedValue(new Error('Network Error'));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('POST', '/api/users', {});

    // First sync: retries -> 1 (< 2), request stays queued.
    await mgr.sync();
    expect(mgr.getQueueSize()).toBe(1);

    // Second sync: retries -> 2 (>= maxRetries), request is dropped.
    await mgr.sync();
    expect(mgr.getQueueSize()).toBe(0);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('falls back to fetch when no executor is injected', async () => {
    const prevFetch = (global as any).fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    (global as any).fetch = fetchMock;

    const mgr = new OfflineManager({ enabled: true });
    await mgr.addToQueue('POST', 'https://api.example.com/users', { body: { a: 1 } });
    await mgr.sync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mgr.getQueueSize()).toBe(0);

    (global as any).fetch = prevFetch;
  });
});
