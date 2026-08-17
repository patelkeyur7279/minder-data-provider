/**
 * @jest-environment node
 *
 * Release-audit fixes for the standalone minder() cache + retry path:
 *
 * 1. CRITICAL — cache identity: the response cache key now includes a hashed
 *    auth-identity component (options.token / Authorization header), so one
 *    credential's cached authenticated response can NEVER be served to a
 *    different credential on a shared (SSR/Node) process.
 * 2. CRITICAL — retry idempotency: retries apply only to idempotent methods
 *    (GET/HEAD/OPTIONS/PUT/DELETE) unless `retryNonIdempotent: true`; POST and
 *    PATCH are never silently resubmitted.
 * 3. HIGH — model prototypes survive cache hits: entries store RAW pre-decode
 *    data and re-run decodeWithModel per hit, so `instanceof Model` holds on
 *    the second (cached) call.
 * 4. MEDIUM — the cache is capped at 200 entries (oldest evicted).
 * 5. LOW — absolute-URL detection has axios parity (protocol-relative `//host`
 *    and any-scheme URLs bypass baseURL in the cache key).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import {
  minder,
  setMinderGlobalConfig,
  clearMinderCache,
  __setRetrySleepForTesting,
} from '../src/core/minder';
import { pluginManager } from '../src/plugins/PluginSystem';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ok = (data: any = { ok: true }) =>
  ({ data, status: 200, statusText: 'OK', headers: {}, config: {} }) as any;
const err = (status: number) =>
  ({ response: { status, data: {} }, isAxiosError: true }) as any;

describe('cache identity: per-credential partitioning (cross-user leak fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
  });
  afterEach(() => {
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('different options.token values NEVER share a cache entry', async () => {
    mockedAxios
      .mockResolvedValueOnce(ok({ user: 'alice' }))
      .mockResolvedValueOnce(ok({ user: 'bob' }));

    const a = await minder('/api/me', undefined, { cache: true, token: 'token-alice' });
    const b = await minder('/api/me', undefined, { cache: true, token: 'token-bob' });

    // Both calls must hit the transport — no cross-credential serving.
    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(a.data).toEqual({ user: 'alice' });
    expect(b.data).toEqual({ user: 'bob' });
    expect(b.metadata?.cached).toBe(false);
  });

  it('the SAME token still gets a cache hit on the second call', async () => {
    mockedAxios.mockResolvedValue(ok({ user: 'alice' }));

    await minder('/api/me', undefined, { cache: true, token: 'token-alice' });
    const b = await minder('/api/me', undefined, { cache: true, token: 'token-alice' });

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    expect(b.metadata?.cached).toBe(true);
  });

  it('different Authorization headers are isolated from each other', async () => {
    mockedAxios
      .mockResolvedValueOnce(ok({ user: 'alice' }))
      .mockResolvedValueOnce(ok({ user: 'bob' }));

    const a = await minder('/api/me', undefined, {
      cache: true,
      headers: { Authorization: 'Bearer aaa' },
    });
    const b = await minder('/api/me', undefined, {
      cache: true,
      headers: { authorization: 'Bearer bbb' }, // case-insensitive match
    });

    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(a.data).toEqual({ user: 'alice' });
    expect(b.data).toEqual({ user: 'bob' });
  });

  it('anonymous and authenticated requests are isolated', async () => {
    mockedAxios
      .mockResolvedValueOnce(ok({ user: 'anon' }))
      .mockResolvedValueOnce(ok({ user: 'alice' }));

    const a = await minder('/api/feed', undefined, { cache: true });
    const b = await minder('/api/feed', undefined, { cache: true, token: 'token-alice' });

    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(a.data).toEqual({ user: 'anon' });
    expect(b.data).toEqual({ user: 'alice' });
  });

  it('raw token text never appears in cache keys (hashed identity)', async () => {
    // Observable proxy: the onCacheMiss hook receives the key; assert the raw
    // token is not embedded in it.
    const seenKeys: string[] = [];
    pluginManager.register({
      name: 'key-spy',
      onCacheMiss: (key: string) => { seenKeys.push(key); },
    } as any);
    try {
      mockedAxios.mockResolvedValue(ok());
      await minder('/api/me', undefined, { cache: true, token: 'SUPER-SECRET-TOKEN' });
      expect(seenKeys.length).toBeGreaterThan(0);
      for (const k of seenKeys) {
        expect(k).not.toContain('SUPER-SECRET-TOKEN');
      }
    } finally {
      pluginManager.unregister('key-spy');
    }
  });
});

describe('retry idempotency guard (duplicate-write fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
    __setRetrySleepForTesting(() => Promise.resolve());
  });
  afterEach(() => {
    __setRetrySleepForTesting(null);
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('POST with retries set is NOT retried on 503 (exactly one transport call)', async () => {
    mockedAxios.mockRejectedValue(err(503));

    const res = await minder('/api/orders', { item: 'x' }, { retries: 3 });

    expect(res.success).toBe(false);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('PATCH with retries set is NOT retried on 503', async () => {
    mockedAxios.mockRejectedValue(err(503));

    const res = await minder('/api/orders/1', { qty: 2 }, { retries: 3, method: 'PATCH' } as any);

    expect(res.success).toBe(false);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('GET is still retried on 503', async () => {
    mockedAxios.mockRejectedValueOnce(err(503)).mockResolvedValueOnce(ok());

    const res = await minder('/api/flaky', undefined, { retries: 2 });

    expect(res.success).toBe(true);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('PUT and DELETE (idempotent per RFC 7231) are retried', async () => {
    mockedAxios.mockRejectedValueOnce(err(503)).mockResolvedValueOnce(ok());
    const put = await minder('/api/items/1', { v: 1 }, { retries: 2, method: 'PUT' } as any);
    expect(put.success).toBe(true);
    expect(mockedAxios).toHaveBeenCalledTimes(2);

    jest.clearAllMocks();
    mockedAxios.mockRejectedValueOnce(err(503)).mockResolvedValueOnce(ok());
    const del = await minder('/api/items/1', undefined, { retries: 2, method: 'DELETE' } as any);
    expect(del.success).toBe(true);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('POST IS retried when retryNonIdempotent: true is explicitly set', async () => {
    mockedAxios.mockRejectedValueOnce(err(503)).mockResolvedValueOnce(ok());

    const res = await minder('/api/orders', { item: 'x' }, {
      retries: 2,
      retryNonIdempotent: true,
    });

    expect(res.success).toBe(true);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('4xx is never retried, even with retryNonIdempotent', async () => {
    mockedAxios.mockRejectedValue(err(404));

    const res = await minder('/api/orders', { item: 'x' }, {
      retries: 3,
      retryNonIdempotent: true,
    });

    expect(res.success).toBe(false);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });
});

describe('model prototypes survive cache hits', () => {
  class UserModel {
    id!: number;
    name!: string;
    constructor(data: { id: number; name: string }) {
      Object.assign(this, data);
    }
    greet(): string {
      return `hi ${this.name}`;
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
  });
  afterEach(() => {
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('second (cached) call returns a real model instance with working methods', async () => {
    mockedAxios.mockResolvedValue(ok({ id: 1, name: 'ada' }));

    const first = await minder<UserModel>('/api/user', undefined, {
      cache: true,
      model: UserModel,
    });
    const second = await minder<UserModel>('/api/user', undefined, {
      cache: true,
      model: UserModel,
    });

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    expect(second.metadata?.cached).toBe(true);
    expect(first.data).toBeInstanceOf(UserModel);
    expect(second.data).toBeInstanceOf(UserModel);
    expect((second.data as UserModel).greet()).toBe('hi ada');
    // Distinct instances — mutating the hit must not poison the cache entry.
    expect(second.data).not.toBe(first.data);
  });
});

describe('cache size cap (200 entries, oldest evicted)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
  });
  afterEach(() => {
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('inserting 201 distinct keys evicts the oldest; newest still hits', async () => {
    mockedAxios.mockResolvedValue(ok());

    for (let i = 0; i <= 200; i++) {
      await minder(`/api/todos/${i}`, undefined, { cache: true, cacheTTL: 60_000 });
    }
    expect(mockedAxios).toHaveBeenCalledTimes(201);

    // /api/todos/0 (oldest) was evicted → transport again.
    await minder('/api/todos/0', undefined, { cache: true, cacheTTL: 60_000 });
    expect(mockedAxios).toHaveBeenCalledTimes(202);

    // /api/todos/200 (newest) still cached → NO extra transport call.
    const hit = await minder('/api/todos/200', undefined, { cache: true, cacheTTL: 60_000 });
    expect(mockedAxios).toHaveBeenCalledTimes(202);
    expect(hit.metadata?.cached).toBe(true);
  });
});

describe('absolute-URL axios parity in cache keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMinderCache();
  });
  afterEach(() => {
    clearMinderCache();
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('protocol-relative //host URLs ignore baseURL in the key (hit across baseURL change)', async () => {
    mockedAxios.mockResolvedValue(ok());

    setMinderGlobalConfig({ baseURL: 'http://one.example.com' });
    await minder('//cdn.example.com/data', undefined, { cache: true });
    // A different baseURL must NOT change the key for an absolute URL.
    setMinderGlobalConfig({ baseURL: 'http://two.example.com' });
    const b = await minder('//cdn.example.com/data', undefined, { cache: true });

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    expect(b.metadata?.cached).toBe(true);
  });

  it('uppercase HTTPS:// is treated as absolute (case-insensitive)', async () => {
    mockedAxios.mockResolvedValue(ok());

    setMinderGlobalConfig({ baseURL: 'http://one.example.com' });
    await minder('HTTPS://third.example.com/x', undefined, { cache: true });
    setMinderGlobalConfig({ baseURL: 'http://two.example.com' });
    const b = await minder('HTTPS://third.example.com/x', undefined, { cache: true });

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    expect(b.metadata?.cached).toBe(true);
  });
});
