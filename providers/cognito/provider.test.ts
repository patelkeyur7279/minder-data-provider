/**
 * @jest-environment node
 *
 * Contract + server-boundary + security tests for @minder/provider-cognito.
 *
 * Runs in the `node` environment (no DOM): the real client path is driven
 * entirely through the injected `createCognitoFactory` DI seam (no global
 * fetch/DOM assumptions), and the server handler is a plain web-standard
 * `(Request) => Response` function driven via a stubbed global `fetch`.
 *
 * No `aws-amplify` is installed — the real client path is driven entirely
 * through the injected `createCognitoFactory` DI seam, the server handler uses
 * `fetch` (global `fetch` is stubbed here), and the SDK-missing path is
 * asserted by letting the default factory try (and fail) to import it.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  registerCognitoProvider,
  getProviderClient,
  createCognitoSessionHandler,
} from './src/index.js';
import type { CognitoIdTokenClaims } from './src/index.js';
import {
  createMockAuth,
  registerCognitoMocks,
  setCognitoMockSignedIn,
  createFakeIdToken,
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
  setCognitoMockSignedIn(true);
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
// A fake Cognito client (DI seam) that records calls.
// Shapes match exactly the subset the adapter touches (see src/index.ts).
// ---------------------------------------------------------------------------

function makeFakeCognito(
  opts: { hasIdToken?: boolean; claims?: CognitoIdTokenClaims; fetchThrows?: boolean } = {}
) {
  const {
    hasIdToken = true,
    claims = { sub: 'cognito-user-1', exp: FUTURE_EXP },
    fetchThrows = false,
  } = opts;
  let idTokenPresent = hasIdToken;
  let currentClaims: CognitoIdTokenClaims | undefined = claims;
  const calls: { signOutCount: number; signOutArgs: unknown[] } = { signOutCount: 0, signOutArgs: [] };

  const instance = {
    async fetchAuthSession() {
      if (fetchThrows) throw new Error('network down');
      if (!idTokenPresent) return { tokens: undefined };
      return { tokens: { idToken: { payload: currentClaims } } };
    },
    async getCurrentUser() {
      return { userId: currentClaims?.sub ?? '', username: currentClaims?.sub ?? '' };
    },
    async signOut(options?: { global?: boolean }) {
      calls.signOutCount++;
      calls.signOutArgs.push(options);
      idTokenPresent = false;
      currentClaims = undefined;
    },
  };
  const factory = () => instance;
  return { instance, factory, calls };
}

// ---------------------------------------------------------------------------
// CLIENT — real path via injected createCognitoFactory
// ---------------------------------------------------------------------------

describe('registerCognitoProvider — real path via injected createCognitoFactory', () => {
  it('registers an auth capability and exposes the raw client wrapper via getProviderClient()', async () => {
    const fake = makeFakeCognito();
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.providerName).toBe('@minder/provider-cognito');
    expect(p!.isMock).toBeFalsy();
    expect(getProviderClient()).toBe(fake.instance);
  });

  it('getSession maps a present ID token + valid claims -> { userId, raw }', async () => {
    const fake = makeFakeCognito({
      claims: { sub: 'cognito-user-1', exp: FUTURE_EXP, email: 'a@example.com' },
    });
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    const session = await grabAuth().getSession();
    expect(session).toEqual({
      userId: 'cognito-user-1',
      raw: { sub: 'cognito-user-1', exp: FUTURE_EXP, email: 'a@example.com' },
    });
  });

  it('getSession returns null when no ID token is present (signed out / guest identity)', async () => {
    const fake = makeFakeCognito({ hasIdToken: false });
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('getSession returns null (never throws) when fetchAuthSession() rejects', async () => {
    const fake = makeFakeCognito({ fetchThrows: true });
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    await expect(grabAuth().getSession()).resolves.toBeNull();
  });

  it('signOut calls client.signOut() with no options when no signOutOptions configured', async () => {
    const fake = makeFakeCognito();
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    await grabAuth().signOut();
    expect(fake.calls.signOutCount).toBe(1);
    expect(fake.calls.signOutArgs[0]).toBeUndefined();

    // The fake clears its ID token on signOut -> getSession null after.
    expect(await grabAuth().getSession()).toBeNull();
  });

  it('signOut forwards configured signOutOptions.global to client.signOut()', async () => {
    const fake = makeFakeCognito();
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
        signOutOptions: { global: true },
      })
    );

    await grabAuth().signOut();
    expect(fake.calls.signOutArgs[0]).toEqual({ global: true });
  });

  it('unregister() tears down the auth capability and clears the raw client', async () => {
    const fake = makeFakeCognito();
    const unregister = await registerCognitoProvider({
      userPoolId: 'us-east-1_Test',
      userPoolClientId: 'client-1',
      createCognitoFactory: fake.factory,
    });

    expect(getCapabilityProvider('auth')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });

  it('throws a helpful error when userPoolId/userPoolClientId are missing and no factory is supplied', async () => {
    await expect(registerCognitoProvider({})).rejects.toThrow(
      '"userPoolId" and "userPoolClientId" are required for the real Cognito provider'
    );
  });
});

// ---------------------------------------------------------------------------
// CLIENT — fail-closed validation (P2: presence + expiry only)
// ---------------------------------------------------------------------------

describe('getSession — fail-closed validation', () => {
  it.each([
    ['missing sub', { exp: FUTURE_EXP } as CognitoIdTokenClaims],
    ['empty sub', { sub: '', exp: FUTURE_EXP } as CognitoIdTokenClaims],
    ['missing exp', { sub: 'user-1' } as CognitoIdTokenClaims],
    ['non-numeric exp', { sub: 'user-1', exp: 'not-a-number' as unknown as number }],
    ['already-expired exp', { sub: 'user-1', exp: PAST_EXP }],
  ] as const)('rejects claims with %s -> null', async (_label, badClaims) => {
    const fake = makeFakeCognito({ claims: badClaims });
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
  });

  it('rejects a malformed (non-object) token payload -> null', async () => {
    const fake = makeFakeCognito();
    fake.instance.fetchAuthSession = async () => ({
      tokens: { idToken: { payload: 'not-an-object' as unknown as CognitoIdTokenClaims } },
    });
    cleanups.push(
      await registerCognitoProvider({
        userPoolId: 'us-east-1_Test',
        userPoolClientId: 'client-1',
        createCognitoFactory: fake.factory,
      })
    );

    expect(await grabAuth().getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — SDK missing
// ---------------------------------------------------------------------------

describe('registerCognitoProvider — SDK missing', () => {
  it('throws the exact optional-peer install message when aws-amplify is not installed', async () => {
    // No createCognitoFactory -> default factory tries to import the (uninstalled) SDK.
    await expect(
      registerCognitoProvider({ userPoolId: 'us-east-1_Test', userPoolClientId: 'client-1' })
    ).rejects.toThrow('Install aws-amplify (optional peer): npm i aws-amplify');
  });
});

// ---------------------------------------------------------------------------
// SERVER — createCognitoSessionHandler
// ---------------------------------------------------------------------------

describe('createCognitoSessionHandler — happy path', () => {
  it('forwards the Authorization header to /oauth2/userInfo and returns { userId, valid: true } on 200', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'cognito-user-1', email: 'a@example.com' }, 200));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(
      req('http://localhost/api/minder/cognito/verify-session', { authorization: 'Bearer tok_abc' })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: 'cognito-user-1', valid: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://test.auth.us-east-1.amazoncognito.com/oauth2/userInfo');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok_abc');
  });
});

describe('createCognitoSessionHandler — invalid upstream token (never throws)', () => {
  it('maps a 401 upstream response to { userId: null, valid: false } without throwing the body', async () => {
    stubFetch(async () => jsonRes({ error: 'invalid_token' }, 401));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer bad_tok' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });

  it('maps a 400 upstream response (scopeless InitiateAuth-issued access token) to { userId: null, valid: false }', async () => {
    stubFetch(async () => jsonRes({ error: 'invalid_token', error_description: 'Access Token does not have required scopes' }, 400));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer no_scope_tok' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });

  it('maps a 200 response with a malformed/missing sub to { userId: null, valid: false }', async () => {
    stubFetch(async () => jsonRes({ username: 'no-sub-here' }, 200));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer tok' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ userId: null, valid: false });
  });
});

describe('createCognitoSessionHandler — request validation', () => {
  it('returns 405 for a non-GET request (never calls fetch)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'x' }, 200));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer tok' }, 'POST'));

    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'COGNITO_METHOD_NOT_ALLOWED' } });
    expect(res.headers.get('allow')).toBe('GET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 COGNITO_BAD_REQUEST when the Authorization header is missing (never calls fetch)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'x' }, 200));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'COGNITO_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no "Bearer " prefix', 'tok_abc'],
    ['empty token', 'Bearer '],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
  ])('returns 400 COGNITO_BAD_REQUEST for a malformed Authorization header (%s)', async (_label, badHeader) => {
    const fetchMock = stubFetch(async () => jsonRes({ sub: 'x' }, 200));

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify', { authorization: badHeader }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'COGNITO_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createCognitoSessionHandler — masked upstream network failure (sentinel)', () => {
  it('maps a fetch rejection to a masked 502, never leaking transport error internals', async () => {
    stubFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND test.auth.us-east-1.amazoncognito.com');
    });

    const handler = createCognitoSessionHandler({ userPoolDomain: 'test.auth.us-east-1.amazoncognito.com' });
    const res = await handler(req('http://localhost/verify', { authorization: 'Bearer tok' }));

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('COGNITO_UPSTREAM_ERROR');
    expect(json.error.message).not.toContain('ENOTFOUND');
  });
});

// ---------------------------------------------------------------------------
// CLIENT — mock:true parity (zero SDK)
// ---------------------------------------------------------------------------

describe('registerCognitoProvider — mock mode + parity', () => {
  it('mock:true registers an isMock auth provider with zero SDK / zero pool', async () => {
    cleanups.push(await registerCognitoProvider({ mock: true }));

    const p = getCapabilityProvider<AuthContract>('auth');
    expect(p).not.toBeNull();
    expect(p!.isMock).toBe(true);
    expect(p!.providerName).toBe('@minder/provider-cognito');
    // Mock mode holds no raw SDK client.
    expect(getProviderClient()).toBeNull();

    const auth = grabAuth();
    const session = await auth.getSession();
    expect(session?.userId).toBe(MOCK_USER_ID);
    expect((session?.raw as CognitoIdTokenClaims).sub).toBe(MOCK_USER_ID);
  });

  it('the mock AuthContract behaves: getSession returns the mock session, signOut clears it', async () => {
    const auth = createMockAuth();

    const session = await auth.getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(MOCK_USER_ID);

    await auth.signOut();
    expect(await auth.getSession()).toBeNull();

    setCognitoMockSignedIn(true);
    expect(await auth.getSession()).toMatchObject({ userId: MOCK_USER_ID });
  });

  it('registerCognitoMocks registers + tears down the auth capability', () => {
    const unregister = registerCognitoMocks();
    expect(getCapabilityProvider('auth')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('auth')).toBeNull();
  });

  it('the mock session carries a structurally-valid fake JWT (three base64url segments) in raw.idToken', async () => {
    const auth = createMockAuth();
    const session = await auth.getSession();
    const raw = session!.raw as CognitoIdTokenClaims & { idToken: string };

    const segments = raw.idToken.split('.');
    expect(segments).toHaveLength(3);
    for (const seg of segments) {
      expect(seg.length).toBeGreaterThan(0);
      expect(seg).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet only, no padding
    }

    // The payload segment decodes back to Cognito-shaped claims matching `raw`.
    const decodedPayload = JSON.parse(
      Buffer.from(segments[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as CognitoIdTokenClaims;
    expect(decodedPayload.sub).toBe(raw.sub);
    expect(decodedPayload.exp).toBe(raw.exp);
    expect(decodedPayload['cognito:username']).toBe(raw['cognito:username']);
  });

  it('createFakeIdToken produces a fresh structurally-valid JWT for arbitrary claims', () => {
    const jwt = createFakeIdToken({ sub: 'abc-123', exp: FUTURE_EXP });
    const segments = jwt.split('.');
    expect(segments).toHaveLength(3);
    segments.forEach((seg) => expect(seg).toMatch(/^[A-Za-z0-9_-]+$/));
  });
});

// ---------------------------------------------------------------------------
// CONFIG VALIDATION — registerClientSafeProviderKeys effect (browser-like)
// ---------------------------------------------------------------------------

describe('config validation — Cognito clientSafe allowlist (browser-like)', () => {
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

  it('userPoolId/userPoolClientId (public, no secret exists) pass, but a credential-shaped key hard-fails', () => {
    // Importing ./src/index.js registered cognito's clientSafe keys at module load.
    const ok = validateMinderConfig({
      providers: { cognito: { userPoolId: 'us-east-1_Test', userPoolClientId: 'client-1' } },
    });
    expect(ok.errors.find((e) => e.key === 'providers.cognito.userPoolId')).toBeUndefined();
    expect(ok.errors.find((e) => e.key === 'providers.cognito.userPoolClientId')).toBeUndefined();

    const bad = validateMinderConfig({
      providers: { cognito: { appClientSecret: 'raw-secret-string-not-a-real-key' } },
    });
    const err = bad.errors.find((e) => e.key === 'providers.cognito.appClientSecret');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(bad.valid).toBe(false);
  });
});
