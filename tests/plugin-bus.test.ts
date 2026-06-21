/**
 * @jest-environment jsdom
 *
 * Phase 5: the request lifecycle must fire registered plugin hooks
 * (onRequest / onResponse / onError). Previously PluginManager existed but its
 * hooks were never invoked by ApiClient — the integration bus was dead code.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import { ApiClient } from '../src/core/ApiClient';
import type { MinderConfig } from '../src/core/types';
import type { MinderPlugin } from '../src/plugins/PluginSystem';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../src/utils/security', () => ({
  CSRFTokenManager: jest.fn(),
  XSSSanitizer: jest.fn(),
  RateLimiter: jest.fn(),
  getSecurityHeaders: jest.fn().mockReturnValue({}),
}));

describe('Plugin bus wiring (Phase 5)', () => {
  let requestInterceptor: any;
  let responseSuccess: any;
  let responseError: any;
  const authManager = { getToken: jest.fn().mockReturnValue(null), clearAuth: jest.fn() } as any;

  const flush = () => new Promise((res) => setTimeout(res, 0));

  function makeClient(plugins: MinderPlugin[]) {
    const mockAxiosInstance: any = {
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn((fn: any) => { requestInterceptor = fn; }) },
        response: { use: jest.fn((ok: any, err: any) => { responseSuccess = ok; responseError = err; }) },
      },
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance) as any;
    const config = { apiBaseUrl: 'http://api.example.com', routes: {}, plugins } as unknown as MinderConfig;
    return new ApiClient(config, authManager);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    requestInterceptor = responseSuccess = responseError = undefined;
  });

  it('fires onRequest / onResponse / onError for a registered plugin', async () => {
    const events: string[] = [];
    const plugin: MinderPlugin = {
      name: 'test-recorder',
      onRequest: () => { events.push('request'); },
      onResponse: () => { events.push('response'); },
      onError: () => { events.push('error'); },
    };
    makeClient([plugin]);

    const cfg = await requestInterceptor({ method: 'get', url: '/users', headers: {} });
    responseSuccess({ status: 200, data: { ok: true }, headers: {}, config: cfg });
    await responseError({ message: 'boom', config: cfg, isAxiosError: true }).catch(() => { /* expected */ });

    await flush();

    expect(events).toContain('request');
    expect(events).toContain('response');
    expect(events).toContain('error');
  });

  it('is a no-op fast path when no plugins are registered', async () => {
    makeClient([]);
    const cfg = await requestInterceptor({ method: 'get', url: '/x', headers: {} });
    expect(cfg).toBeDefined();
    // size === 0 short-circuits the emitters; nothing fires, nothing throws.
    expect(() => responseSuccess({ status: 200, data: {}, headers: {}, config: cfg })).not.toThrow();
  });
});
