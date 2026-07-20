/**
 * @jest-environment jsdom
 *
 * MDPD-10 — `configureMinder({ plugins: [...] })` was silently dropped.
 *
 * docs/FEATURES.md documents per-instance plugin registration via the config
 * object, but UnifiedMinderConfig had no `plugins` field, so the key was
 * discarded with an unknown-key warning and no hook ever fired. The fix adds
 * `plugins` to the config type and registers them through the pluginManager,
 * idempotently on re-configure (replace previously config-registered plugins).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';

import { configureMinder } from '../src/config/index';
import { minder } from '../src/core/minder';
import { pluginManager } from '../src/plugins/PluginSystem';
import type { MinderPlugin } from '../src/plugins/PluginSystem';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const flush = () => new Promise((res) => setTimeout(res, 0));

function clearGlobalPlugins() {
  for (const p of pluginManager.getPlugins()) {
    pluginManager.unregister(p.name);
  }
}

describe('MDPD-10: configureMinder({ plugins })', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalPlugins();
  });
  afterEach(() => clearGlobalPlugins());

  it('registers plugins from config so their onRequest hook fires on minder()', async () => {
    const seen: string[] = [];
    const plugin: MinderPlugin = {
      name: 'config-onrequest',
      onRequest: (req) => {
        seen.push(req.url);
      },
    };

    configureMinder({
      apiUrl: 'http://api.example.com',
      plugins: [plugin],
    });

    mockedAxios.mockResolvedValueOnce({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as any);

    await minder('/users');
    await flush();

    expect(seen).toContain('/users');
    expect(pluginManager.getPlugins().map((p) => p.name)).toContain('config-onrequest');
  });

  it('is idempotent across re-configure: no duplicate registration warning storm', async () => {
    const plugin: MinderPlugin = { name: 'idem', onRequest: () => {} };

    configureMinder({ apiUrl: 'http://api.example.com', plugins: [plugin] });
    // Re-configuring with the same-named plugin should replace, not error or duplicate.
    configureMinder({ apiUrl: 'http://api.example.com', plugins: [plugin] });

    const idemCount = pluginManager
      .getPlugins()
      .filter((p) => p.name === 'idem').length;
    expect(idemCount).toBe(1);
  });

  it('re-configuring with a different plugins array unregisters prior config plugins', async () => {
    const a: MinderPlugin = { name: 'plugin-a', onRequest: () => {} };
    const b: MinderPlugin = { name: 'plugin-b', onRequest: () => {} };

    configureMinder({ apiUrl: 'http://api.example.com', plugins: [a] });
    configureMinder({ apiUrl: 'http://api.example.com', plugins: [b] });

    const names = pluginManager.getPlugins().map((p) => p.name);
    expect(names).toContain('plugin-b');
    expect(names).not.toContain('plugin-a');
  });
});
