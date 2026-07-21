/**
 * @jest-environment node
 *
 * Contract + server-boundary + security tests for @minder/provider-clerk.
 *
 * Runs in the `node` environment (no DOM): the server handler resolves credentials
 * (which is server-only), and the `node` env lets `secret()` capture a value so the
 * secret-leak sentinel can prove the value never escapes.
 *
 * No `@clerk/clerk-js` is installed — the real client path is driven entirely
 * through the injected `createClerkFactory` DI seam, the server handler uses `fetch`
 * (global `fetch` is stubbed here), and the SDK-missing path is asserted by letting
 * the default factory try (and fail) to import it.
 *
 * ALL fake keys are runtime-constructed (never scanner-shaped literals; 4a4f84c).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  registerClerkProvider,
  getProviderClient,
  createClerkSessionHandler,
} from './src/index.js';
import {
  createMockAuth,
  registerClerkMocks,
  setClerkMockSignedIn,
  MOCK_USER_ID,
} from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { AuthContract } from '../../src/contracts/types.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';
import { secret } from '../../src/security/secrets.js';

// Runtime-generated fake keys — never scanner-matching literals.
const FAKE_SECRET_KEY = 'sk_test_' + 'x'.repeat(16);
const FAKE_PUBLISHABLE_KEY = 'pk_test_' + 'x'.repeat(16);

const SECRET_ENV = 'MINDER_TEST_CLERK_SECRET_KEY';

const REAL_FETCH = globalThis.fetch;

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  globalThis.fetch = REAL_FETCH;
  setClerkMockSignedIn(true);
  jest.restoreAllMocks();
});

function stubFetch(fn: (...args: unknown[]) => Promise<Response>): jest.Mock {
  const fetchMock = jest.fn(fn as never);
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock as unknown as jest.Mock;
}

function jsonRes(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function req(url: string, rawBody: string, method = 'POST'): Request {
  return new Request(url, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : rawBody });
}

function secretKeyCredential() {
  process.env[SECRET_ENV] = FAKE_SECRET_KEY;
  return secret(SECRET_ENV);
}

function grabAuth(): AuthContract {
  const p = getCapabilityProvider<AuthContract>('auth');
  if (!p) throw new Error('no auth provider registered');
  return p.implementation;
}

// ---------------------------------------------------------------------------
// A fake Clerk instance (DI seam) that records calls.
// Shapes match exactly the subset the adapter touches (see src/index.ts).
// ---------------------------------------------------------------------------

function makeFakeClerk() {
  const calls = { loadCount: 0, signOutCount: 0 };
  const instance: {
    session: { id: string; user: { id: string }; status: string } | null;
    user: { id: string } | null;
    load(): Promise<void>;
    signOut(): Promise<void>;
  } = {
    session: { id: 'sess_1', user: { id: 'clerk-user-1' }, status: 'active' },
    user: { id: 'clerk-user-1' },
    async load() {
      calls.loadCount++;
    },
    async signOut() {
      calls.signOutCount++;
      instance.session = null;
      instance.user = null;
    },
  };
  const factory = () => instance;
  return { instance, factory, calls };
}

// ---------------------------------------------------------------------------
// CLIENT — real path via injected createClerkFactory
// ---------------------------------------------------------------------------

describe('registerClerkProvider — real path via injected createClerkFactory', () => {
  it('registers an auth capability and exposes the raw Clerk instance via getProviderClient()', async () => {
    const fake = makeFakeClerk();
    cleanups.push(
      await registerClerkProvider({
        publishableKey: FAKE_PUBLISHABLE_KEY,
        createClerkFactory: fake.factory,
      })
    );

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.providerName).toBe('@minder/provider-clerk');
    expect(p!.isMock).toBeFalsy();
    expect(getProviderClient()).toBe(fake.instance);
  });

  it('AuthContract: getSession maps session.user.id -> userId, signOut calls through', async () => {
    const fake = makeFakeClerk();
    cleanups.push(
      await registerClerkProvider({
        publishableKey: FAKE_PUBLISHABLE_KEY,
        createClerkFactory: fake.factory,
      })
    );

    const auth = grabAuth();
    const session = await auth.getSession();
    expect(session).toEqual({ userId: 'clerk-user-1', raw: { id: 'sess_1', user: { id: 'clerk-user-1' }, status: 'active' } });

    await auth.signOut();
    expect(fake.calls.signOutCount).toBe(1);

    // After signOut the fake clears its session -> getSession returns null.
    expect(await auth.getSession()).toBeNull();
  });

  it('unregister() tears down the auth capability and clears the raw client', async () => {
    const fake = makeFakeClerk();
    const unregister = await registerClerkProvider({
      publishableKey: FAKE_PUBLISHABLE_KEY,
      createClerkFactory: fake.factory,
    });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — SDK missing
// ---------------------------------------------------------------------------

describe('registerClerkProvider — SDK missing', () => {
  it('throws the exact optional-peer install message when @clerk/clerk-js is not installed', async () => {
    // No createClerkFactory -> default factory tries to import the (uninstalled) SDK.
    await expect(
      registerClerkProvider({ publishableKey: FAKE_PUBLISHABLE_KEY })
    ).rejects.toThrow('Install @clerk/clerk-js (optional peer): npm i @clerk/clerk-js');
  });
});

// ---------------------------------------------------------------------------
// SERVER — createClerkSessionHandler
// ---------------------------------------------------------------------------

describe('createClerkSessionHandler — happy path', () => {
  it('resolves the secret key, POSTs the token to Clerk with Bearer auth, and returns { userId, valid }', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ valid: true, userId: 'u1' }, 200));

    const handler = createClerkSessionHandler({ secretKey: secretKeyCredential() });
    const res = await handler(
      req('http://localhost/api/minder/clerk/verify-session', JSON.stringify({ sessionToken: 'sess_jwt_abc' }))
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: 'u1', valid: true });

    // Exactly one Clerk call, to the session-verify endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.clerk.com/v1/sessions/verify');

    // Authorization header carried the runtime-generated secret key (concatenated).
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${FAKE_SECRET_KEY}`);
    expect(headers['content-type']).toBe('application/json');

    // The token was forwarded to Clerk.
    expect(JSON.parse(String(init.body))).toEqual({ token: 'sess_jwt_abc' });
  });
});

describe('createClerkSessionHandler — request validation', () => {
  it('returns 405 for a non-POST request (never calls Clerk)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ valid: true, userId: 'u1' }, 200));

    const handler = createClerkSessionHandler({ secretKey: secretKeyCredential() });
    const res = await handler(req('http://localhost/verify', '', 'GET'));

    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'CLERK_METHOD_NOT_ALLOWED' } });
    expect(res.headers.get('allow')).toBe('POST');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 CLERK_BAD_REQUEST when sessionToken is missing (never calls Clerk)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ valid: true, userId: 'u1' }, 200));

    const handler = createClerkSessionHandler({ secretKey: secretKeyCredential() });
    const res = await handler(req('http://localhost/verify', JSON.stringify({ notToken: 'x' })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'CLERK_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createClerkSessionHandler({ secretKey: secretKeyCredential() });
    const res = await handler(req('http://localhost/verify', 'not-json{'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'CLERK_BAD_REQUEST' } });
  });
});

describe('createClerkSessionHandler — masked upstream error (sentinel)', () => {
  it('maps a Clerk API error to a 502 that passes the Clerk message but NEVER the key', async () => {
    const clerkMessage = 'Session token is invalid';
    stubFetch(async () => jsonRes({ errors: [{ message: clerkMessage }] }, 401));

    // Capture every console channel too — the key must appear nowhere.
    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    const handler = createClerkSessionHandler({ secretKey: secretKeyCredential() });
    const res = await handler(req('http://localhost/verify', JSON.stringify({ sessionToken: 'bad_token' })));

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    // Clerk's own message is passed through under the masked upstream code.
    expect(json.error.code).toBe('CLERK_UPSTREAM_ERROR');
    expect(json.error.message).toBe(clerkMessage);

    // SENTINEL: the secret key value never appears in the response body or logs.
    expect(JSON.stringify(json)).not.toContain(FAKE_SECRET_KEY);
    expect(captured.join('\n')).not.toContain(FAKE_SECRET_KEY);
  });

  it('returns 500 CLERK_SECRET_UNRESOLVED (masked) when the credential cannot resolve', async () => {
    delete process.env.MINDER_TEST_MISSING_CLERK_SECRET;
    stubFetch(async () => jsonRes({ valid: true, userId: 'unused' }, 200));

    const handler = createClerkSessionHandler({ secretKey: secret('MINDER_TEST_MISSING_CLERK_SECRET') });
    const res = await handler(req('http://localhost/verify', JSON.stringify({ sessionToken: 'tok' })));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'CLERK_SECRET_UNRESOLVED' } });
  });
});

// ---------------------------------------------------------------------------
// CLIENT — mock:true parity (zero SDK)
// ---------------------------------------------------------------------------

describe('registerClerkProvider — mock mode + parity', () => {
  it('mock:true registers an isMock auth provider with zero SDK / zero keys', async () => {
    cleanups.push(await registerClerkProvider({ publishableKey: '', mock: true }));

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.isMock).toBe(true);
    expect(p!.providerName).toBe('@minder/provider-clerk');
    // Mock mode holds no raw SDK client.
    expect(getProviderClient()).toBeNull();

    // Same AuthContract assertions as the real path.
    const auth = grabAuth();
    const session = await auth.getSession();
    expect(session).toEqual({ userId: MOCK_USER_ID, raw: {} });
  });

  it('the mock AuthContract behaves: getSession returns the mock session, signOut clears it', async () => {
    const auth = createMockAuth();

    const session = await auth.getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(MOCK_USER_ID);
    expect(session!.raw).toEqual({});

    await auth.signOut();
    expect(await auth.getSession()).toBeNull();

    // The demo/test toggle helper drives the same module-level state back on.
    setClerkMockSignedIn(true);
    expect(await auth.getSession()).toMatchObject({ userId: MOCK_USER_ID });
  });

  it('registerClerkMocks registers + tears down the auth capability', () => {
    const unregister = registerClerkMocks();
    expect(getCapabilityProvider('auth')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SECURITY sentinel — a secretKey CredentialInput never leaks
// ---------------------------------------------------------------------------

describe('security — secretKey never appears in any output', () => {
  it('the raw secret value never reaches logs, errors, a serialized config, or the response', async () => {
    const SENTINEL = 'super-secret-clerk-value-DO-NOT-LEAK-9876543210';

    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    // A CredentialInput carrying a real (fake) value — proves the value is held
    // but never emitted. (node env => secret() captures the value.)
    const secretKey = secret('CLERK_SECRET_KEY', SENTINEL);

    // The SecretRef masks itself under stringification/serialization.
    expect(String(secretKey)).toBe('[SECRET:CLERK_SECRET_KEY]');
    expect(JSON.stringify({ secretKey })).not.toContain(SENTINEL);

    // Drive a Clerk-error path so the failure surface is captured too.
    stubFetch(async () => jsonRes({ errors: [{ message: 'invalid token' }] }, 401));

    const handler = createClerkSessionHandler({ secretKey });
    const res = await handler(req('http://localhost/verify', JSON.stringify({ sessionToken: 'tok' })));

    const bodyText = await res.text();
    expect(bodyText).not.toContain(SENTINEL);
    expect(captured.join('\n')).not.toContain(SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// CONFIG VALIDATION — registerClientSafeProviderKeys effect (browser-like)
// ---------------------------------------------------------------------------

describe('config validation — Clerk clientSafe allowlist (browser-like)', () => {
  let hadWindow = false;
  let savedWindow: unknown;
  beforeEach(() => {
    hadWindow = 'window' in globalThis;
    savedWindow = (globalThis as Record<string, unknown>).window;
    // The credential-key checks in validateMinderConfig run only in a browser-like
    // env (typeof window !== 'undefined'); simulate one for these assertions.
    (globalThis as Record<string, unknown>).window = (globalThis as Record<string, unknown>).window ?? {};
  });
  afterEach(() => {
    if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = savedWindow;
  });

  it('publishableKey (public by design) passes, but a raw secretKey string hard-fails', () => {
    // Importing ./src/index.js registered clerk's clientSafe keys at module load.
    const ok = validateMinderConfig({
      providers: { clerk: { publishableKey: FAKE_PUBLISHABLE_KEY } },
    });
    expect(ok.errors.find((e) => e.key === 'providers.clerk.publishableKey')).toBeUndefined();

    const bad = validateMinderConfig({
      providers: { clerk: { secretKey: 'raw-secret-string-not-a-real-key' } },
    });
    const err = bad.errors.find((e) => e.key === 'providers.clerk.secretKey');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(bad.valid).toBe(false);
  });
});
