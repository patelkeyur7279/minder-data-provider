/**
 * @jest-environment node
 *
 * MDPD-18 — `transport: 'fetch'` double-prefixes absolute URLs.
 *
 * The default axios path bypasses the configured apiUrl for absolute http(s)
 * URLs, but the fetch fast-path concatenated baseURL + url unconditionally, so
 * minder('http://x/api', …, { transport: 'fetch' }) fetched
 * 'http://BASEhttp://x/api'. The fix mirrors the axios absolute-URL check.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { minder, setMinderGlobalConfig } from '../src/core/minder';

describe('MDPD-18: fetch transport respects absolute URLs', () => {
  let fetchMock: jest.Mock;
  let originalFetch: any;

  beforeEach(() => {
    setMinderGlobalConfig({ baseURL: 'http://localhost:4100' });
    originalFetch = (global as any).fetch;
    fetchMock = jest.fn(async () => ({
      status: 200,
      ok: true,
      headers: { forEach: () => {}, get: () => 'application/json' },
      json: async () => ({ ok: true }),
      text: async () => '',
    }));
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
    setMinderGlobalConfig({ baseURL: '' });
  });

  it('does not prefix the configured baseURL onto an absolute URL', async () => {
    await minder('http://localhost:4100/api/todos', undefined, {
      transport: 'fetch',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe('http://localhost:4100/api/todos');
  });

  it('still prefixes baseURL for relative paths', async () => {
    await minder('/api/todos', undefined, { transport: 'fetch' });

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe('http://localhost:4100/api/todos');
  });
});
