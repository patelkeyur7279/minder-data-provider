/**
 * @jest-environment jsdom
 *
 * M1-03 — Plugin bus real power:
 *   1. Mutating request middleware (onRequestIntercept) on BOTH transport paths
 *      (ApiClient.request + minder()): mutation, chain order, short-circuit,
 *      throwing-plugin isolation, and the zero-plugin fast path.
 *   2. The three previously-dormant capability hooks emitting real events:
 *      onUpload (MediaUploadManager), onSync + onConnectivityChange
 *      (platform OfflineManager).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';

import { ApiClient } from '../src/core/ApiClient';
import { minder, configureMinder } from '../src/core/minder';
import { MediaUploadManager } from '../src/upload/MediaUploadManager';
import { createOfflineManager } from '../src/platform/offline/OfflineManager';
import { pluginManager } from '../src/plugins/PluginSystem';
import type { MinderPlugin } from '../src/plugins/PluginSystem';
import type { MinderConfig } from '../src/core/types';
import { HttpMethod } from '../src/constants/enums';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../src/utils/security', () => ({
  CSRFTokenManager: jest.fn(),
  XSSSanitizer: jest.fn(),
  RateLimiter: jest.fn(),
  getSecurityHeaders: jest.fn().mockReturnValue({}),
}));

const flush = () => new Promise((res) => setTimeout(res, 0));

// Polyfill Response for the XHR-based upload path (mirrors media-upload-manager.test.ts)
if (typeof Response === 'undefined') {
  (global as any).Response = class Response {
    body: any; status: number; statusText: string; headers: any;
    constructor(body: any, init: any) {
      this.body = body;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Map();
    }
    json() { return Promise.resolve(JSON.parse(this.body)); }
  };
}

/** Remove every plugin from the shared global manager (test isolation). */
function clearGlobalPlugins() {
  for (const p of pluginManager.getPlugins()) {
    pluginManager.unregister(p.name);
  }
}

// ============================================================================
// FEATURE 1 — ApiClient.request() mutating middleware
// ============================================================================

describe('onRequestIntercept — ApiClient.request() path', () => {
  const authManager = { getToken: jest.fn().mockReturnValue(null), clearAuth: jest.fn() } as any;
  let mockAxiosInstance: any;

  function makeClient(plugins: MinderPlugin[]) {
    mockAxiosInstance = {
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance) as any;
    const config = {
      apiBaseUrl: 'http://api.example.com',
      routes: { users: { url: '/users', method: HttpMethod.GET } },
      plugins,
    } as unknown as MinderConfig;
    return new ApiClient(config, authManager);
  }

  beforeEach(() => jest.clearAllMocks());

  it('applies a header mutation to the outgoing axios config', async () => {
    const plugin: MinderPlugin = {
      name: 'add-header',
      onRequestIntercept: (c) => ({ ...c, headers: { ...c.headers, 'X-Test': '1' } }),
    };
    const client = makeClient([plugin]);
    mockAxiosInstance.request.mockResolvedValue({ data: { ok: true }, status: 200, headers: {}, config: {} });

    const data = await client.request('users');

    const sent = mockAxiosInstance.request.mock.calls[0][0];
    expect(sent.headers['X-Test']).toBe('1');
    expect(data).toEqual({ ok: true });
  });

  it('runs plugins in registration order — the second sees the first mutation', async () => {
    let secondSaw: string | undefined;
    const p1: MinderPlugin = {
      name: 'first',
      onRequestIntercept: (c) => ({ ...c, headers: { ...c.headers, 'X-Order': 'a' } }),
    };
    const p2: MinderPlugin = {
      name: 'second',
      onRequestIntercept: (c) => {
        secondSaw = c.headers['X-Order'];
        return { ...c, headers: { ...c.headers, 'X-Order': `${c.headers['X-Order']}b` } };
      },
    };
    const client = makeClient([p1, p2]);
    mockAxiosInstance.request.mockResolvedValue({ data: {}, status: 200, headers: {}, config: {} });

    await client.request('users');

    expect(secondSaw).toBe('a');
    expect(mockAxiosInstance.request.mock.calls[0][0].headers['X-Order']).toBe('ab');
  });

  it('short-circuits: transport is never hit and the caller gets the synthetic data', async () => {
    const plugin: MinderPlugin = {
      name: 'cache',
      onRequestIntercept: () => ({ shortCircuit: true, response: { data: { cached: true }, status: 200 } }),
    };
    const client = makeClient([plugin]);

    const data = await client.request('users');

    expect(data).toEqual({ cached: true });
    expect(mockAxiosInstance.request).not.toHaveBeenCalled();
  });

  it('isolates a throwing plugin — it is skipped and the chain continues', async () => {
    const thrower: MinderPlugin = {
      name: 'boom',
      onRequestIntercept: () => { throw new Error('nope'); },
    };
    const adder: MinderPlugin = {
      name: 'after',
      onRequestIntercept: (c) => ({ ...c, headers: { ...c.headers, 'X-After': 'y' } }),
    };
    const client = makeClient([thrower, adder]);
    mockAxiosInstance.request.mockResolvedValue({ data: { ok: true }, status: 200, headers: {}, config: {} });

    const data = await client.request('users');

    // Transport was still hit (deliberate short-circuits are returns, not throws)
    expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    // The plugin after the thrower still mutated the config
    expect(mockAxiosInstance.request.mock.calls[0][0].headers['X-After']).toBe('y');
    expect(data).toEqual({ ok: true });
  });

  it('zero-plugin fast path: no interceptor work is performed', async () => {
    clearGlobalPlugins();
    const spy = jest.spyOn(pluginManager, 'executeRequestInterceptors');
    const client = makeClient([]); // no config.plugins -> uses the (empty) global manager
    mockAxiosInstance.request.mockResolvedValue({ data: { ok: true }, status: 200, headers: {}, config: {} });

    const data = await client.request('users');

    expect(spy).not.toHaveBeenCalled();
    expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ ok: true });
    spy.mockRestore();
  });
});

// ============================================================================
// FEATURE 1 — minder() mutating middleware
// ============================================================================

describe('onRequestIntercept — minder() path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalPlugins();
    configureMinder({ baseURL: 'http://api.example.com', timeout: 30000, headers: { 'Content-Type': 'application/json' } });
  });
  afterEach(() => clearGlobalPlugins());

  it('applies a header mutation to the outgoing axios config', async () => {
    pluginManager.register({
      name: 'add-header',
      onRequestIntercept: (c) => ({ ...c, headers: { ...c.headers, 'X-Test': '1' } }),
    });
    mockedAxios.mockResolvedValueOnce({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: {} } as any);

    const res = await minder('/users');

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Test': '1' }) })
    );
    expect(res.data).toEqual({ ok: true });
  });

  it('short-circuits: transport is never hit and the caller gets the synthetic result', async () => {
    pluginManager.register({
      name: 'cache',
      onRequestIntercept: () => ({ shortCircuit: true, response: { data: { cached: true }, status: 201 } }),
    });

    const res = await minder('/users');

    expect(mockedAxios).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ cached: true });
    expect(res.status).toBe(201);
  });

  it('zero-plugin fast path: interceptor chain is never invoked', async () => {
    const spy = jest.spyOn(pluginManager, 'executeRequestInterceptors');
    mockedAxios.mockResolvedValueOnce({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: {} } as any);

    await minder('/users');

    expect(spy).not.toHaveBeenCalled();
    expect(mockedAxios).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

// ============================================================================
// FEATURE 2 — onUpload (MediaUploadManager)
// ============================================================================

describe('onUpload capability hook (MediaUploadManager)', () => {
  const uploadConfig: MinderConfig = {
    apiBaseUrl: 'https://api.example.com',
    routes: { upload: { url: '/upload', method: HttpMethod.POST } },
  } as unknown as MinderConfig;
  const mockApiClient = {} as any;
  let xhrMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalPlugins();
    xhrMock = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      upload: { addEventListener: jest.fn() },
      addEventListener: jest.fn(),
      abort: jest.fn(),
      status: 200,
      statusText: 'OK',
      response: JSON.stringify({ success: true, url: 'https://example.com/file.jpg' }),
    };
    window.XMLHttpRequest = jest.fn(() => xhrMock) as any;
  });
  afterEach(() => clearGlobalPlugins());

  it('emits start then success with the file/route/result payload', async () => {
    const events: any[] = [];
    pluginManager.register({ name: 'up', onUpload: (e) => { events.push(e); } });

    const mgr = new MediaUploadManager(uploadConfig, mockApiClient);
    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });

    xhrMock.send.mockImplementation(() => {
      const loadHandler = xhrMock.addEventListener.mock.calls.find((c: any) => c[0] === 'load')[1];
      loadHandler();
    });

    await mgr.uploadFile(file);
    await flush();

    expect(events.map((e) => e.phase)).toEqual(['start', 'success']);
    expect(events[0].file).toEqual({ name: 'a.jpg', size: file.size, type: 'image/jpeg' });
    expect(events[0].route).toBe('/upload');
    expect(events[1].result).toBeDefined();
  });

  it('emits start then error when the upload fails', async () => {
    const events: any[] = [];
    pluginManager.register({ name: 'up', onUpload: (e) => { events.push(e); } });

    const mgr = new MediaUploadManager(uploadConfig, mockApiClient);
    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });

    xhrMock.send.mockImplementation(() => {
      const errorHandler = xhrMock.addEventListener.mock.calls.find((c: any) => c[0] === 'error')[1];
      errorHandler();
    });

    await expect(mgr.uploadFile(file)).rejects.toThrow();
    await flush();

    expect(events.map((e) => e.phase)).toEqual(['start', 'error']);
    expect(events[1].error?.message).toContain('Network error');
  });

  it('zero-plugin fast path: no upload hooks run', async () => {
    const spy = jest.spyOn(pluginManager, 'executeUploadHooks');
    const mgr = new MediaUploadManager(uploadConfig, mockApiClient);
    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });

    xhrMock.send.mockImplementation(() => {
      const loadHandler = xhrMock.addEventListener.mock.calls.find((c: any) => c[0] === 'load')[1];
      loadHandler();
    });

    await mgr.uploadFile(file);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ============================================================================
// FEATURE 2 — onSync + onConnectivityChange (platform OfflineManager)
// ============================================================================

describe('onSync + onConnectivityChange capability hooks (OfflineManager)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalPlugins();
  });
  afterEach(() => clearGlobalPlugins());

  it('onSync fires start then success with the queue size', async () => {
    const events: any[] = [];
    pluginManager.register({ name: 'sync', onSync: (e) => { events.push(e); } });

    const mgr = createOfflineManager({ enabled: true, autoSync: false });
    await mgr.sync(); // empty queue, online by default

    await flush();

    expect(events.map((e) => e.phase)).toEqual(['start', 'success']);
    expect(events[0].queueSize).toBe(0);
  });

  it('onConnectivityChange fires only on an actual online/offline transition', async () => {
    const seen: boolean[] = [];
    pluginManager.register({ name: 'conn', onConnectivityChange: (online) => { seen.push(online); } });

    const mgr = createOfflineManager({ enabled: true, autoSync: false });

    (mgr as any).updateNetworkState({ isConnected: false, type: 'none' });
    (mgr as any).updateNetworkState({ isConnected: false, type: 'none' }); // no transition
    (mgr as any).updateNetworkState({ isConnected: true, type: 'wifi' });
    await flush();

    expect(seen).toEqual([false, true]);
  });

  it('zero-plugin fast path: no sync/connectivity hooks run', async () => {
    const syncSpy = jest.spyOn(pluginManager, 'executeSyncHooks');
    const connSpy = jest.spyOn(pluginManager, 'executeConnectivityHooks');

    const mgr = createOfflineManager({ enabled: true, autoSync: false });
    await mgr.sync(); // online (default), empty queue
    (mgr as any).updateNetworkState({ isConnected: false, type: 'none' }); // connectivity transition

    expect(syncSpy).not.toHaveBeenCalled();
    expect(connSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
    connSpy.mockRestore();
  });
});
