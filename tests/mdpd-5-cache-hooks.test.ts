/**
 * @jest-environment node
 *
 * MDPD-5 — plugin hooks `onCacheHit(e)` / `onCacheMiss(key)` are declared on the
 * public MinderPlugin interface but had ZERO emit sites. The prior wave added a
 * real TTL cache inside minder() (MDPD-24); these hooks must now fire from that
 * cache path:
 *   - first `{ cache: true }` GET  → onCacheMiss(key), NOT onCacheHit, transport hit once
 *   - second GET within TTL        → onCacheHit(event), NOT onCacheMiss, transport NOT hit
 *   - after TTL expiry             → onCacheMiss again, transport hit again
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import {
  minder,
  setMinderGlobalConfig,
  clearMinderCache,
} from '../src/core/minder';
import { pluginManager, type CacheHitEvent } from '../src/plugins/PluginSystem';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ok = (data: any = { ok: true }) =>
  ({ data, status: 200, statusText: 'OK', headers: {}, config: {} }) as any;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Flush the fire-and-forget plugin emit microtask/macrotask.
const flush = () => wait(0);

describe('MDPD-5: cache observability hooks (onCacheHit / onCacheMiss)', () => {
  let hits: CacheHitEvent[] = [];
  let misses: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
    hits = [];
    misses = [];
    pluginManager.register({
      name: 'cache-observer',
      onCacheHit: (e) => {
        hits.push(e);
      },
      onCacheMiss: (key) => {
        misses.push(key);
      },
    });
  });

  afterEach(() => {
    pluginManager.unregister('cache-observer');
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('first call fires onCacheMiss(key) and not onCacheHit', async () => {
    mockedAxios.mockResolvedValue(ok({ id: 1 }));

    await minder('/api/todos', undefined, { cache: true, cacheTTL: 30_000 });
    await flush();

    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain('/api/todos');
    expect(hits).toHaveLength(0);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('second call within TTL fires onCacheHit and NOT the transport', async () => {
    mockedAxios.mockResolvedValue(ok({ id: 1 }));

    await minder('/api/todos', undefined, { cache: true, cacheTTL: 30_000 });
    await flush();
    await minder('/api/todos', undefined, { cache: true, cacheTTL: 30_000 });
    await flush();

    expect(misses).toHaveLength(1); // only the first call missed
    expect(hits).toHaveLength(1);
    expect(hits[0].key).toContain('/api/todos');
    expect(hits[0].value).toEqual({ id: 1 });
    expect(typeof hits[0].age).toBe('number');
    expect(typeof hits[0].timestamp).toBe('number');
    expect(mockedAxios).toHaveBeenCalledTimes(1); // transport hit once, not twice
  });

  it('expired entry misses again', async () => {
    mockedAxios.mockResolvedValue(ok({ id: 1 }));

    await minder('/api/todos', undefined, { cache: true, cacheTTL: 20 });
    await flush();
    await wait(40);
    await minder('/api/todos', undefined, { cache: true, cacheTTL: 20 });
    await flush();

    expect(misses).toHaveLength(2);
    expect(hits).toHaveLength(0);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('cache:false never emits cache hooks', async () => {
    mockedAxios.mockResolvedValue(ok());

    await minder('/api/todos', undefined, { cache: false });
    await minder('/api/todos');
    await flush();

    expect(misses).toHaveLength(0);
    expect(hits).toHaveLength(0);
  });
});
