/**
 * @jest-environment node
 *
 * Contract + parity + security tests for @minder/provider-supabase.
 *
 * Runs in the `node` environment (no DOM): these tests exercise the capability
 * contracts directly (no React rendering), and the `node` env lets `secret()`
 * capture a value so the secret-leak sentinel can prove the value never escapes.
 *
 * No `@supabase/supabase-js` is installed — the real path is driven entirely
 * through the injected `createClientFactory` DI seam, and the SDK-missing path is
 * asserted by letting the default factory try (and fail) to import it.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { registerSupabaseProvider, getProviderClient } from './src/index.js';
import {
  createMockAuth,
  createMockStorage,
  createMockLive,
  emitMockLiveEvent,
} from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { AuthContract, StorageContract, LiveContract } from '../../src/contracts/types.js';
import { secret } from '../../src/security/secrets.js';

// ---------------------------------------------------------------------------
// A fake Supabase client that records calls and lets tests drive Realtime.
// Shapes match exactly the subset the adapter touches (see src/index.ts).
// ---------------------------------------------------------------------------

interface FakeChannel {
  __name: string;
  on(type: string, filter: { event: string }, cb: (payload: unknown) => void): FakeChannel;
  subscribe(): FakeChannel;
}

function makeFakeSupabase(opts: { uploadError?: unknown; removeError?: unknown } = {}) {
  const calls = {
    factoryArgs: null as { url: string; key: string } | null,
    signOutCount: 0,
    uploads: [] as Array<{ bucket: string; path: string; file: unknown }>,
    removes: [] as Array<{ bucket: string; paths: string[] }>,
    removedChannels: [] as string[],
    publicUrlArgs: [] as Array<{ bucket: string; path: string }>,
  };
  const channelHandlers = new Map<string, (payload: unknown) => void>();

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'u-real' }, access_token: 'jwt-real' } },
      }),
      signOut: async () => {
        calls.signOutCount++;
        return { error: null };
      },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: unknown) => {
          calls.uploads.push({ bucket, path, file });
          return { error: opts.uploadError ?? null };
        },
        getPublicUrl: (path: string) => {
          calls.publicUrlArgs.push({ bucket, path });
          return { data: { publicUrl: `https://cdn.supabase.test/${bucket}/${path}` } };
        },
        remove: async (paths: string[]) => {
          calls.removes.push({ bucket, paths });
          return { error: opts.removeError ?? null };
        },
      }),
    },
    channel: (name: string): FakeChannel => {
      const ch: FakeChannel = {
        __name: name,
        on(_type, _filter, cb) {
          channelHandlers.set(name, cb);
          return ch;
        },
        subscribe() {
          return ch;
        },
      };
      return ch;
    },
    removeChannel: (ch: FakeChannel) => {
      calls.removedChannels.push(ch.__name);
      channelHandlers.delete(ch.__name);
    },
  };

  const factory = (url: string, key: string) => {
    calls.factoryArgs = { url, key };
    return client;
  };

  const emit = (name: string, payload: unknown) => channelHandlers.get(name)?.(payload);

  return { client, factory, calls, emit };
}

// ---------------------------------------------------------------------------
// Shared behavioral assertions — run against BOTH the real (fake-client) impls
// and the in-memory mock impls to prove parity.
// ---------------------------------------------------------------------------

async function assertAuthBehaves(auth: AuthContract): Promise<void> {
  const session = await auth.getSession();
  expect(session).not.toBeNull();
  expect(typeof session!.userId).toBe('string');
  expect(session!.userId.length).toBeGreaterThan(0);
  expect(session!.raw).toBeDefined();
  await expect(auth.signOut()).resolves.toBeUndefined();
}

async function assertStorageBehaves(storage: StorageContract): Promise<void> {
  const uploaded = await storage.upload(new Blob(['hello']), 'avatars/user/1.png');
  expect(typeof uploaded.url).toBe('string');
  expect(uploaded.url.length).toBeGreaterThan(0);
  await expect(storage.remove('avatars/user/1.png')).resolves.toBeUndefined();
}

function assertLiveBehaves(live: LiveContract, emit: (channel: string, event: unknown) => void): void {
  const received: unknown[] = [];
  const unsubscribe = live.subscribe('room-1', (event) => received.push(event));

  emit('room-1', { hello: 'world' });
  expect(received).toEqual([{ hello: 'world' }]);

  unsubscribe();
  emit('room-1', { after: 'unsubscribe' });
  // No further delivery once unsubscribed.
  expect(received).toEqual([{ hello: 'world' }]);
}

// ---------------------------------------------------------------------------
// Cleanup — registry is shared module state; unregister everything per test.
// ---------------------------------------------------------------------------

let cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  jest.restoreAllMocks();
});

function grab<T>(capability: 'auth' | 'storage' | 'live'): T {
  const provider = getCapabilityProvider(capability);
  if (!provider) throw new Error(`no provider registered for ${capability}`);
  return provider.implementation as T;
}

// ---------------------------------------------------------------------------
// Real path (injected fake client) — the three contracts behave
// ---------------------------------------------------------------------------

describe('registerSupabaseProvider — real path via injected createClientFactory', () => {
  it('creates ONE client from (url, anonKey) and registers auth + storage + live', async () => {
    const fake = makeFakeSupabase();
    const unregister = await registerSupabaseProvider({
      url: 'https://proj.supabase.co',
      anonKey: 'anon-public-key',
      createClientFactory: fake.factory,
    });
    cleanups.push(unregister);

    expect(fake.calls.factoryArgs).toEqual({ url: 'https://proj.supabase.co', key: 'anon-public-key' });
    for (const cap of ['auth', 'storage', 'live'] as const) {
      const p = getCapabilityProvider(cap);
      expect(p).not.toBeNull();
      expect(p!.providerName).toBe('@minder/provider-supabase');
      expect(p!.isMock).toBeFalsy();
    }
    // getProviderClient() returns the raw client (escape hatch).
    expect(getProviderClient()).toBe(fake.client);
  });

  it('AuthContract: getSession maps user.id -> userId, signOut calls through', async () => {
    const fake = makeFakeSupabase();
    cleanups.push(
      await registerSupabaseProvider({
        url: 'https://x.supabase.co',
        anonKey: 'anon',
        createClientFactory: fake.factory,
      })
    );

    const auth = grab<AuthContract>('auth');
    const session = await auth.getSession();
    expect(session).toEqual({ userId: 'u-real', raw: { user: { id: 'u-real' }, access_token: 'jwt-real' } });

    await auth.signOut();
    expect(fake.calls.signOutCount).toBe(1);

    await assertAuthBehaves(auth);
  });

  it('StorageContract: upload uses first path segment as bucket + returns getPublicUrl, remove targets [objectPath]', async () => {
    const fake = makeFakeSupabase();
    cleanups.push(
      await registerSupabaseProvider({
        url: 'https://x.supabase.co',
        anonKey: 'anon',
        createClientFactory: fake.factory,
      })
    );

    const storage = grab<StorageContract>('storage');
    const uploaded = await storage.upload(new Blob(['x']), 'avatars/user/1.png');

    expect(fake.calls.uploads).toEqual([{ bucket: 'avatars', path: 'user/1.png', file: expect.anything() }]);
    expect(uploaded).toEqual({ url: 'https://cdn.supabase.test/avatars/user/1.png' });

    await storage.remove('avatars/user/1.png');
    expect(fake.calls.removes).toEqual([{ bucket: 'avatars', paths: ['user/1.png'] }]);

    await assertStorageBehaves(storage);
  });

  it('StorageContract: upload/remove reject when the SDK returns an error', async () => {
    const fake = makeFakeSupabase({ uploadError: new Error('upload failed'), removeError: new Error('remove failed') });
    cleanups.push(
      await registerSupabaseProvider({
        url: 'https://x.supabase.co',
        anonKey: 'anon',
        createClientFactory: fake.factory,
      })
    );

    const storage = grab<StorageContract>('storage');
    await expect(storage.upload(new Blob(['x']), 'b/o.png')).rejects.toThrow('upload failed');
    await expect(storage.remove('b/o.png')).rejects.toThrow('remove failed');
  });

  it('LiveContract: subscribe delivers broadcast events, unsubscribe removes the channel', async () => {
    const fake = makeFakeSupabase();
    cleanups.push(
      await registerSupabaseProvider({
        url: 'https://x.supabase.co',
        anonKey: 'anon',
        createClientFactory: fake.factory,
      })
    );

    const live = grab<LiveContract>('live');
    assertLiveBehaves(live, fake.emit);
    expect(fake.calls.removedChannels).toContain('room-1');
  });

  it('unregister() tears down all three capabilities and clears the raw client', async () => {
    const fake = makeFakeSupabase();
    const unregister = await registerSupabaseProvider({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
      createClientFactory: fake.factory,
    });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();

    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getCapabilityProvider('storage')).toBeNull();
    expect(getCapabilityProvider('live')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });

  it('rejects when url or anonKey is missing (real path)', async () => {
    await expect(
      registerSupabaseProvider({ url: '', anonKey: 'anon' })
    ).rejects.toThrow(/"url" and "anonKey" are required/);
  });
});

// ---------------------------------------------------------------------------
// SDK-missing error
// ---------------------------------------------------------------------------

describe('registerSupabaseProvider — SDK missing', () => {
  it('throws the exact optional-peer install message when @supabase/supabase-js is not installed', async () => {
    // No createClientFactory -> default factory tries to import the (uninstalled) SDK.
    await expect(
      registerSupabaseProvider({ url: 'https://x.supabase.co', anonKey: 'anon' })
    ).rejects.toThrow('Install @supabase/supabase-js (optional peer): npm i @supabase/supabase-js');
  });
});

// ---------------------------------------------------------------------------
// Mock mode (zero SDK, zero keys) + parity
// ---------------------------------------------------------------------------

describe('registerSupabaseProvider — mock mode', () => {
  it('mock:true registers all three capabilities as isMock with zero SDK / zero keys', async () => {
    const unregister = await registerSupabaseProvider({ url: '', anonKey: '', mock: true });
    cleanups.push(unregister);

    for (const cap of ['auth', 'storage', 'live'] as const) {
      const p = getCapabilityProvider(cap);
      expect(p).not.toBeNull();
      expect(p!.isMock).toBe(true);
      expect(p!.providerName).toBe('@minder/provider-supabase');
    }
    // Mock mode holds no raw SDK client.
    expect(getProviderClient()).toBeNull();
  });

  it('unregister() from mock mode tears down all three capabilities', async () => {
    const unregister = await registerSupabaseProvider({ url: '', anonKey: '', mock: true });
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getCapabilityProvider('storage')).toBeNull();
    expect(getCapabilityProvider('live')).toBeNull();
  });
});

describe('mock parity — the mocks satisfy the SAME behavioral contract as the real impls', () => {
  it('mock AuthContract behaves (and signOut clears the session)', async () => {
    const auth = createMockAuth();
    await assertAuthBehaves(auth);

    const fresh = createMockAuth();
    expect(await fresh.getSession()).toMatchObject({ userId: 'mock-user-1' });
    await fresh.signOut();
    expect(await fresh.getSession()).toBeNull();
  });

  it('mock StorageContract behaves (deterministic mock:// URLs)', async () => {
    const storage = createMockStorage();
    await assertStorageBehaves(storage);

    const uploaded = await storage.upload(new Blob(['x']), 'avatars/user/1.png');
    expect(uploaded).toEqual({ url: 'mock://avatars/user/1.png' });
  });

  it('mock LiveContract behaves (emitMockLiveEvent drives subscribers)', () => {
    const live = createMockLive();
    assertLiveBehaves(live, emitMockLiveEvent);
  });
});

// ---------------------------------------------------------------------------
// Security sentinel — a serviceRoleKey CredentialInput never leaks
// ---------------------------------------------------------------------------

describe('security — serviceRoleKey never appears in any output', () => {
  it('the raw service-role value never reaches logs, errors, or a serialized config', async () => {
    const SENTINEL = 'super-secret-service-role-value-DO-NOT-LEAK-9876543210';

    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    // A CredentialInput carrying a real (fake) value — proves the value is held
    // but never emitted. (node env => secret() captures the value.)
    const serviceRoleKey = secret('SUPABASE_SERVICE_ROLE_KEY', SENTINEL);
    const fake = makeFakeSupabase({ uploadError: new Error('induced upload failure') });

    const config = {
      url: 'https://x.supabase.co',
      anonKey: 'anon',
      serviceRoleKey,
      createClientFactory: fake.factory,
    };

    // The SecretRef masks itself under stringification/serialization.
    expect(String(serviceRoleKey)).toBe('[SECRET:SUPABASE_SERVICE_ROLE_KEY]');
    expect(JSON.stringify(config)).not.toContain(SENTINEL);

    const unregister = await registerSupabaseProvider(config);
    cleanups.push(unregister);

    const auth = grab<AuthContract>('auth');
    await auth.getSession();
    await auth.signOut();

    // Drive a failure path and capture the error surface too.
    const storage = grab<StorageContract>('storage');
    let uploadErr: unknown;
    try {
      await storage.upload(new Blob(['x']), 'bucket/obj.png');
    } catch (e) {
      uploadErr = e;
    }
    expect(uploadErr).toBeInstanceOf(Error);
    expect(`${(uploadErr as Error).message}\n${(uploadErr as Error).stack ?? ''}`).not.toContain(SENTINEL);

    unregister();

    expect(captured.join('\n')).not.toContain(SENTINEL);
  });
});
