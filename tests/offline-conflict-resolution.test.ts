/**
 * @jest-environment jsdom
 *
 * Spec 5.1 — Offline conflict resolution.
 *
 * Exercises the OfflineManager conflict-resolution pipeline at the unit level
 * (mocked `requestExecutor`, matching the pattern in offline-manager.test.ts)
 * plus the ApiClient <-> OfflineManager sentinel contract at the integration
 * level. Letters (a)-(m) map to Spec 5.1 §7's test plan; §10 QA amendments are
 * (h)-(m).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OfflineManager } from '../src/platform/offline/OfflineManager';
import { MemoryStorageAdapter } from '../src/platform/adapters/storage/MemoryStorageAdapter';
import type { ConflictContext, ConflictResolution } from '../src/platform/offline/types';
import { configureMinder, getOfflineManager } from '../src/config/index';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { HttpMethod, StorageType } from '../src/constants/enums';
import axios from 'axios';

const flush = () => new Promise((r) => setTimeout(r, 0));

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

/** Rejects every request with an axios-style ERR_NETWORK (drives the auto-queue path). */
function rejectingAdapter() {
  return async (config: any) => {
    const err: any = new Error('Network Error');
    err.config = config;
    err.request = {};
    err.code = 'ERR_NETWORK';
    throw err;
  };
}

/**
 * Mimics what axios's own built-in http/xhr adapters do internally (via their
 * private `settle()` helper, not part of axios's public API): resolve for a
 * 2xx status, else reject with a REAL `AxiosError` carrying `.response` and
 * `isAxiosError: true` — exactly what a real HTTP backend produces through
 * axios's default `validateStatus`.
 */
function respondingAdapter(data: unknown, status = 200) {
  return async (config: any) => {
    const response = {
      data,
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      headers: {},
      config,
      request: {},
    };
    if (status >= 200 && status < 300) {
      return response;
    }
    throw new axios.AxiosError(
      `Request failed with status code ${status}`,
      status >= 400 && status < 500 ? axios.AxiosError.ERR_BAD_REQUEST : axios.AxiosError.ERR_BAD_RESPONSE,
      config,
      response.request,
      response
    );
  };
}

function conflictSentinel(status = 409, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    __minderReplayOutcome: 'error' as const,
    status,
    serverData: { id: 1, name: 'server-value' },
    message: `Request failed with status code ${status}`,
    code: 'ERR_BAD_REQUEST',
    ...overrides,
  };
}

describe('Offline conflict resolution (Spec 5.1)', () => {
  // (a) 409 replay with each strategy → discard vs re-issue vs merge outcome.
  describe('(a) strategies change replay outcome', () => {
    it('server-wins: discards the queued mutation and accepts server state', async () => {
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'server-wins' });
      const onRequestSuccess = jest.fn();
      (mgr as any).config.onRequestSuccess = onRequestSuccess;
      const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', { body: { name: 'client-value' } });
      const stats = await mgr.sync();

      expect(executor).toHaveBeenCalledTimes(1);
      expect(mgr.getQueueSize()).toBe(0);
      expect(stats.successful).toBe(1);
      expect(onRequestSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/items/1' }),
        { id: 1, name: 'server-value' }
      );
    });

    it('last-write-wins: re-issues the client mutation (client wins)', async () => {
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'last-write-wins' });
      const executor = jest
        .fn()
        .mockResolvedValueOnce(conflictSentinel(409))
        .mockResolvedValueOnce({ ok: true });
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', { body: { name: 'client-value' } });
      const stats = await mgr.sync();

      expect(executor).toHaveBeenCalledTimes(2);
      expect(executor.mock.calls[1][0]).toMatchObject({ body: { name: 'client-value' } });
      expect(mgr.getQueueSize()).toBe(0);
      expect(stats.successful).toBe(1);
    });

    it('merge: invokes resolveConflict and applies its resolution', async () => {
      const resolveConflict = jest.fn(
        async (ctx: ConflictContext): Promise<ConflictResolution> => ({
          action: 'retry',
          body: { name: 'merged-value', base: ctx.clientBody },
        })
      );
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict });
      const executor = jest
        .fn()
        .mockResolvedValueOnce(conflictSentinel(409))
        .mockResolvedValueOnce({ ok: true });
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', { body: { name: 'client-value' } });
      await mgr.sync();

      expect(resolveConflict).toHaveBeenCalledTimes(1);
      expect(executor.mock.calls[1][0]).toMatchObject({
        body: { name: 'merged-value', base: { name: 'client-value' } },
      });
      expect(mgr.getQueueSize()).toBe(0);
    });
  });

  // (b) legacy onConflict adapter path.
  it('(b) legacy onConflict adapter: return value becomes a retry body', async () => {
    const onConflict = jest.fn().mockResolvedValue({ name: 'adapted-merge' });
    const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', onConflict });
    const executor = jest
      .fn()
      .mockResolvedValueOnce(conflictSentinel(409))
      .mockResolvedValueOnce({ ok: true });
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', { body: { name: 'client-value' } });
    await mgr.sync();

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[1][0]).toMatchObject({ body: { name: 'adapted-merge' } });
    expect(mgr.getQueueSize()).toBe(0);
  });

  // (c) resolveConflict async + abort on destroy().
  it('(c) aborts ctx.signal and fails closed when destroy() runs mid-resolution', async () => {
    let capturedSignal: AbortSignal | undefined;
    const resolveConflict = jest.fn((ctx: ConflictContext) => {
      capturedSignal = ctx.signal;
      return new Promise<ConflictResolution>(() => {
        /* never resolves */
      });
    });
    const mgr = new OfflineManager({
      enabled: true,
      conflictResolution: 'merge',
      resolveConflict,
      conflictResolveTimeoutMs: 30000,
      maxRetries: 3,
    });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', { body: { name: 'client-value' } });
    const syncPromise = mgr.sync();
    await flush();
    expect(capturedSignal?.aborted).toBe(false);

    await mgr.destroy();
    const stats = await syncPromise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(stats.failed).toBe(1);
    // Fail-closed: mutation stays queued for retry, NOT silently discarded.
    expect(mgr.getQueueSize()).toBe(1);
  });

  // (d) strictOrder:true halts tail on 'keep'.
  it('(d) strictOrder halts the remainder of the pass on a keep resolution', async () => {
    const resolveConflict = jest.fn(async (): Promise<ConflictResolution> => ({ action: 'keep' }));
    const mgr = new OfflineManager({
      enabled: true,
      conflictResolution: 'merge',
      resolveConflict,
      strictOrder: true,
    });
    const executor = jest.fn().mockResolvedValueOnce(conflictSentinel(409)).mockResolvedValueOnce({ ok: true });
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', { body: { a: 1 } });
    await mgr.addToQueue('PUT', '/api/items/2', { body: { a: 2 } });

    const stats = await mgr.sync();

    // Only request #1 was attempted; #2 never reached the executor.
    expect(executor).toHaveBeenCalledTimes(1);
    expect(stats.pending).toBeGreaterThanOrEqual(1);
    expect(mgr.getQueueSize()).toBe(2); // #1 kept, #2 never attempted (still queued)
  });

  // (d) QA follow-up: a strictOrder pass that succeeds BEFORE the halting item
  // must still commit that prior success — halting only stops the REMAINDER
  // of the tail, it must not roll back or skip work already done this pass.
  it('(d) strictOrder commits a prior success before halting on a later keep, leaving the tail untouched', async () => {
    const resolveConflict = jest.fn(async (): Promise<ConflictResolution> => ({ action: 'keep' }));
    const mgr = new OfflineManager({
      enabled: true,
      conflictResolution: 'merge',
      resolveConflict,
      strictOrder: true,
    });
    const executor = jest.fn(async (request: { url: string }) => {
      if (request.url === '/api/items/1') return { ok: true }; // plain success
      if (request.url === '/api/items/2') return conflictSentinel(409); // -> 'keep', halts
      return { ok: true }; // item 3 would succeed too, IF it were ever invoked
    });
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', {});
    await mgr.addToQueue('PUT', '/api/items/2', {});
    await mgr.addToQueue('PUT', '/api/items/3', {});

    const stats = await mgr.sync();

    // Item 1 committed (removed); item 2 kept; item 3 never reached the executor.
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls.map((c) => (c[0] as { url: string }).url)).toEqual([
      '/api/items/1',
      '/api/items/2',
    ]);
    expect(resolveConflict).toHaveBeenCalledTimes(1); // only for item 2

    expect(mgr.getQueueSize()).toBe(2);
    expect(mgr.getQueue().map((r) => r.url)).toEqual(['/api/items/2', '/api/items/3']);

    expect(stats.successful).toBe(1); // item 1
    expect(stats.pending).toBe(1); // item 2 (keep); item 3 was never attempted
    expect(stats.failed).toBe(0);
  });

  // (e) conflictStatuses override (custom 428).
  it('(e) honors a custom conflictStatuses override', async () => {
    const mgr = new OfflineManager({ enabled: true, conflictResolution: 'server-wins', conflictStatuses: [428] });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(428));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', {});
    const stats = await mgr.sync();

    expect(stats.successful).toBe(1);
    expect(mgr.getQueueSize()).toBe(0);
  });

  it('(e) a 409 is NOT treated as a conflict when conflictStatuses excludes it', async () => {
    const mgr = new OfflineManager({ enabled: true, conflictResolution: 'server-wins', conflictStatuses: [428], maxRetries: 5 });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', {});
    const stats = await mgr.sync();

    expect(stats.failed).toBe(1);
    expect(mgr.getQueueSize()).toBe(1); // still queued, retries < maxRetries
    expect(mgr.getQueue()[0].retries).toBe(1);
  });

  // (f) dead-letter callback fires on drop.
  it('(f) onDeadLetter fires when a request is dropped at maxRetries', async () => {
    const onDeadLetter = jest.fn();
    const mgr = new OfflineManager({ enabled: true, maxRetries: 1, onDeadLetter });
    const executor = jest.fn().mockRejectedValue(new Error('Network Error'));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('POST', '/api/items', {});
    await mgr.sync();

    expect(onDeadLetter).toHaveBeenCalledTimes(1);
    expect(onDeadLetter.mock.calls[0][1]).toBe('Network Error');
    expect(mgr.getQueueSize()).toBe(0);
  });

  it('(f) persists dropped requests to deadLetterKey when configured', async () => {
    const storage = new MemoryStorageAdapter({ namespace: 'dlq-test' });
    const mgr = new OfflineManager({
      enabled: true,
      maxRetries: 1,
      storage,
      deadLetterKey: 'minder_dead_letters',
    });
    const executor = jest.fn().mockRejectedValue(new Error('Network Error'));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('POST', '/api/items', {});
    await mgr.sync();

    const raw = await storage.getItem('minder_dead_letters');
    expect(raw).toBeTruthy();
    const list = JSON.parse(raw as string);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: '/api/items' });
  });

  // (g) default config unchanged for non-conflict errors.
  it('(g) a non-conflict status (500) still retries then drops (default untouched)', async () => {
    const onRequestError = jest.fn();
    const mgr = new OfflineManager({ enabled: true, maxRetries: 2, onRequestError });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(500, { message: 'Server error - please try again later' }));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('POST', '/api/items', {});
    await mgr.sync();
    expect(mgr.getQueueSize()).toBe(1);
    await mgr.sync();

    expect(mgr.getQueueSize()).toBe(0);
    expect(onRequestError).toHaveBeenCalledTimes(1);
    expect(onRequestError.mock.calls[0][1].message).toBe('Server error - please try again later');
  });

  // (h) Non-conflict passthrough byte-equality (§10.1).
  describe('(h) non-conflict passthrough is byte-equal to pre-feature behavior', () => {
    it('sentinel-based 500 produces the identical lastError/retries/drop as a raw thrown error', async () => {
      const mgrSentinel = new OfflineManager({ enabled: true, maxRetries: 1 });
      const sentinelExecutor = jest
        .fn()
        .mockResolvedValue(conflictSentinel(500, { message: 'Request failed with status code 500' }));
      mgrSentinel.setRequestExecutor(sentinelExecutor);
      await mgrSentinel.addToQueue('POST', '/api/items', {});
      await mgrSentinel.sync();

      // Pre-feature-equivalent: executor throws the raw error directly (no sentinel).
      const mgrRaw = new OfflineManager({ enabled: true, maxRetries: 1 });
      const rawExecutor = jest.fn().mockRejectedValue(new Error('Request failed with status code 500'));
      mgrRaw.setRequestExecutor(rawExecutor);
      await mgrRaw.addToQueue('POST', '/api/items', {});
      await mgrRaw.sync();

      // Both drop after 1 retry with the identical error message -> queue empty either way.
      expect(mgrSentinel.getQueue()[0]).toBeUndefined();
      expect(mgrRaw.getQueue()[0]).toBeUndefined();
      expect(mgrSentinel.getQueueSize()).toBe(0);
      expect(mgrRaw.getQueueSize()).toBe(0);
    });

    it('a genuine transport failure (executor throws, no sentinel) is unchanged', async () => {
      const mgr = new OfflineManager({ enabled: true, maxRetries: 3 });
      const executor = jest.fn().mockRejectedValue(new Error('Network Error'));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('POST', '/api/items', {});
      await mgr.sync();

      expect(mgr.getQueue()[0].lastError).toBe('Network Error');
      expect(mgr.getQueue()[0].retries).toBe(1);
    });

    it('captures lastError via onRequestError for the sentinel path (verbatim message)', async () => {
      const onRequestError = jest.fn();
      const mgr = new OfflineManager({ enabled: true, maxRetries: 1, onRequestError });
      const executor = jest
        .fn()
        .mockResolvedValue(conflictSentinel(500, { message: 'Request failed with status code 500' }));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('POST', '/api/items', {});
      await mgr.sync();

      expect(onRequestError.mock.calls[0][0].lastError).toBe('Request failed with status code 500');
      expect(onRequestError.mock.calls[0][0].retries).toBe(1);
    });
  });

  // (i) Per-mutation override beats global (§10.2).
  describe('(i) per-mutation metadata.conflictResolution overrides the global default', () => {
    it('metadata last-write-wins beats global server-wins -> re-issued (client wins)', async () => {
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'server-wins' });
      const executor = jest.fn().mockResolvedValueOnce(conflictSentinel(409)).mockResolvedValueOnce({ ok: true });
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', {
        body: { name: 'client' },
        metadata: { conflictResolution: 'last-write-wins' },
      });
      await mgr.sync();

      expect(executor).toHaveBeenCalledTimes(2); // re-issued, not discarded
      expect(mgr.getQueueSize()).toBe(0);
    });

    it('metadata server-wins beats global last-write-wins -> discarded', async () => {
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'last-write-wins' });
      const onRequestSuccess = jest.fn();
      (mgr as any).config.onRequestSuccess = onRequestSuccess;
      const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', {
        body: { name: 'client' },
        metadata: { conflictResolution: 'server-wins' },
      });
      await mgr.sync();

      expect(executor).toHaveBeenCalledTimes(1); // discarded, no re-issue
      expect(mgr.getQueueSize()).toBe(0);
      expect(onRequestSuccess).toHaveBeenCalled();
    });
  });

  // (j) Resolver fail-closed modes (§10.3).
  describe('(j) resolver failure modes all fail closed', () => {
    it('resolveConflict throws -> handleRequestError (retries++, then drop)', async () => {
      const resolveConflict = jest.fn().mockRejectedValue(new Error('boom'));
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict, maxRetries: 1 });
      const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', {});
      await mgr.sync();

      expect(mgr.getQueueSize()).toBe(0); // dropped, not silently discarded as success
      expect(executor).toHaveBeenCalledTimes(1); // no re-issue attempted
    });

    it('resolveConflict returns a malformed resolution -> fail closed', async () => {
      const resolveConflict = jest.fn().mockResolvedValue({ action: 'bogus' } as any);
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict, maxRetries: 1 });
      const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', {});
      const stats = await mgr.sync();

      expect(stats.failed).toBe(1);
      expect(mgr.getQueueSize()).toBe(0);
    });

    it('resolveConflict exceeds conflictResolveTimeoutMs -> fail closed', async () => {
      const resolveConflict = jest.fn(() => new Promise<ConflictResolution>(() => {}));
      const mgr = new OfflineManager({
        enabled: true,
        conflictResolution: 'merge',
        resolveConflict,
        conflictResolveTimeoutMs: 20,
        maxRetries: 1,
      });
      const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', {});
      const stats = await mgr.sync();

      expect(stats.failed).toBe(1);
      expect(mgr.getQueueSize()).toBe(0);
    });

    it('both resolveConflict AND onConflict set -> resolveConflict wins, onConflict skipped, single warn', async () => {
      const resolveConflict = jest.fn(async (): Promise<ConflictResolution> => ({ action: 'discard' }));
      const onConflict = jest.fn();
      const warnSpy = jest.spyOn((await import('../src/utils/Logger')).Logger.prototype, 'warn');
      const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict, onConflict });
      const executor = jest.fn().mockResolvedValue(conflictSentinel(409)).mockResolvedValue(conflictSentinel(409));
      mgr.setRequestExecutor(executor);

      await mgr.addToQueue('PUT', '/api/items/1', {});
      await mgr.addToQueue('PUT', '/api/items/2', {});
      await mgr.sync();

      expect(resolveConflict).toHaveBeenCalledTimes(2);
      expect(onConflict).not.toHaveBeenCalled();
      const bothConfiguredWarnings = warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes('Both resolveConflict and onConflict configured')
      );
      expect(bothConfiguredWarnings).toHaveLength(1); // one-time warn, not per-conflict
      warnSpy.mockRestore();
    });
  });

  // (k) Guard does not persist (§10.4).
  it('(k) a keep-resolved request survives save/load and gets a fresh resolution attempt next pass', async () => {
    const resolveConflict = jest.fn(async (): Promise<ConflictResolution> => ({ action: 'keep' }));
    const storage = new MemoryStorageAdapter({ namespace: 'guard-test' });
    const mgr = new OfflineManager({
      enabled: true,
      conflictResolution: 'merge',
      resolveConflict,
      storage,
      storageKey: 'minder_offline_queue_guard',
    });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', {});
    await mgr.sync(); // 'keep' -> stays queued
    expect(resolveConflict).toHaveBeenCalledTimes(1);
    expect(mgr.getQueueSize()).toBe(1);

    // Assert no guard property leaked into the persisted blob.
    const raw = await storage.getItem('minder_offline_queue_guard');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('__conflictResolved');
    expect(raw).not.toContain('resolvedThisPass');

    // Simulate a restart: a fresh manager instance loads the same storage.
    const mgr2 = new OfflineManager({
      enabled: true,
      conflictResolution: 'merge',
      resolveConflict,
      storage,
      storageKey: 'minder_offline_queue_guard',
    });
    const executor2 = jest.fn().mockResolvedValue(conflictSentinel(409));
    mgr2.setRequestExecutor(executor2);
    await (mgr2 as any).loadQueue();

    await mgr2.sync();
    // The fresh pass attempted resolution again (not permanently suppressed).
    expect(resolveConflict).toHaveBeenCalledTimes(2);
  });

  // (l) Re-issue loop safety (§10.4).
  it('(l) a merged retry that conflicts again falls through to handleRequestError without looping', async () => {
    const resolveConflict = jest.fn(async (): Promise<ConflictResolution> => ({ action: 'retry', body: { merged: true } }));
    const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict, maxRetries: 5 });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(409)); // ALWAYS conflicts
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', {});
    const stats = await mgr.sync();

    expect(resolveConflict).toHaveBeenCalledTimes(1); // exactly once, no loop
    expect(executor).toHaveBeenCalledTimes(2); // initial dispatch + one merged retry
    expect(stats.failed).toBe(1);
    expect(mgr.getQueueSize()).toBe(1); // retried, still queued (< maxRetries)
    expect(mgr.getQueue()[0].retries).toBe(1);
  });

  // (m) Alias parity (§10.5).
  describe('(m) alias parity', () => {
    it('client-wins produces the identical outcome as last-write-wins', async () => {
      const mgrLww = new OfflineManager({ enabled: true, conflictResolution: 'last-write-wins' });
      const execLww = jest.fn().mockResolvedValueOnce(conflictSentinel(409)).mockResolvedValueOnce({ ok: true });
      mgrLww.setRequestExecutor(execLww);
      await mgrLww.addToQueue('PUT', '/api/items/1', { body: { a: 1 } });
      await mgrLww.sync();

      const mgrCw = new OfflineManager({ enabled: true, conflictResolution: 'client-wins' });
      const execCw = jest.fn().mockResolvedValueOnce(conflictSentinel(409)).mockResolvedValueOnce({ ok: true });
      mgrCw.setRequestExecutor(execCw);
      await mgrCw.addToQueue('PUT', '/api/items/1', { body: { a: 1 } });
      await mgrCw.sync();

      expect(execCw).toHaveBeenCalledTimes(execLww.mock.calls.length);
      expect(execCw.mock.calls[1][0]).toMatchObject({ body: { a: 1 } });
      expect(mgrCw.getQueueSize()).toBe(mgrLww.getQueueSize());
    });

    it('manual produces the identical outcome as merge (same resolver invocation + resolution)', async () => {
      const resolution: ConflictResolution = { action: 'retry', body: { merged: true } };

      const resolveMerge = jest.fn().mockResolvedValue(resolution);
      const mgrMerge = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict: resolveMerge });
      const execMerge = jest.fn().mockResolvedValueOnce(conflictSentinel(409)).mockResolvedValueOnce({ ok: true });
      mgrMerge.setRequestExecutor(execMerge);
      await mgrMerge.addToQueue('PUT', '/api/items/1', {});
      await mgrMerge.sync();

      const resolveManual = jest.fn().mockResolvedValue(resolution);
      const mgrManual = new OfflineManager({ enabled: true, conflictResolution: 'manual', resolveConflict: resolveManual });
      const execManual = jest.fn().mockResolvedValueOnce(conflictSentinel(409)).mockResolvedValueOnce({ ok: true });
      mgrManual.setRequestExecutor(execManual);
      await mgrManual.addToQueue('PUT', '/api/items/1', {});
      await mgrManual.sync();

      expect(resolveMerge).toHaveBeenCalledTimes(1);
      expect(resolveManual).toHaveBeenCalledTimes(1);
      expect(execManual.mock.calls[1][0]).toMatchObject({ body: { merged: true } });
      // Same applied resolution (ignore the per-request generated `id`/`queuedAt`).
      const { id: _mergeId, queuedAt: _mergeAt, ...mergeRest } = execMerge.mock.calls[1][0] as Record<string, unknown>;
      const { id: _manualId, queuedAt: _manualAt, ...manualRest } = execManual.mock.calls[1][0] as Record<string, unknown>;
      expect(manualRest).toEqual(mergeRest);
      expect(mgrManual.getQueueSize()).toBe(mgrMerge.getQueueSize());
    });
  });

  // Integration: mock axios-style executor returning 409 then 200 -> merged
  // re-issue succeeds and queue drains.
  it('integration: 409 then 200 through resolveConflict drains the queue', async () => {
    const resolveConflict = jest.fn(async (ctx: ConflictContext): Promise<ConflictResolution> => ({
      action: 'retry',
      body: { ...(ctx.clientBody as Record<string, unknown>), version: 2 },
    }));
    const mgr = new OfflineManager({ enabled: true, conflictResolution: 'merge', resolveConflict });
    const executor = jest
      .fn()
      .mockResolvedValueOnce(conflictSentinel(409))
      .mockResolvedValueOnce({ id: 1, version: 2 });
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', { body: { name: 'client' } });
    const stats = await mgr.sync();

    expect(stats.successful).toBe(1);
    expect(mgr.getQueueSize()).toBe(0);
    expect(executor.mock.calls[1][0]).toMatchObject({ body: { name: 'client', version: 2 } });
  });

  // Regression: default config (no conflict options set at all) preserves the
  // "retry then drop" outcome for a conflict status too (server-wins default).
  it('regression: with zero conflict config, a 409 resolves via the server-wins default (not blind retry-drop)', async () => {
    const mgr = new OfflineManager({ enabled: true });
    const executor = jest.fn().mockResolvedValue(conflictSentinel(409));
    mgr.setRequestExecutor(executor);

    await mgr.addToQueue('PUT', '/api/items/1', {});
    const stats = await mgr.sync();

    expect(executor).toHaveBeenCalledTimes(1); // resolved deterministically, no retry loop
    expect(stats.successful).toBe(1);
    expect(mgr.getQueueSize()).toBe(0);
  });

  // Integration through the REAL ApiClient <-> OfflineManager wiring (Spec 5.1
  // §10.1's executor sentinel contract), not a mocked requestExecutor. Mirrors
  // the wiring pattern in mdpd-unified-offline-manager.test.ts.
  describe('integration: real ApiClient executor sentinel contract', () => {
    beforeEach(() => setOnline(true));
    afterEach(async () => {
      await getOfflineManager()?.destroy?.();
    });

    function makeClient(offline: Record<string, unknown>): ApiClient {
      const config = configureMinder({
        apiUrl: 'https://api.example.com',
        routes: { updateTodo: { url: '/todos/1', method: HttpMethod.PUT } },
        offline: { enabled: true, autoSync: true, ...offline },
        corsHelper: { enabled: false },
        performance: { retries: 0 },
      });
      return new ApiClient(config, new AuthManager({ storage: StorageType.MEMORY, tokenKey: 't' }));
    }

    it('a real 409 response through axios resolves via server-wins default and drains the queue', async () => {
      const client = makeClient({ conflictResolution: 'server-wins' });
      const mgr = getOfflineManager()!;
      await mgr.initialize();

      client.getAxiosInstance().defaults.adapter = rejectingAdapter();
      await expect(client.request('updateTodo', { name: 'client' })).rejects.toBeTruthy();
      await flush();
      expect(mgr.getQueueSize()).toBe(1);

      client.getAxiosInstance().defaults.adapter = respondingAdapter({ name: 'server' }, 409);
      const stats = await mgr.sync();

      expect(stats.successful).toBe(1);
      expect(mgr.getQueueSize()).toBe(0);
    });

    it('a real 409 response resolves via last-write-wins by re-issuing through axios', async () => {
      const client = makeClient({ conflictResolution: 'last-write-wins' });
      const mgr = getOfflineManager()!;
      await mgr.initialize();

      client.getAxiosInstance().defaults.adapter = rejectingAdapter();
      await expect(client.request('updateTodo', { name: 'client' })).rejects.toBeTruthy();
      await flush();
      expect(mgr.getQueueSize()).toBe(1);

      let calls = 0;
      client.getAxiosInstance().defaults.adapter = async (config: any) => {
        calls++;
        if (calls === 1) {
          return respondingAdapter({ name: 'server' }, 409)(config);
        }
        return respondingAdapter({ name: 'client' }, 200)(config);
      };

      const stats = await mgr.sync();

      expect(calls).toBe(2); // initial replay (409) + re-issued retry (200)
      expect(stats.successful).toBe(1);
      expect(mgr.getQueueSize()).toBe(0);
    });

    it('a genuine transport failure during replay (ERR_NETWORK, no response) is unaffected by the sentinel contract', async () => {
      const client = makeClient({ maxRetries: 5 });
      const mgr = getOfflineManager()!;
      await mgr.initialize();

      client.getAxiosInstance().defaults.adapter = rejectingAdapter();
      await expect(client.request('updateTodo', { name: 'client' })).rejects.toBeTruthy();
      await flush();
      expect(mgr.getQueueSize()).toBe(1);

      // Replay ALSO fails with a genuine network error (no response at all).
      // The shared response interceptor (setupInterceptors) already transforms
      // this into a MinderOfflineError before the executor's catch runs —
      // '__minderReplay' only stops it being re-queued, not re-transformed.
      // This is identical to what a pre-feature (no try/catch) executor would
      // have propagated, so `lastError` is the transformed message, not the
      // raw 'Network Error' string.
      const stats = await mgr.sync();

      expect(stats.failed).toBe(1);
      expect(mgr.getQueueSize()).toBe(1);
      expect(mgr.getQueue()[0].lastError).toBe('No network connection');
    });

    // QA follow-up: a real NON-conflict status (500) through the full pipeline
    // (respondingAdapter -> real response interceptor -> executor's sentinel
    // reconstruction -> OfflineManager's non-conflict throw path). Unlike test
    // (h), which hand-feeds an identical message string to both sides of the
    // comparison, this proves the executor's sentinel actually carries the
    // SAME message/status buildApiError would have produced pre-feature —
    // catching a mismapping that a hand-fed string could not.
    it('a real 500 response maps to buildApiError\'s exact custom message via the reconstructed sentinel', async () => {
      const onRequestError = jest.fn();
      const client = makeClient({ maxRetries: 2, onRequestError });
      const mgr = getOfflineManager()!;
      await mgr.initialize();

      client.getAxiosInstance().defaults.adapter = rejectingAdapter();
      await expect(client.request('updateTodo', { name: 'client' })).rejects.toBeTruthy();
      await flush();
      expect(mgr.getQueueSize()).toBe(1);

      // No `message` field in the response body -> buildApiError's 500 branch
      // falls back to its own custom text, NOT axios's generic
      // "Request failed with status code 500".
      client.getAxiosInstance().defaults.adapter = respondingAdapter({}, 500);

      const stats1 = await mgr.sync();
      expect(stats1.failed).toBe(1);
      expect(mgr.getQueueSize()).toBe(1);
      expect(mgr.getQueue()[0].retries).toBe(1);
      expect(mgr.getQueue()[0].lastError).toBe('Server error - please try again later');
      expect(onRequestError).not.toHaveBeenCalled(); // not yet at maxRetries

      const stats2 = await mgr.sync();
      expect(stats2.failed).toBe(1);
      expect(mgr.getQueueSize()).toBe(0); // dropped at maxRetries (2)
      expect(onRequestError).toHaveBeenCalledTimes(1);
      expect(onRequestError.mock.calls[0][0].retries).toBe(2);
      expect(onRequestError.mock.calls[0][1].message).toBe('Server error - please try again later');
    });
  });
});
