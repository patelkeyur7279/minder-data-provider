/**
 * Wave I (I-01): LocalStore — the typed persistence layer behind
 * useMinder(route, { source: 'local' | 'local-first' }). Wraps a platform
 * StorageAdapter (Wave-H-hardened) with queryKey-keyed JSON get/set/remove.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { LocalStore } from '../src/core/LocalStore';
import { MemoryStorageAdapter } from '../src/platform/adapters/storage/MemoryStorageAdapter';

describe('LocalStore', () => {
  let store: LocalStore;
  beforeEach(() => {
    // Inject a memory adapter for deterministic, platform-independent tests.
    store = new LocalStore(new MemoryStorageAdapter({ namespace: 'test-local' }));
  });

  it('round-trips typed data by string queryKey', async () => {
    await store.set('todos', [{ id: 1, title: 'a' }]);
    expect(await store.get<Array<{ id: number; title: string }>>('todos')).toEqual([
      { id: 1, title: 'a' },
    ]);
  });

  it('round-trips by array queryKey (stable key)', async () => {
    await store.set(['users', { page: 2 }], { rows: [1, 2] });
    expect(await store.get(['users', { page: 2 }])).toEqual({ rows: [1, 2] });
    // A different key does not collide.
    expect(await store.get(['users', { page: 3 }])).toBeNull();
  });

  it('returns null for a missing key', async () => {
    expect(await store.get('nope')).toBeNull();
  });

  it('remove deletes the value', async () => {
    await store.set('k', { v: 1 });
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
  });

  it('preserves falsy and complex values (0, false, null-in-object, nested)', async () => {
    await store.set('zero', 0);
    await store.set('flag', false);
    await store.set('nested', { a: { b: [null, 1, 'x'] } });
    expect(await store.get('zero')).toBe(0);
    expect(await store.get('flag')).toBe(false);
    expect(await store.get('nested')).toEqual({ a: { b: [null, 1, 'x'] } });
  });

  it('defaults to a platform adapter when none is injected (jsdom → web/memory)', async () => {
    const auto = new LocalStore();
    await auto.set('auto', 'works');
    expect(await auto.get('auto')).toBe('works');
  });
});
