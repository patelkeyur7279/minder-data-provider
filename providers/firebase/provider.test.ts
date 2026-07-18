/**
 * @jest-environment node
 *
 * Contract + parity + credential-file security tests for @minder/provider-firebase.
 *
 * Runs in the `node` environment (no DOM) so:
 *   - `resolveCredential` (server-only; throws when `window` is defined) can read
 *     a real temp file for the FileRef path,
 *   - `secret()` captures a value so the leak sentinel can prove it never escapes.
 * A few tests that assert BROWSER behavior (the server-only guard, and the
 * public-apiKey config-validation case) temporarily install a fake `global.window`
 * and restore it afterwards — mirroring the client/server toggle in
 * `tests/config-validation.test.ts`.
 *
 * No `firebase` SDK is installed — the real path is driven entirely through the
 * injected `createFirebaseFactory` DI seam, and the SDK-missing path is asserted
 * by letting the default factory try (and fail) to import it.
 *
 * SECURITY: every fake secret is constructed at RUNTIME (never a scanner-matching
 * literal in the repo).
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  registerFirebaseProvider,
  getProviderClient,
  validateServiceAccount,
  loadServiceAccount,
} from './src/index.js';
import { createMockAuth, createMockStorage } from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { AuthContract, StorageContract } from '../../src/contracts/types.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';
import { secret } from '../../src/security/secrets.js';
import type { FileRef } from '../../src/security/credentials.js';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// A fake Firebase client facade (the shape the adapter's contracts consume).
// ---------------------------------------------------------------------------

function makeFakeFirebase() {
  const app = { __fakeFirebaseApp: true };
  const calls = {
    signOutCount: 0,
    uploads: [] as Array<{ path: string; data: unknown }>,
    removes: [] as string[],
    downloadUrlArgs: [] as string[],
  };
  let currentUser: { uid: string; [k: string]: unknown } | null = {
    uid: 'u-real',
    email: 'real@example.test',
  };
  const objects = new Map<string, unknown>();

  const client = {
    app,
    auth: {
      async getCurrentUser() {
        return currentUser;
      },
      async signOut() {
        // Count only (do NOT clear the user) so the shared behavioral assertions
        // can run getSession() before + after signOut against the same fake.
        calls.signOutCount++;
      },
    },
    storage: {
      async upload(p: string, data: unknown) {
        calls.uploads.push({ path: p, data });
        objects.set(p, data);
      },
      async getDownloadURL(p: string) {
        calls.downloadUrlArgs.push(p);
        return `https://firebasestorage.test/o/${encodeURIComponent(p)}`;
      },
      async remove(p: string) {
        calls.removes.push(p);
        objects.delete(p);
      },
    },
  };

  const factory = () => client;
  const setUser = (u: typeof currentUser) => {
    currentUser = u;
  };
  return { app, client, factory, calls, setUser };
}

// ---------------------------------------------------------------------------
// Shared behavioral assertions — run against BOTH the real (fake) impls and the
// in-memory mocks to prove parity.
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

// ---------------------------------------------------------------------------
// Runtime-constructed fake service account (NEVER a repo literal).
// ---------------------------------------------------------------------------

const FAKE_PK_BODY = 'fake'.repeat(4); // 'fakefakefakefake'

function makeFakeServiceAccount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'service_account',
    project_id: 'demo',
    client_email: 'firebase-adminsdk-abcde@demo.iam.gserviceaccount.com',
    private_key: ['-----BEGIN PRIVATE KEY-----', FAKE_PK_BODY, '-----END PRIVATE KEY-----'].join('\n'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cleanup — the registry is shared module state; unregister everything per test.
// ---------------------------------------------------------------------------

let cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  jest.restoreAllMocks();
});

function grab<T>(capability: 'auth' | 'storage'): T {
  const provider = getCapabilityProvider(capability);
  if (!provider) throw new Error(`no provider registered for ${capability}`);
  return provider.implementation as T;
}

// ---------------------------------------------------------------------------
// Real path (injected fake facade) — the two contracts behave
// ---------------------------------------------------------------------------

describe('registerFirebaseProvider — real path via injected createFirebaseFactory', () => {
  it('creates ONE client and registers auth + storage; getProviderClient() returns the raw app', async () => {
    const fake = makeFakeFirebase();
    const unregister = await registerFirebaseProvider({
      apiKey: 'AIzaSy-public',
      projectId: 'demo',
      createFirebaseFactory: fake.factory,
    });
    cleanups.push(unregister);

    for (const cap of ['auth', 'storage'] as const) {
      const p = getCapabilityProvider(cap);
      expect(p).not.toBeNull();
      expect(p!.providerName).toBe('@minder/provider-firebase');
      expect(p!.isMock).toBeFalsy();
    }
    expect(getProviderClient()).toBe(fake.app);
  });

  it('AuthContract: getSession maps user.uid -> userId, signOut calls through; null when signed out', async () => {
    const fake = makeFakeFirebase();
    cleanups.push(
      await registerFirebaseProvider({
        apiKey: 'AIzaSy-public',
        projectId: 'demo',
        createFirebaseFactory: fake.factory,
      })
    );

    const auth = grab<AuthContract>('auth');
    const session = await auth.getSession();
    expect(session).toEqual({
      userId: 'u-real',
      raw: { uid: 'u-real', email: 'real@example.test' },
    });

    await auth.signOut();
    expect(fake.calls.signOutCount).toBe(1);

    await assertAuthBehaves(auth);

    // getSession resolves null when there is no current user.
    fake.setUser(null);
    expect(await auth.getSession()).toBeNull();
  });

  it('StorageContract: upload stores then returns getDownloadURL; remove deletes; leading slash normalized', async () => {
    const fake = makeFakeFirebase();
    cleanups.push(
      await registerFirebaseProvider({
        apiKey: 'AIzaSy-public',
        projectId: 'demo',
        createFirebaseFactory: fake.factory,
      })
    );

    const storage = grab<StorageContract>('storage');
    const uploaded = await storage.upload(new Blob(['x']), '/avatars/user/1.png');

    // Leading slash stripped before the SDK sees it.
    expect(fake.calls.uploads).toEqual([{ path: 'avatars/user/1.png', data: expect.anything() }]);
    expect(fake.calls.downloadUrlArgs).toEqual(['avatars/user/1.png']);
    expect(uploaded.url).toBe(
      `https://firebasestorage.test/o/${encodeURIComponent('avatars/user/1.png')}`
    );

    await storage.remove('avatars/user/1.png');
    expect(fake.calls.removes).toEqual(['avatars/user/1.png']);

    await assertStorageBehaves(storage);
  });

  it('unregister() tears down both capabilities and clears the raw client', async () => {
    const fake = makeFakeFirebase();
    const unregister = await registerFirebaseProvider({
      apiKey: 'AIzaSy-public',
      projectId: 'demo',
      createFirebaseFactory: fake.factory,
    });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();

    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getCapabilityProvider('storage')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });

  it('rejects when apiKey or projectId is missing (real path)', async () => {
    await expect(
      registerFirebaseProvider({ apiKey: '', projectId: 'demo', createFirebaseFactory: () => ({}) })
    ).rejects.toThrow(/"apiKey" and "projectId" are required/);
  });
});

// ---------------------------------------------------------------------------
// SDK-missing error
// ---------------------------------------------------------------------------

describe('registerFirebaseProvider — SDK missing', () => {
  it('throws the exact optional-peer install message when firebase is not installed', async () => {
    // No createFirebaseFactory -> default factory tries to import the (uninstalled) SDK.
    await expect(
      registerFirebaseProvider({ apiKey: 'AIzaSy-public', projectId: 'demo' })
    ).rejects.toThrow('Install firebase (optional peer): npm i firebase');
  });
});

// ---------------------------------------------------------------------------
// Mock mode (zero SDK, zero keys) + parity
// ---------------------------------------------------------------------------

describe('registerFirebaseProvider — mock mode', () => {
  it('mock:true registers both capabilities as isMock with zero SDK / zero keys', async () => {
    const unregister = await registerFirebaseProvider({ mock: true });
    cleanups.push(unregister);

    for (const cap of ['auth', 'storage'] as const) {
      const p = getCapabilityProvider(cap);
      expect(p).not.toBeNull();
      expect(p!.isMock).toBe(true);
      expect(p!.providerName).toBe('@minder/provider-firebase');
    }
    // Mock mode holds no raw SDK app.
    expect(getProviderClient()).toBeNull();
  });

  it('unregister() from mock mode tears down both capabilities', async () => {
    const unregister = await registerFirebaseProvider({ mock: true });
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getCapabilityProvider('storage')).toBeNull();
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

  it('mock StorageContract behaves (deterministic firebase-mock:// URLs)', async () => {
    const storage = createMockStorage();
    await assertStorageBehaves(storage);

    const uploaded = await storage.upload(new Blob(['x']), 'avatars/user/1.png');
    expect(uploaded).toEqual({ url: 'firebase-mock://storage/avatars/user/1.png' });
  });
});

// ---------------------------------------------------------------------------
// validateServiceAccount — masked health only, private_key NEVER in output
// ---------------------------------------------------------------------------

describe('validateServiceAccount — masked health only', () => {
  it('a valid service account is valid, returns masked health, and NEVER includes the private_key', () => {
    const sa = makeFakeServiceAccount();
    const result = validateServiceAccount(sa);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.masked.projectId).toBe('demo');
    expect(result.masked.hasPrivateKey).toBe(true);

    // clientEmail masked to <first-4>***@<domain>.
    expect(result.masked.clientEmail).toBe('fire***@demo.iam.gserviceaccount.com');

    // SENTINEL: neither the private_key body nor the field name/value leaks.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(FAKE_PK_BODY);
    expect(serialized).not.toContain('BEGIN PRIVATE KEY');
    expect(serialized).not.toContain('private_key');
    expect((result.masked as Record<string, unknown>).private_key).toBeUndefined();
    // Full (unmasked) client_email must not appear either.
    expect(serialized).not.toContain('firebase-adminsdk-abcde@');
  });

  it('reports errors for missing type / project_id / private_key without echoing input', () => {
    const missingType = validateServiceAccount(makeFakeServiceAccount({ type: 'user' }));
    expect(missingType.valid).toBe(false);
    expect(missingType.errors.join(' ')).toMatch(/service_account/);

    const missingProject = validateServiceAccount({ type: 'service_account', private_key: 'x' });
    expect(missingProject.valid).toBe(false);
    expect(missingProject.errors.join(' ')).toMatch(/project_id/);

    const missingKey = validateServiceAccount({ type: 'service_account', project_id: 'demo' });
    expect(missingKey.valid).toBe(false);
    expect(missingKey.masked.hasPrivateKey).toBe(false);
    expect(missingKey.errors.join(' ')).toMatch(/private_key/);
  });

  it('rejects non-object input with masked defaults (no crash, no leak)', () => {
    for (const bad of [null, undefined, 'string', 42, []] as unknown[]) {
      const r = validateServiceAccount(bad);
      expect(r.valid).toBe(false);
      expect(r.masked).toEqual({ hasPrivateKey: false });
    }
  });

  it('masks an email with no @ to <first-4>***', () => {
    const r = validateServiceAccount(makeFakeServiceAccount({ client_email: 'weirdvalue' }));
    expect(r.masked.clientEmail).toBe('weir***');
  });
});

// ---------------------------------------------------------------------------
// loadServiceAccount — FileRef -> resolveCredential -> masked health (sentinel)
// ---------------------------------------------------------------------------

describe('loadServiceAccount — FileRef (path) resolves to MASKED health, never leaking the key', () => {
  it('reads a temp service-account file and returns masked health; private_key never in result or logs', async () => {
    // Capture every console channel to prove the key body reaches none of them.
    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    const sa = makeFakeServiceAccount();
    const tmpFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-firebase-')),
      'service-account.json'
    );
    fs.writeFileSync(tmpFile, JSON.stringify(sa), 'utf8');

    try {
      const ref: FileRef = { kind: 'file', source: 'path', ref: tmpFile };
      const result = await loadServiceAccount(ref);

      expect(result.valid).toBe(true);
      expect(result.masked.projectId).toBe('demo');
      expect(result.masked.hasPrivateKey).toBe(true);
      expect(result.masked.clientEmail).toBe('fire***@demo.iam.gserviceaccount.com');

      // SENTINEL: the raw key body never appears in the returned health…
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(FAKE_PK_BODY);
      expect(serialized).not.toContain('BEGIN PRIVATE KEY');
      expect(serialized).not.toContain('private_key');
      // …nor in anything written to any console channel.
      expect(captured.join('\n')).not.toContain(FAKE_PK_BODY);
      expect(captured.join('\n')).not.toContain('BEGIN PRIVATE KEY');
    } finally {
      fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    }
  });

  it('reports a masked error (no leak) when the credential cannot be resolved', async () => {
    const ref: FileRef = { kind: 'file', source: 'path', ref: '/nonexistent/does-not-exist.json' };
    const result = await loadServiceAccount(ref);
    expect(result.valid).toBe(false);
    expect(result.masked.hasPrivateKey).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts a secret() carrying raw JSON and returns masked health', async () => {
    // node env => secret() captures the value. The whole SA JSON is the secret payload.
    const sa = makeFakeServiceAccount();
    const ref = secret('FIREBASE_SERVICE_ACCOUNT_JSON', JSON.stringify(sa));
    const result = await loadServiceAccount(ref);
    expect(result.valid).toBe(true);
    expect(result.masked.hasPrivateKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain(FAKE_PK_BODY);
  });
});

// ---------------------------------------------------------------------------
// loadServiceAccount is SERVER-ONLY: it THROWS in a browser-like environment
// ---------------------------------------------------------------------------

describe('loadServiceAccount — browser guard', () => {
  it('throws when window is defined (must only run on the server)', async () => {
    const saved = (global as { window?: unknown }).window;
    (global as { window?: unknown }).window = {} as unknown;
    try {
      const ref: FileRef = { kind: 'file', source: 'envJson', ref: 'ANYTHING' };
      await expect(loadServiceAccount(ref)).rejects.toThrow(/only be called on the server/);
    } finally {
      if (saved === undefined) delete (global as { window?: unknown }).window;
      else (global as { window?: unknown }).window = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// The PUBLIC-KEY case: raw apiKey PASSES, raw serviceAccount HARD-FAILS.
// (validateMinderConfig's browser-only walker requires `window` to be defined,
// and firebase's clientSafe allowlist is registered at import of ./src/index.)
// ---------------------------------------------------------------------------

describe('config validation — apiKey is PUBLIC (passes), serviceAccount is server-only (hard-fails)', () => {
  const withWindow = (fn: () => void): void => {
    const saved = (global as { window?: unknown }).window;
    (global as { window?: unknown }).window = {} as unknown;
    try {
      fn();
    } finally {
      if (saved === undefined) delete (global as { window?: unknown }).window;
      else (global as { window?: unknown }).window = saved;
    }
  };

  it('a raw apiKey string in client config PASSES (Firebase apiKey is a public identifier)', () => {
    withWindow(() => {
      const result = validateMinderConfig({
        apiUrl: 'https://api.example.com',
        providers: {
          firebase: {
            apiKey: 'AIzaSy-raw-public-web-api-key',
            authDomain: 'demo.firebaseapp.com',
            projectId: 'demo',
            storageBucket: 'demo.appspot.com',
            messagingSenderId: '000000000000',
            appId: '1:0:web:0',
          },
        },
      });
      expect(result.errors.find((e) => e.key === 'providers.firebase.apiKey')).toBeUndefined();
      expect(result.valid).toBe(true);
    });
  });

  it('a raw serviceAccount STRING in client config HARD-FAILS', () => {
    withWindow(() => {
      const result = validateMinderConfig({
        apiUrl: 'https://api.example.com',
        providers: { firebase: { apiKey: 'AIzaSy-public', serviceAccount: '{"type":"service_account"}' } },
      });
      expect(result.valid).toBe(false);
      const err = result.errors.find((e) => e.key === 'providers.firebase.serviceAccount');
      expect(err).toBeDefined();
      expect(err!.level).toBe('error');
    });
  });

  it('a raw serviceAccount OBJECT in client config HARD-FAILS (its private_key is flagged)', () => {
    withWindow(() => {
      const result = validateMinderConfig({
        apiUrl: 'https://api.example.com',
        providers: {
          firebase: { apiKey: 'AIzaSy-public', serviceAccount: makeFakeServiceAccount() },
        },
      });
      expect(result.valid).toBe(false);
      // The nested private_key raw string is flagged.
      expect(
        result.errors.some((e) => e.key.startsWith('providers.firebase.serviceAccount'))
      ).toBe(true);
    });
  });

  it('a serviceAccount supplied as a FileRef CredentialInput PASSES (never descended into)', () => {
    withWindow(() => {
      const ref: FileRef = { kind: 'file', source: 'path', ref: '/etc/secrets/sa.json' };
      const result = validateMinderConfig({
        apiUrl: 'https://api.example.com',
        providers: { firebase: { apiKey: 'AIzaSy-public', serviceAccount: ref } },
      });
      expect(result.errors.find((e) => e.key.startsWith('providers.firebase.serviceAccount'))).toBeUndefined();
      expect(result.valid).toBe(true);
    });
  });
});
