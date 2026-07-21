/**
 * @jest-environment jsdom
 *
 * Phase 6, increment 2: the framework-agnostic observers. The load-bearing test
 * is the referential stability of getSnapshot() — without it, useSyncExternalStore
 * (increment 4) would infinite-loop.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/query-core';
import { MinderQueryObserver, MinderMutationObserver } from '../src/core/observer';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MinderQueryObserver (Phase 6 inc 2)', () => {
  it('getSnapshot() is referentially stable between notifications', () => {
    const client = new QueryClient();
    const obs = new MinderQueryObserver<string>(client, {
      queryKey: ['k'],
      queryFn: () => Promise.resolve('v'),
      enabled: false,
    });
    expect(obs.getSnapshot()).toBe(obs.getSnapshot()); // SAME reference
    obs.destroy();
  });

  it('subscribe fires and the snapshot reflects resolved data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const obs = new MinderQueryObserver<string>(client, {
      queryKey: ['users'],
      queryFn: () => Promise.resolve('hello'),
    });
    const onChange = jest.fn();
    const unsub = obs.subscribe(onChange);
    await flush();
    await flush();
    expect(onChange).toHaveBeenCalled();
    expect(obs.getSnapshot().data).toBe('hello');
    expect(obs.getSnapshot().status).toBe('success');
    unsub();
    obs.destroy();
  });

  it('surfaces query errors in the snapshot', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const obs = new MinderQueryObserver<string>(client, {
      queryKey: ['boom'],
      queryFn: () => Promise.reject(new Error('nope')),
    });
    const unsub = obs.subscribe(() => { /* noop */ });
    await flush();
    await flush();
    expect(obs.getSnapshot().status).toBe('error');
    expect((obs.getSnapshot().error as Error)?.message).toBe('nope');
    unsub();
    obs.destroy();
  });
});

describe('MinderMutationObserver (Phase 6 inc 2)', () => {
  it('mutate runs and the snapshot reflects the result', async () => {
    const client = new QueryClient();
    const obs = new MinderMutationObserver<string, Error, { id: number }>(client, {
      mutationFn: async (vars) => `created-${vars.id}`,
    });
    const onChange = jest.fn();
    const unsub = obs.subscribe(onChange);
    const result = await obs.mutate({ id: 7 });
    await flush();
    expect(result).toBe('created-7');
    expect(onChange).toHaveBeenCalled();
    expect(obs.getSnapshot().data).toBe('created-7');
    expect(obs.getSnapshot().status).toBe('success');
    unsub();
  });
});
