/**
 * M1-05: `minder-data-provider/testing` harness.
 *
 * Covers `mockApiClient`, `createMockProvider`, `contractTest`, and
 * `expectNoSecretLeak` from `src/testing`.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  mockApiClient,
  createMockProvider,
  contractTest,
  expectNoSecretLeak,
} from '../src/testing/index';
import type { ProviderManifest } from '../src/plugins/manifest';

const validManifest: ProviderManifest = {
  name: '@minder/provider-testfixture',
  version: '1.0.0',
  displayName: 'Test Fixture Provider',
  categories: ['database'],
  capabilities: ['auth-provider'],
  config: {
    clientSafe: ['url', 'anonKey'],
    serverOnly: ['serviceRoleKey'],
  },
  scopes: [{ scope: 'database:read', why: 'Read rows on behalf of the signed-in user.' }],
  runtimes: ['web', 'node'],
  frameworks: ['react'],
  peerDependencies: { 'some-sdk': '^1.0.0' },
  docs: {
    setup: './README.md',
    example: './example.ts',
    security: './README.md',
  },
  license: 'MIT',
};

const invalidManifest = {
  name: 'not-scoped',
  version: 'not-semver',
  displayName: '',
  categories: [],
  capabilities: ['x'],
  config: { clientSafe: ['a'], serverOnly: ['a'] }, // overlap
  scopes: [{ scope: '' }], // missing why
  runtimes: [],
  frameworks: [],
  peerDependencies: {},
  docs: { setup: '', example: '', security: '' },
} as unknown as ProviderManifest;

describe('mockApiClient', () => {
  it('records calls made to each method', async () => {
    const client = mockApiClient();

    await client.request('getUsers', { page: 1 });
    client.getAxiosInstance();
    client.resetPerformanceMetrics();

    expect(client.request.calls).toEqual([['getUsers', { page: 1 }]]);
    expect(client.getAxiosInstance.calls).toEqual([[]]);
    expect(client.resetPerformanceMetrics.calls).toEqual([[]]);
  });

  it('resolves configured responses by route name, else {}', async () => {
    const client = mockApiClient({ responses: { getUsers: [{ id: 1 }], getPosts: null } });

    await expect(client.request('getUsers')).resolves.toEqual([{ id: 1 }]);
    await expect(client.request('getPosts')).resolves.toBeNull();
    await expect(client.request('unconfiguredRoute')).resolves.toEqual({});
  });

  it('allows overriding a method implementation and using mock* helpers', async () => {
    const client = mockApiClient();
    client.request.mockResolvedValue({ ok: true });

    await expect(client.request('anything')).resolves.toEqual({ ok: true });
    expect(client.request.calls.length).toBe(1);

    client.request.mockReset();
    expect(client.request.calls.length).toBe(0);
  });
});

describe('createMockProvider', () => {
  it('rejects an invalid manifest', () => {
    expect(() => createMockProvider(invalidManifest)).toThrow(/Invalid provider manifest/);
  });

  it('accepts a valid manifest and returns { manifest, plugin }', () => {
    const { manifest, plugin } = createMockProvider(validManifest);

    expect(manifest).toBe(validManifest);
    expect(plugin.name).toBe(validManifest.name);
    expect(plugin.version).toBe(validManifest.version);
  });

  it('wires impl callbacks through as plugin hooks (passthrough)', async () => {
    const calls: string[] = [];
    const { plugin } = createMockProvider(validManifest, {
      onRequest: async () => {
        calls.push('onRequest');
      },
      onResponse: async () => {
        calls.push('onResponse');
      },
      provideToken: async () => 'token-123',
    });

    await plugin.onRequest?.({ method: 'GET', url: '/x', timestamp: Date.now() });
    await plugin.onResponse?.({ status: 200, data: {}, duration: 1, timestamp: Date.now() });
    const token = await plugin.provideToken?.();

    expect(calls).toEqual(['onRequest', 'onResponse']);
    expect(token).toBe('token-123');
  });
});

describe('contractTest', () => {
  const fixtures = [
    {
      name: 'get user by id',
      request: { routeName: 'getUser', params: { id: '1' } },
      expectedResponse: { id: '1', name: 'Ada' },
    },
    {
      name: 'list users',
      request: { routeName: 'listUsers' },
      expectedResponse: [{ id: '1' }, { id: '2' }],
    },
  ];

  it('passes when every fixture matches', async () => {
    const adapter = async (req: { routeName: string; params?: Record<string, unknown> }) => {
      if (req.routeName === 'getUser') return { id: req.params?.id, name: 'Ada' };
      if (req.routeName === 'listUsers') return [{ id: '1' }, { id: '2' }];
      throw new Error('unknown route');
    };

    const result = await contractTest(adapter, fixtures);

    expect(result.passed).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it('reports a diff for mismatching fixtures', async () => {
    const adapter = async (req: { routeName: string }) => {
      if (req.routeName === 'getUser') return { id: '1', name: 'WRONG NAME' };
      return [{ id: '1' }]; // missing one element vs expected
    };

    const result = await contractTest(adapter, fixtures);

    expect(result.passed).toBe(false);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].name).toBe('get user by id');
    expect(result.failed[0].diff).toContain('name');
    expect(result.failed[0].diff).toContain('WRONG NAME');
    expect(result.failed[1].name).toBe('list users');
  });

  it('reports a diff (not a throw) when the adapter rejects', async () => {
    const adapter = async () => {
      throw new Error('boom');
    };

    const result = await contractTest(adapter, [fixtures[0]]);

    expect(result.passed).toBe(false);
    expect(result.failed[0].diff).toContain('boom');
  });
});

describe('expectNoSecretLeak', () => {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };

  afterEach(() => {
    expect(console.log).toBe(originalConsole.log);
    expect(console.warn).toBe(originalConsole.warn);
    expect(console.error).toBe(originalConsole.error);
    expect(console.info).toBe(originalConsole.info);
  });

  it('passes on a clean function and restores console', async () => {
    await expect(
      expectNoSecretLeak(() => {
        console.log('hello world');
        console.info({ userId: 42, name: 'Ada' });
      })
    ).resolves.toBeUndefined();
  });

  it('throws listing the key when fn logs a secret-shaped value under a suspicious key', async () => {
    await expect(
      expectNoSecretLeak(() => {
        console.log({ user: 'ada', password: 'super-secret-password-123' });
      })
    ).rejects.toThrow(/password/);
  });

  it('throws when fn logs an apiKey-shaped (Stripe secret key) string', async () => {
    await expect(
      expectNoSecretLeak(() => {
        console.error('using key', 'sk_live_51H8xJ2eZvKYlo2C0FQ5uXjKabcdefgh');
      })
    ).rejects.toThrow(/Stripe secret key/);
  });

  it('restores console even when fn itself throws', async () => {
    await expect(
      expectNoSecretLeak(() => {
        console.log('about to fail');
        throw new Error('fn failure');
      })
    ).rejects.toThrow('fn failure');
  });

  it('supports async fn', async () => {
    await expect(
      expectNoSecretLeak(async () => {
        await Promise.resolve();
        console.warn('async clean log');
      })
    ).resolves.toBeUndefined();
  });
});
