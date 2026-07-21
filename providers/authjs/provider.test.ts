/**
 * @jest-environment node
 *
 * Contract + server-boundary + security tests for @minder/provider-authjs.
 *
 * Runs in the `node` environment (no DOM): the real client path is driven entirely
 * through the injected `fetchImpl` DI seam (no global fetch/DOM assumptions), and the
 * server handler is a plain web-standard `(Request) => Response` function.
 *
 * No `next-auth` / `@auth/core` is installed or imported anywhere — the client talks
 * to Auth.js's own REST contract via the injected fetch, and the server wraps a
 * caller-supplied `sessionResolver` (mirroring how an app would bridge its own
 * `auth()`). Both paths run every raw payload through the same fail-closed
 * `toSession()` validation exercised below via its externally-observable behavior.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  registerAuthjsProvider,
  getProviderClient,
  createAuthjsSessionHandler,
} from './src/index.js';
import type { AuthjsRawSession } from './src/index.js';
import {
  createMockAuth,
  registerAuthjsMocks,
  setAuthjsMockSignedIn,
  MOCK_USER_ID,
  MOCK_USER_EMAIL,
} from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { AuthContract } from '../../src/contracts/types.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';

const FUTURE_ISO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  setAuthjsMockSignedIn(true);
  jest.restoreAllMocks();
});

function grabAuth(): AuthContract {
  const p = getCapabilityProvider<AuthContract>('auth');
  if (!p) throw new Error('no auth provider registered');
  return p.implementation;
}

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function req(url: string, method = 'GET'): Request {
  return new Request(url, { method });
}

/** A fake fetch (DI seam) routing GET {basePath}/session, /csrf, POST /signout. */
function makeFakeFetch(opts: {
  session?: AuthjsRawSession | Record<string, never>;
  sessionOk?: boolean;
  csrfToken?: string | null;
} = {}) {
  const { session = {}, sessionOk = true, csrfToken = 'csrf-token-abc' } = opts;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/session')) {
      return jsonRes(session, sessionOk ? 200 : 500);
    }
    if (url.endsWith('/csrf')) {
      return csrfToken ? jsonRes({ csrfToken }) : jsonRes({}, 500);
    }
    if (url.endsWith('/signout')) {
      return jsonRes({ url: '/' }, 200);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

// ---------------------------------------------------------------------------
// CLIENT — real path via injected fetchImpl
// ---------------------------------------------------------------------------

describe('registerAuthjsProvider — real path via injected fetchImpl', () => {
  it('registers an auth capability and exposes { basePath, fetchImpl } via getProviderClient()', async () => {
    const { fetchImpl } = makeFakeFetch();
    cleanups.push(await registerAuthjsProvider({ basePath: '/api/auth', fetchImpl }));

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.providerName).toBe('@minder/provider-authjs');
    expect(p!.isMock).toBeFalsy();
    expect(getProviderClient()).toMatchObject({ basePath: '/api/auth' });
  });

  it('getSession maps a valid { user, expires } session -> { userId, raw }', async () => {
    const raw: AuthjsRawSession = {
      user: { id: 'user-1', email: 'a@example.com' },
      expires: FUTURE_ISO,
    };
    const { fetchImpl } = makeFakeFetch({ session: raw });
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    const auth = grabAuth();
    const session = await auth.getSession();
    expect(session).toEqual({ userId: 'user-1', raw });
  });

  it('getSession returns null for a signed-out {} session', async () => {
    const { fetchImpl } = makeFakeFetch({ session: {} });
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('unregister() tears down the auth capability and clears the raw client', async () => {
    const { fetchImpl } = makeFakeFetch();
    const unregister = await registerAuthjsProvider({ fetchImpl });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });

  it('signOut fetches a CSRF token then POSTs it to {basePath}/signout', async () => {
    const { fetchImpl, calls } = makeFakeFetch({ csrfToken: 'tok-xyz' });
    cleanups.push(await registerAuthjsProvider({ basePath: '/api/auth', fetchImpl }));

    await grabAuth().signOut();

    const csrfCall = calls.find((c) => c.url.endsWith('/csrf'));
    const signoutCall = calls.find((c) => c.url.endsWith('/signout'));
    expect(csrfCall).toBeDefined();
    expect(signoutCall).toBeDefined();
    expect(signoutCall!.init?.method).toBe('POST');
    expect(String(signoutCall!.init?.body)).toContain('csrfToken=tok-xyz');
  });

  it('signOut is a no-op (never throws) when no CSRF token can be obtained', async () => {
    const { fetchImpl, calls } = makeFakeFetch({ csrfToken: null });
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    await expect(grabAuth().signOut()).resolves.toBeUndefined();
    expect(calls.some((c) => c.url.endsWith('/signout'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CLIENT — fail-closed validation (P2: presence + expiry only)
// ---------------------------------------------------------------------------

describe('getSession — fail-closed validation', () => {
  it.each([
    ['missing user', { expires: FUTURE_ISO }],
    ['missing user.id', { user: { email: 'a@example.com' }, expires: FUTURE_ISO }],
    ['empty user.id', { user: { id: '' }, expires: FUTURE_ISO }],
    ['missing expires', { user: { id: 'user-1' } }],
    ['unparseable expires', { user: { id: 'user-1' }, expires: 'not-a-date' }],
    ['already-expired session', { user: { id: 'user-1' }, expires: PAST_ISO }],
  ] as const)('rejects a session with %s -> null', async (_label, badSession) => {
    const { fetchImpl } = makeFakeFetch({ session: badSession as AuthjsRawSession });
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('returns null (never throws) on a non-OK session response', async () => {
    const { fetchImpl } = makeFakeFetch({ session: { user: { id: 'x' }, expires: FUTURE_ISO }, sessionOk: false });
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('returns null (never throws) when fetch itself rejects (network failure)', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    await expect(grabAuth().getSession()).resolves.toBeNull();
  });

  it('returns null (never throws) when the session response is not valid JSON', async () => {
    const fetchImpl = (async () => new Response('not-json{', { status: 200 })) as unknown as typeof fetch;
    cleanups.push(await registerAuthjsProvider({ fetchImpl }));

    await expect(grabAuth().getSession()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — no fetch available
// ---------------------------------------------------------------------------

describe('registerAuthjsProvider — no fetch available', () => {
  it('throws a helpful error when no global fetch exists and no fetchImpl is passed', async () => {
    const realFetch = globalThis.fetch;
    // @ts-expect-error — deliberately simulate an environment with no global fetch.
    delete globalThis.fetch;
    try {
      await expect(registerAuthjsProvider({})).rejects.toThrow(
        'no global "fetch" is available in this environment'
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// SERVER — createAuthjsSessionHandler
// ---------------------------------------------------------------------------

describe('createAuthjsSessionHandler — happy path', () => {
  it('resolves a valid session and returns { userId, valid: true }', async () => {
    const handler = createAuthjsSessionHandler({
      sessionResolver: async () => ({ user: { id: 'user-1' }, expires: FUTURE_ISO }),
    });
    const res = await handler(req('http://localhost/api/minder/authjs/verify-session'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: 'user-1', valid: true });
  });

  it('resolves null (signed out) and returns { userId: null, valid: false }', async () => {
    const handler = createAuthjsSessionHandler({ sessionResolver: async () => null });
    const res = await handler(req('http://localhost/verify'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });
});

describe('createAuthjsSessionHandler — fail-closed on malformed/expired sessions', () => {
  it.each([
    ['missing user.id', { user: {}, expires: FUTURE_ISO }],
    ['expired session', { user: { id: 'user-1' }, expires: PAST_ISO }],
    ['unparseable expires', { user: { id: 'user-1' }, expires: 'garbled' }],
  ] as const)('%s -> { userId: null, valid: false }, never trusts it', async (_label, badSession) => {
    const handler = createAuthjsSessionHandler({
      sessionResolver: async () => badSession as AuthjsRawSession,
    });
    const res = await handler(req('http://localhost/verify'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });
});

describe('createAuthjsSessionHandler — request validation', () => {
  it('returns 405 for a non-GET request (never calls sessionResolver)', async () => {
    const sessionResolver = jest.fn(async () => null);
    const handler = createAuthjsSessionHandler({ sessionResolver });
    const res = await handler(req('http://localhost/verify', 'POST'));

    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'AUTHJS_METHOD_NOT_ALLOWED' } });
    expect(res.headers.get('allow')).toBe('GET');
    expect(sessionResolver).not.toHaveBeenCalled();
  });
});

describe('createAuthjsSessionHandler — masked resolver error (sentinel)', () => {
  it('maps a thrown resolver error to a masked 502, logging only the error message', async () => {
    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    const handler = createAuthjsSessionHandler({
      sessionResolver: async () => {
        throw new Error('auth.ts misconfigured: missing AUTH_SECRET');
      },
    });
    const res = await handler(req('http://localhost/verify'));

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('AUTHJS_RESOLVER_ERROR');
    // The generic response message never echoes the resolver's internal error text.
    expect(json.error.message).not.toContain('AUTH_SECRET');
    // The log line carries the resolver's own message (for operator debugging) but
    // this provider holds no secret value at all, so nothing sensitive can leak.
    expect(captured.join('\n')).toContain('auth.ts misconfigured');
  });
});

// ---------------------------------------------------------------------------
// CLIENT — mock:true parity (zero network)
// ---------------------------------------------------------------------------

describe('registerAuthjsProvider — mock mode + parity', () => {
  it('mock:true registers an isMock auth provider with zero network', async () => {
    cleanups.push(await registerAuthjsProvider({ mock: true }));

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.isMock).toBe(true);
    expect(p!.providerName).toBe('@minder/provider-authjs');
    // Mock mode holds no raw client.
    expect(getProviderClient()).toBeNull();

    const auth = grabAuth();
    const session = await auth.getSession();
    expect(session?.userId).toBe(MOCK_USER_ID);
    expect((session?.raw as AuthjsRawSession).user?.email).toBe(MOCK_USER_EMAIL);
  });

  it('the mock AuthContract behaves: getSession returns the mock session, signOut clears it', async () => {
    const auth = createMockAuth();

    const session = await auth.getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(MOCK_USER_ID);

    await auth.signOut();
    expect(await auth.getSession()).toBeNull();

    setAuthjsMockSignedIn(true);
    expect(await auth.getSession()).toMatchObject({ userId: MOCK_USER_ID });
  });

  it('registerAuthjsMocks registers + tears down the auth capability', () => {
    const unregister = registerAuthjsMocks();
    expect(getCapabilityProvider('auth')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CONFIG VALIDATION — registerClientSafeProviderKeys effect (browser-like)
// ---------------------------------------------------------------------------

describe('config validation — Auth.js clientSafe allowlist (browser-like)', () => {
  let hadWindow = false;
  let savedWindow: unknown;
  beforeEach(() => {
    hadWindow = 'window' in globalThis;
    savedWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = (globalThis as Record<string, unknown>).window ?? {};
  });
  afterEach(() => {
    if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = savedWindow;
  });

  it('basePath (a route path, not a secret) passes, but a credential-shaped key hard-fails', () => {
    // Importing ./src/index.js registered authjs's clientSafe keys at module load.
    const ok = validateMinderConfig({
      providers: { authjs: { basePath: '/api/auth' } },
    });
    expect(ok.errors.find((e) => e.key === 'providers.authjs.basePath')).toBeUndefined();

    const bad = validateMinderConfig({
      providers: { authjs: { authSecret: 'raw-secret-string-not-a-real-key' } },
    });
    const err = bad.errors.find((e) => e.key === 'providers.authjs.authSecret');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(bad.valid).toBe(false);
  });
});
