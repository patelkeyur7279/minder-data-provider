/**
 * @jest-environment jsdom
 *
 * MDPD-6 (upload portion) — plugin `onUpload(event)` fired only via the
 * standalone MediaUploadManager, never via the useMinder / useMediaUpload path.
 * Both hooks call `apiClient.uploadFile(...)`, so wiring the plugin-bus emit
 * there makes onUpload reachable through the documented public hook API.
 *
 * A registered onUpload plugin must observe the full lifecycle through the hook
 * path with the documented UploadLifecycleEvent shape:
 *   { phase, uploadId, url?, file?, progress?, error?, timestamp }
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ApiClient } from '../src/core/ApiClient';
import { MediaUploadManager } from '../src/upload/MediaUploadManager';
import { MinderConfig } from '../src/core/types';
import { HttpMethod } from '../src/constants/enums';
import { pluginManager } from '../src/plugins/PluginSystem';
import type { UploadLifecycleEvent } from '../src/plugins/PluginSystem';

const flush = () => new Promise((r) => setTimeout(r, 0));

// MediaUploadManager wraps the XHR response in `new Response(...)`; polyfill it
// for jsdom (mirrors media-upload-manager.test.ts).
if (typeof Response === 'undefined') {
  (global as any).Response = class Response {
    body: any;
    status: number;
    statusText: string;
    headers: any;
    constructor(body: any, init: any) {
      this.body = body;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Map();
    }
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
  };
}

function makeConfig(plugin: any): MinderConfig {
  return {
    apiBaseUrl: 'https://api.example.com',
    routes: { upload: { url: '/upload', method: HttpMethod.POST } },
    plugins: [plugin],
  } as unknown as MinderConfig;
}

describe('MDPD-6: onUpload reachable via the useMinder/useMediaUpload path', () => {
  let events: UploadLifecycleEvent[];
  let client: ApiClient;

  beforeEach(() => {
    events = [];
  });

  it('fires start / progress / success with the documented event shape', async () => {
    client = new ApiClient(
      makeConfig({ name: 'upload-tracker', onUpload: (e: UploadLifecycleEvent) => events.push(e) })
    );

    // Mock the transport so it emits progress events then resolves.
    jest
      .spyOn(client.getAxiosInstance(), 'request')
      .mockImplementation(async (cfg: any) => {
        cfg.onUploadProgress?.({ loaded: 50, total: 100 });
        cfg.onUploadProgress?.({ loaded: 100, total: 100 });
        return { data: { url: 'https://cdn/x.png', id: 'up1' }, status: 200, headers: {}, config: cfg };
      });

    const file = new File(['hello'], 'x.png', { type: 'image/png' });
    const result = await client.uploadFile('upload', file);
    await flush();

    expect((result as any).url).toBe('https://cdn/x.png');

    const phases = events.map((e) => e.phase);
    expect(phases).toContain('start');
    expect(phases).toContain('progress');
    // Standardized on 'success' (parity with MediaUploadManager).
    expect(phases).toContain('success');
    expect(phases).not.toContain('complete');
    expect(phases).not.toContain('error');

    const start = events.find((e) => e.phase === 'start')!;
    expect(typeof start.uploadId).toBe('string');
    expect(start.uploadId.length).toBeGreaterThan(0);
    expect(typeof start.timestamp).toBe('number');
    expect(start.file).toEqual({ name: 'x.png', size: file.size, type: 'image/png' });

    const progress = events.find((e) => e.phase === 'progress')!;
    expect(progress.progress).toEqual({ loaded: 50, total: 100, percentage: 50 });
    // All events for one upload share a single uploadId.
    expect(new Set(events.map((e) => e.uploadId)).size).toBe(1);
  });

  it('fires phase:error when the transport rejects', async () => {
    client = new ApiClient(
      makeConfig({ name: 'upload-tracker-err', onUpload: (e: UploadLifecycleEvent) => events.push(e) })
    );

    jest
      .spyOn(client.getAxiosInstance(), 'request')
      .mockRejectedValue(new Error('network down'));

    const file = new File(['hello'], 'y.png', { type: 'image/png' });
    await expect(client.uploadFile('upload', file)).rejects.toThrow();
    await flush();

    const phases = events.map((e) => e.phase);
    expect(phases).toContain('start');
    expect(phases).toContain('error');
    expect(phases).not.toContain('success');
    expect(phases).not.toContain('complete');
    const err = events.find((e) => e.phase === 'error')!;
    expect(err.error?.message).toContain('network down');
  });

  // Upload phase parity (MDPD fix 2): BOTH the ApiClient.uploadFile path and the
  // standalone MediaUploadManager path must emit the terminal phase as 'success'
  // (never the old divergent 'complete').
  it('parity: ApiClient.uploadFile AND MediaUploadManager both emit terminal phase "success"', async () => {
    // ── ApiClient path ──
    const apiEvents: UploadLifecycleEvent[] = [];
    const apiClient = new ApiClient(
      makeConfig({ name: 'parity-api', onUpload: (e: UploadLifecycleEvent) => apiEvents.push(e) })
    );
    jest.spyOn(apiClient.getAxiosInstance(), 'request').mockResolvedValue({
      data: { url: 'https://cdn/x.png' },
      status: 200,
      headers: {},
      config: {},
    } as never);
    await apiClient.uploadFile('upload', new File(['a'], 'a.png', { type: 'image/png' }));
    await flush();
    pluginManager.unregister('parity-api');

    const apiTerminal = apiEvents.filter((e) => e.phase === 'success' || e.phase === 'complete');
    expect(apiTerminal.map((e) => e.phase)).toEqual(['success']);

    // ── MediaUploadManager path (XHR-driven) ──
    const mumEvents: UploadLifecycleEvent[] = [];
    pluginManager.register({ name: 'parity-mum', onUpload: (e) => mumEvents.push(e) });

    const xhrMock: any = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      upload: { addEventListener: jest.fn() },
      addEventListener: jest.fn(),
      abort: jest.fn(),
      status: 200,
      statusText: 'OK',
      response: JSON.stringify({ success: true, url: 'https://cdn/y.jpg' }),
    };
    const prevXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = jest.fn(() => xhrMock) as any;
    xhrMock.send.mockImplementation(() => {
      const load = xhrMock.addEventListener.mock.calls.find((c: any) => c[0] === 'load')[1];
      load();
    });

    const mum = new MediaUploadManager(
      { apiBaseUrl: 'https://api.example.com', routes: { upload: { url: '/upload', method: HttpMethod.POST } } } as unknown as MinderConfig,
      {} as any
    );
    await mum.uploadFile(new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
    await flush();
    window.XMLHttpRequest = prevXHR;
    pluginManager.unregister('parity-mum');

    const mumTerminal = mumEvents.filter((e) => e.phase === 'success' || e.phase === 'complete');
    expect(mumTerminal.map((e) => e.phase)).toEqual(['success']);
  });
});
