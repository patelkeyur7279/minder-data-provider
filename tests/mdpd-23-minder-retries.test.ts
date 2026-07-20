/**
 * @jest-environment node
 *
 * MDPD-23 — `retries` option is inert on the minder() path.
 *
 * minder() never rejects (it returns a structured MinderResult), so TanStack
 * Query sees a fulfilled promise and options.retries/retryConfig did nothing.
 * The fix implements retry INSIDE minder(): retryable failures (network error or
 * 5xx/429; not 4xx) are retried up to `retries` times with a small backoff,
 * preserving the never-throws contract.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import {
  minder,
  setMinderGlobalConfig,
  __setRetrySleepForTesting,
} from '../src/core/minder';
import { pluginManager } from '../src/plugins/PluginSystem';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const err = (status: number) =>
  ({ response: { status, data: {} }, isAxiosError: true }) as any;
const networkErr = () => ({ request: {}, isAxiosError: true, message: 'net' }) as any;
const ok = () =>
  ({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: {} }) as any;

function clearGlobalPlugins() {
  for (const p of pluginManager.getPlugins()) pluginManager.unregister(p.name);
}

describe('MDPD-23: minder() retries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalPlugins();
    setMinderGlobalConfig({ baseURL: 'http://api.example.com' });
    // Zero-delay sleep so tests do not wait on real backoff timers.
    __setRetrySleepForTesting(() => Promise.resolve());
  });
  afterEach(() => {
    clearGlobalPlugins();
    __setRetrySleepForTesting(null);
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('retries a 503 twice then succeeds (transport called N+1 times)', async () => {
    mockedAxios
      .mockRejectedValueOnce(err(503))
      .mockRejectedValueOnce(err(503))
      .mockResolvedValueOnce(ok());

    const res = await minder('/api/flaky', undefined, { retries: 5 });

    expect(res.success).toBe(true);
    expect(mockedAxios).toHaveBeenCalledTimes(3);
  });

  it('retries a network error then succeeds', async () => {
    mockedAxios.mockRejectedValueOnce(networkErr()).mockResolvedValueOnce(ok());

    const res = await minder('/api/flaky', undefined, { retries: 1 });

    expect(res.success).toBe(true);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it('retries:0 does not retry (transport called once)', async () => {
    mockedAxios.mockRejectedValueOnce(err(503));

    const res = await minder('/api/flaky', undefined, { retries: 0 });

    expect(res.success).toBe(false);
    expect(res.status).toBe(503);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('absent retries option: minder() itself does not retry (called once)', async () => {
    mockedAxios.mockRejectedValueOnce(err(503));

    const res = await minder('/api/flaky');

    expect(res.success).toBe(false);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 4xx client error', async () => {
    mockedAxios.mockRejectedValue(err(404));

    const res = await minder('/api/missing', undefined, { retries: 5 });

    expect(res.success).toBe(false);
    expect(res.status).toBe(404);
    expect(mockedAxios).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and returns the last structured failure (never throws)', async () => {
    mockedAxios.mockRejectedValue(err(503));

    const res = await minder('/api/flaky', undefined, { retries: 2 });

    expect(res.success).toBe(false);
    expect(res.status).toBe(503);
    expect(mockedAxios).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('fires the onError plugin hook only once — for the final failure', async () => {
    const errors: string[] = [];
    pluginManager.register({
      name: 'err-count',
      onError: (e) => {
        errors.push(e.code || 'x');
      },
    });
    mockedAxios.mockRejectedValue(err(503));

    await minder('/api/flaky', undefined, { retries: 2 });
    await new Promise((r) => setTimeout(r, 0));

    expect(mockedAxios).toHaveBeenCalledTimes(3);
    expect(errors.length).toBe(1);
  });
});
