/**
 * @jest-environment jsdom
 *
 * Phase 5C: extended plugin contract — collectToken (auth-provider plugins),
 * the new capability-hook executors, and plugin hooks firing in standalone minder().
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import { minder } from '../src/core/minder';
import { PluginManager, pluginManager, registerPlugins } from '../src/plugins/PluginSystem';
import type { MinderPlugin } from '../src/plugins/PluginSystem';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Plugin contract — collectToken + executors (Phase 5C)', () => {
  it('collectToken returns the first non-empty provideToken result', async () => {
    const pm = new PluginManager();
    pm.register({ name: 'a', provideToken: () => null });
    pm.register({ name: 'b', provideToken: async () => 'tok-b' });
    pm.register({ name: 'c', provideToken: () => 'tok-c' });
    expect(await pm.collectToken()).toBe('tok-b');
  });

  it('collectToken returns null when no plugin provides a token', async () => {
    const pm = new PluginManager();
    pm.register({ name: 'x', onRequest: () => { /* no token */ } });
    expect(await pm.collectToken()).toBeNull();
  });

  it('isolates a throwing provideToken and continues to the next plugin', async () => {
    const pm = new PluginManager();
    pm.register({ name: 'bad', provideToken: () => { throw new Error('nope'); } });
    pm.register({ name: 'good', provideToken: () => 'ok' });
    expect(await pm.collectToken()).toBe('ok');
  });

  it('fires upload / sync / auth-refresh / connectivity hooks', async () => {
    const seen: string[] = [];
    const pm = new PluginManager();
    pm.register({
      name: 'rec',
      onUpload: (e) => { seen.push(`upload:${e.phase}`); },
      onSync: (e) => { seen.push(`sync:${e.phase}`); },
      onAuthRefresh: (t) => { seen.push(`auth:${t.accessToken}`); },
      onConnectivityChange: (on) => { seen.push(`net:${on}`); },
    });
    await pm.executeUploadHooks({ phase: 'start', uploadId: 'u1', timestamp: 0 });
    await pm.executeSyncHooks({ phase: 'complete', timestamp: 0 });
    await pm.executeAuthRefreshHooks({ accessToken: 'AT' });
    await pm.executeConnectivityHooks(true);
    expect(seen).toEqual(['upload:start', 'sync:complete', 'auth:AT', 'net:true']);
  });
});

describe('Standalone minder() fires global plugin hooks (Phase 5C)', () => {
  let events: string[];
  const recorder: MinderPlugin = {
    name: 'minder-recorder',
    onRequest: () => { events.push('request'); },
    onResponse: () => { events.push('response'); },
    onError: () => { events.push('error'); },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    events = [];
    registerPlugins(recorder);
  });

  afterEach(() => {
    pluginManager.unregister('minder-recorder');
  });

  // p-u5-unknown-route-name-typo (fix): minder() now throws ROUTE_NOT_FOUND
  // for a bare, unregistered route NAME — this describe block's own point is
  // plugin-hook firing over a MOCKED transport, not route registration
  // (no configureMinder/route registry runs in this file at all), so it
  // uses the leading-'/' ad-hoc-path convention (exempt from that check)
  // instead of a bare name that was never actually registered.
  it('fires onRequest + onResponse on success', async () => {
    mockedAxios.mockResolvedValueOnce({ data: { ok: true }, status: 200, headers: {} } as any);
    const res = await minder('/users');
    await flush();
    expect(res.success).toBe(true);
    expect(events).toContain('request');
    expect(events).toContain('response');
  });

  it('fires onError on failure', async () => {
    mockedAxios.mockRejectedValueOnce(
      Object.assign(new Error('fail'), { isAxiosError: true, response: { status: 500 } })
    );
    const res = await minder('/users');
    await flush();
    expect(res.success).toBe(false);
    expect(events).toContain('error');
  });
});
