/**
 * @jest-environment jsdom
 *
 * Unified OfflineManager — FormData / non-serializable body behavior.
 *
 * The old core manager persisted its queue to IndexedDB and filtered out
 * non-serializable bodies. The unified platform manager persists ONLY when a
 * `storage` adapter is configured; with no adapter the queue is in-memory only
 * (documented in FEATURES.md). This guards that a FormData-bodied request is
 * still held in memory and that persistence happens only through an adapter.
 */
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { OfflineManager } from '../src/platform/offline/OfflineManager';
import type { StorageAdapter } from '../src/platform/adapters/storage/StorageAdapter';

describe('OfflineManager (unified) — FormData / in-memory queue', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('holds a FormData-bodied request in the in-memory queue (no storage adapter)', async () => {
    const mgr = new OfflineManager({ enabled: true });

    const formData = new FormData();
    formData.append('file', new Blob(['test content']), 'test.txt');

    await mgr.addToQueue('POST', '/upload', { body: formData, headers: {} });

    // In memory regardless of serializability.
    expect(mgr.getQueueSize()).toBe(1);
    expect(mgr.getQueue()[0].body).toBe(formData);
  });

  it('persists the queue only through a configured storage adapter', async () => {
    const store: Record<string, string> = {};
    const adapter = {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      clear: jest.fn(async () => {
        for (const k of Object.keys(store)) delete store[k];
      }),
    } as unknown as StorageAdapter;

    const mgr = new OfflineManager({ enabled: true, storage: adapter, storageKey: 'q' });
    await mgr.addToQueue('POST', '/api/users', { body: { name: 'x' } });

    expect(adapter.setItem).toHaveBeenCalled();
    const saved = JSON.parse((adapter.setItem as jest.Mock).mock.calls.at(-1)![1]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ method: 'POST', url: '/api/users' });
  });
});
