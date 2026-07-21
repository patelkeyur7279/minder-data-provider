/**
 * @jest-environment node
 *
 * MDPD-24 — `metadata.cached` was hard-coded false; `cache`/`cacheTTL` did
 * nothing on standalone minder().
 *
 * The fix adds a module-level TTL response cache used ONLY when
 * options.cache === true: successful GET results are stored keyed by
 * method+resolvedURL+params, and a second call within cacheTTL returns the
 * cached result with metadata.cached=true without hitting the transport.
 * Non-GET and cache:false paths are unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import {
  minder,
  setMinderGlobalConfig,
  clearMinderCache,
} from '../src/core/minder';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ok = (data: any = { ok: true }) =>
  ({ data, status: 200, statusText: 'OK', headers: {}, config: {} }) as any;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('MDPD-24: minder() response cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
  });
  afterEach(() => {
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('second GET within TTL returns cached:true and does not hit transport', async () => {
    mockedAxios.mockResolvedValue(ok({ id: 1 }));

    const a = await minder('/api/todos', undefined, { cache: true, cacheTTL: 30_000 });
    const b = await minder('/api/todos', undefined, { cache: true, cacheTTL: 30_000 });

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    expect(a.metadata?.cached).toBe(false);
    expect(b.metadata?.cached).toBe(true);
    expect(b.data).toEqual({ id: 1 });
  });

  it('after TTL expiry hits the transport again', async () => {
    mockedAxios.mockResolvedValue(ok({ id: 1 }));

    await minder('/api/todos', undefined, { cache: true, cacheTTL: 20 });
    await wait(40);
    const b = await minder('/api/todos', undefined, { cache: true, cacheTTL: 20 });

    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(b.metadata?.cached).toBe(false);
  });

  it('POST is never cached', async () => {
    mockedAxios.mockResolvedValue(ok());

    await minder('/api/todos', { title: 'x' }, { cache: true });
    await minder('/api/todos', { title: 'x' }, { cache: true });

    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('cache:false (and absent) never caches', async () => {
    mockedAxios.mockResolvedValue(ok());

    await minder('/api/todos', undefined, { cache: false });
    await minder('/api/todos', undefined, { cache: false });
    await minder('/api/todos');
    await minder('/api/todos');

    expect(mockedAxios).toHaveBeenCalledTimes(4);
    const last = await minder('/api/todos');
    expect(last.metadata?.cached).toBe(false);
  });

  it('cached result is a copy — mutating one does not alias the cache', async () => {
    mockedAxios.mockResolvedValue(ok({ items: [1, 2, 3] }));

    const a = await minder('/api/todos', undefined, { cache: true });
    (a.data as any).items.push(999);
    const b = await minder('/api/todos', undefined, { cache: true });

    expect(b.data).toEqual({ items: [1, 2, 3] });
  });

  it('different params are cached separately', async () => {
    mockedAxios.mockResolvedValue(ok());

    await minder('/api/todos', undefined, { cache: true, params: { page: 1 } });
    await minder('/api/todos', undefined, { cache: true, params: { page: 2 } });

    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('clearMinderCache forces the next call to hit the transport', async () => {
    mockedAxios.mockResolvedValue(ok());

    await minder('/api/todos', undefined, { cache: true });
    clearMinderCache();
    await minder('/api/todos', undefined, { cache: true });

    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });
});
