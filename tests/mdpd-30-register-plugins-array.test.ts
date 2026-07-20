/**
 * @jest-environment jsdom
 *
 * MDPD-30 — `registerPlugins([a, b])` (array arg) silently registers nothing useful.
 *
 * `registerPlugins` is variadic (`registerPlugins(a, b)`). Passing an array —
 * the natural guess — registered the array OBJECT as if it were a plugin, so no
 * hook ever fired and no error was raised. The fix flattens array arguments and
 * warn-rejects any entry lacking a string `name`.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';

import { registerPlugins, pluginManager } from '../src/plugins/PluginSystem';
import type { MinderPlugin } from '../src/plugins/PluginSystem';
import { minder, configureMinder } from '../src/core/minder';
import { Logger } from '../src/utils/Logger';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const flush = () => new Promise((res) => setTimeout(res, 0));

function clearGlobalPlugins() {
  for (const p of pluginManager.getPlugins()) {
    pluginManager.unregister(p.name);
  }
}

describe('MDPD-30: registerPlugins array flattening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearGlobalPlugins();
    configureMinder({
      baseURL: 'http://api.example.com',
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  afterEach(() => clearGlobalPlugins());

  it('registers both plugins passed as an array and fires their hooks', async () => {
    const seen: string[] = [];
    const a: MinderPlugin = { name: 'arr-a', onRequest: () => seen.push('a') };
    const b: MinderPlugin = { name: 'arr-b', onRequest: () => seen.push('b') };

    // The natural but previously-broken form: pass an array.
    registerPlugins([a, b] as unknown as MinderPlugin);

    const names = pluginManager.getPlugins().map((p) => p.name);
    expect(names).toContain('arr-a');
    expect(names).toContain('arr-b');

    mockedAxios.mockResolvedValueOnce({
      data: {}, status: 200, statusText: 'OK', headers: {}, config: {},
    } as any);

    await minder('/users');
    await flush();

    expect(seen).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('still supports the variadic form', () => {
    const a: MinderPlugin = { name: 'var-a', onRequest: () => {} };
    const b: MinderPlugin = { name: 'var-b', onRequest: () => {} };
    registerPlugins(a, b);
    const names = pluginManager.getPlugins().map((p) => p.name);
    expect(names).toContain('var-a');
    expect(names).toContain('var-b');
  });

  it('warns and does not register an entry lacking a string name', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const nameless = { onRequest: () => {} } as unknown as MinderPlugin;

    registerPlugins(nameless);

    expect(pluginManager.getPlugins().length).toBe(0);
    expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });

  // MDPD fix: registerPlugins previously flattened only ONE level, so a
  // nested array (e.g. from spreading two already-grouped plugin lists) was
  // dropped with a misleading "no string name" warning instead of being
  // registered. Flattening must now go to any depth.
  it('deep-flattens nested arrays: registerPlugins([[a, b], c]) registers all three', () => {
    const a: MinderPlugin = { name: 'deep-a', onRequest: () => {} };
    const b: MinderPlugin = { name: 'deep-b', onRequest: () => {} };
    const c: MinderPlugin = { name: 'deep-c', onRequest: () => {} };

    registerPlugins([[a, b], c] as unknown as MinderPlugin);

    const names = pluginManager.getPlugins().map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['deep-a', 'deep-b', 'deep-c']));
  });

  it('deep-flattens arbitrarily deep nesting: registerPlugins([[[a]]]) registers a', () => {
    const a: MinderPlugin = { name: 'triple-nested-a', onRequest: () => {} };

    registerPlugins([[[a]]] as unknown as MinderPlugin);

    const names = pluginManager.getPlugins().map((p) => p.name);
    expect(names).toContain('triple-nested-a');
  });
});
