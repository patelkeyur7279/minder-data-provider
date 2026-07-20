/**
 * @jest-environment node
 *
 * Contract + server-boundary + security tests for @minder/provider-auth0.
 *
 * Runs in the `node` environment (no DOM): the real client path is driven entirely
 * through the injected `createAuth0Factory` DI seam (no global fetch/DOM
 * assumptions), and the server handler is a plain web-standard
 * `(Request) => Response` function driven via a stubbed global `fetch`.
 *
 * No `@auth0/auth0-spa-js` is installed — the real client path is driven entirely
 * through the injected `createAuth0Factory` DI seam, the server handler uses
 * `fetch` (global `fetch` is stubbed here), and the SDK-missing path is asserted
 * by letting the default factory try (and fail) to import it.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  registerAuth0Provider,
  getProviderClient,
  createAuth0SessionHandler,
} from './src/index.js';
import type { Auth0IdTokenClaims } from './src/index.js';
import {
  createMockAuth,
  registerAuth0Mocks,
  setAuth0MockSignedIn,
  MOCK_USER_ID,
} from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { AuthContract } from '../../src/contracts/types.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 60 * 60;
const PAST_EXP = Math.floor(Date.now() / 1000) - 60 * 60;

const REAL_FETCH = globalThis.fetch;

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  globalThis.fetch = REAL_FETCH;
  setAuth0MockSignedIn(true);
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

function req(url: string, headers: Record<string, string> = {}, method = 'GET'): Request {
  return new Request(url, { method, headers });
}

function stubFetch(fn: (...args: unknown[]) => Promise<Response>): jest.Mock {
  const fetchMock = jest.fn(fn as never);
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock as unknown as jest.Mock;
}

// ---------------------------------------------------------------------------
// A fake Auth0Client (DI seam) that records calls.
// Shapes match exactly the subset the adapter touches (see src/index.ts).
// ---------------------------------------------------------------------------

function makeFakeAuth0(
  opts: { authenticated?: boolean; claims?: Auth0IdTokenClaims } = {}
) {
  const { authenticated = true, claims = { sub: 'auth0-user-1', exp: FUTURE_EXP } } = opts;
  let isAuthed = authenticated;
  let currentClaims: Auth0IdTokenClaims | undefined = claims;
  const calls: { logoutCount: number; logoutArgs: unknown[] } = { logoutCount: 0, logoutArgs: [] };

  const instance = {
    async isAuthenticated() {
      return isAuthed;
    },
    async getIdTokenClaims() {
      return currentClaims;
    },
    async logout(options?: { logoutParams?: Record<string, unknown> }) {
      calls.logoutCount++;
      calls.logoutArgs.push(options);
      isAuthed = false;
      currentClaims = undefined;
    },
  };
  const factory = () => instance;
  return { instance, factory, calls };
}

// ---------------------------------------------------------------------------
// CLIENT — real path via injected createAuth0Factory
// ---------------------------------------------------------------------------

describe('registerAuth0Provider — real path via injected createAuth0Factory', () => {
  it('registers an auth capability and exposes the raw Auth0Client instance via getProviderClient()', async () => {
    const fake = makeFakeAuth0();
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.providerName).toBe('@minder/provider-auth0');
    expect(p!.isMock).toBeFalsy();
    expect(getProviderClient()).toBe(fake.instance);
  });

  it('getSession maps isAuthenticated()=true + valid claims -> { userId, raw }', async () => {
    const fake = makeFakeAuth0({ claims: { sub: 'auth0-user-1', exp: FUTURE_EXP, email: 'a@example.com' } });
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    const session = await grabAuth().getSession();
    expect(session).toEqual({ userId: 'auth0-user-1', raw: { sub: 'auth0-user-1', exp: FUTURE_EXP, email: 'a@example.com' } });
  });

  it('getSession returns null when isAuthenticated() is false (never calls getIdTokenClaims)', async () => {
    const fake = makeFakeAuth0({ authenticated: false });
    const claimsSpy = jest.spyOn(fake.instance, 'getIdTokenClaims');
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
    expect(claimsSpy).not.toHaveBeenCalled();
  });

  it('signOut calls client.logout() with no options when no logoutParams configured', async () => {
    const fake = makeFakeAuth0();
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    await grabAuth().signOut();
    expect(fake.calls.logoutCount).toBe(1);
    expect(fake.calls.logoutArgs[0]).toBeUndefined();

    // The fake clears its authenticated state on logout -> getSession null after.
    expect(await grabAuth().getSession()).toBeNull();
  });

  it('signOut forwards configured logoutParams to client.logout()', async () => {
    const fake = makeFakeAuth0();
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
        logoutParams: { returnTo: 'https://app.example.com' },
      })
    );

    await grabAuth().signOut();
    expect(fake.calls.logoutArgs[0]).toEqual({ logoutParams: { returnTo: 'https://app.example.com' } });
  });

  it('unregister() tears down the auth capability and clears the raw client', async () => {
    const fake = makeFakeAuth0();
    const unregister = await registerAuth0Provider({
      domain: 'test.us.auth0.com',
      clientId: 'client-1',
      createAuth0Factory: fake.factory,
    });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });

  it('throws a helpful error when domain/clientId are missing and no factory is supplied', async () => {
    await expect(registerAuth0Provider({})).rejects.toThrow(
      '"domain" and "clientId" are required for the real Auth0 provider'
    );
  });
});

// ---------------------------------------------------------------------------
// CLIENT — fail-closed validation (P2: presence + expiry only)
// ---------------------------------------------------------------------------

describe('getSession — fail-closed validation', () => {
  it.each([
    ['missing sub', { exp: FUTURE_EXP } as Auth0IdTokenClaims],
    ['empty sub', { sub: '', exp: FUTURE_EXP } as Auth0IdTokenClaims],
    ['missing exp', { sub: 'user-1' } as Auth0IdTokenClaims],
    ['non-numeric exp', { sub: 'user-1', exp: 'not-a-number' as unknown as number }],
    ['already-expired exp', { sub: 'user-1', exp: PAST_EXP }],
  ] as const)('rejects claims with %s -> null', async (_label, badClaims) => {
    const fake = makeFakeAuth0({ claims: badClaims });
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('rejects a malformed (non-object) claims payload -> null', async () => {
    const fake = makeFakeAuth0();
    // @ts-expect-error — deliberately return a malformed (non-object) claims value.
    fake.instance.getIdTokenClaims = async () => 'not-an-object';
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('rejects an undefined claims payload (signed out mid-check) -> null', async () => {
    const fake = makeFakeAuth0();
    fake.instance.getIdTokenClaims = async () => undefined;
    cleanups.push(
      await registerAuth0Provider({
        domain: 'test.us.auth0.com',
        clientId: 'client-1',
        createAuth0Factory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — SDK missing
// ---------------------------------------------------------------------------

describe('registerAuth0Provider — SDK missing', () => {
  it('throws the exact optional-peer install message when @auth0/auth0-spa-js is not installed', async () => {
    // No createAuth0Factory -> default factory tries to import the (uninstalled) SDK.
    await expect(
      registerAuth0Provider({ domain: 'test.us.auth0.com', clientId: 'client-1' })
    ).rejects.toThrow('Install @auth0/auth0-spa-js (optional peer): npm i @auth0/auth0-spa-js');
  });
});

// ---------------------------------------------------------------------------
// SERVER — createAuth0SessionHandler
// ---------------------------------------------------------------------------

describe('createAuth0SessionHandler — happy path', () => {
  it('forwards the Authorization header to /userinfo and returns { userId, valid: true } on 200', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'auth0|user-1', email: 'a@example.com' }, 200));

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(
      req('http://localhost/api/minder/auth0/verify-session', { authorization: 'Bearer tok_abc' })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: 'auth0|user-1', valid: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://test.us.auth0.com/userinfo');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok_abc');
  });
});

describe('createAuth0SessionHandler — invalid upstream token (never throws)', () => {
  it('maps a 401 upstream response to { userId: null, valid: false } without throwing the body', async () => {
    stubFetch(async () => jsonRes({ error: 'invalid_token', error_description: 'token is expired' }, 401));

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer bad_tok' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });

  it('maps a 200 response with a malformed/missing sub to { userId: null, valid: false }', async () => {
    stubFetch(async () => jsonRes({ nickname: 'no-sub-here' }, 200));

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer tok' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });
});

describe('createAuth0SessionHandler — request validation', () => {
  it('returns 405 for a non-GET request (never calls fetch)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'x' }, 200));

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer tok' }, 'POST'));

    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'AUTH0_METHOD_NOT_ALLOWED' } });
    expect(res.headers.get('allow')).toBe('GET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 AUTH0_BAD_REQUEST when the Authorization header is missing (never calls fetch)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'x' }, 200));

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(req('http://localhost/verify'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'AUTH0_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no "Bearer " prefix', 'tok_abc'],
    ['empty token', 'Bearer '],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
  ])('returns 400 AUTH0_BAD_REQUEST for a malformed Authorization header (%s)', async (_label, badHeader) => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'x' }, 200));

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(req('http://localhost/verify', { authorization: badHeader }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'AUTH0_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createAuth0SessionHandler — masked upstream network failure (sentinel)', () => {
  it('maps a fetch rejection to a masked 502, never leaking transport error internals', async () => {
    stubFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND test.us.auth0.com');
    });

    const handler = createAuth0SessionHandler({ domain: 'test.us.auth0.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer tok' }));

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('AUTH0_UPSTREAM_ERROR');
    expect(json.error.message).not.toContain('ENOTFOUND');
  });
});

// ---------------------------------------------------------------------------
// CLIENT — mock:true parity (zero SDK)
// ---------------------------------------------------------------------------

describe('registerAuth0Provider — mock mode + parity', () => {
  it('mock:true registers an isMock auth provider with zero SDK / zero keys', async () => {
    cleanups.push(await registerAuth0Provider({ mock: true }));

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.isMock).toBe(true);
    expect(p!.providerName).toBe('@minder/provider-auth0');
    // Mock mode holds no raw SDK client.
    expect(getProviderClient()).toBeNull();

    const auth = grabAuth();
    const session = await auth.getSession();
    expect(session?.userId).toBe(MOCK_USER_ID);
    expect((session?.raw as Auth0IdTokenClaims).sub).toBe(MOCK_USER_ID);
  });

  it('the mock AuthContract behaves: getSession returns the mock session, signOut clears it', async () => {
    const auth = createMockAuth();

    const session = await auth.getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(MOCK_USER_ID);

    await auth.signOut();
    expect(await auth.getSession()).toBeNull();

    setAuth0MockSignedIn(true);
    expect(await auth.getSession()).toMatchObject({ userId: MOCK_USER_ID });
  });

  it('registerAuth0Mocks registers + tears down the auth capability', () => {
    const unregister = registerAuth0Mocks();
    expect(getCapabilityProvider('auth')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CONFIG VALIDATION — registerClientSafeProviderKeys effect (browser-like)
// ---------------------------------------------------------------------------

describe('config validation — Auth0 clientSafe allowlist (browser-like)', () => {
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

  it('domain/clientId (public, no secret exists) pass, but a credential-shaped key hard-fails', () => {
    // Importing ./src/index.js registered auth0's clientSafe keys at module load.
    const ok = validateMinderConfig({
      providers: { auth0: { domain: 'test.us.auth0.com', clientId: 'client-1' } },
    });
    expect(ok.errors.find((e) => e.key === 'providers.auth0.domain')).toBeUndefined();
    expect(ok.errors.find((e) => e.key === 'providers.auth0.clientId')).toBeUndefined();

    const bad = validateMinderConfig({
      providers: { auth0: { clientSecret: 'raw-secret-string-not-a-real-key' } },
    });
    const err = bad.errors.find((e) => e.key === 'providers.auth0.clientSecret');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(bad.valid).toBe(false);
  });
});
