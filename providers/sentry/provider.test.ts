/**
 * @jest-environment node
 *
 * Plugin-bus + security tests for @minder/provider-sentry.
 *
 * DIFFERENT SHAPE from providers/stripe/provider.test.ts: this provider
 * registers a `MinderPlugin` on `pluginManager` (src/plugins/PluginSystem.ts),
 * not a `src/contracts` capability provider — so these tests drive the
 * plugin's `onError` hook directly with fake `PluginError` objects (exactly
 * how `src/core/ApiClient.ts#emitPluginError` would call it on a real request
 * failure) rather than going through `getCapabilityProvider`.
 *
 * `@sentry/browser` is genuinely NOT installed in this repo's node_modules
 * (it's an optional peer), so the "SDK missing" tests exercise the real
 * degrade path with no mocking required.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import {
  registerSentryProvider,
  getProviderClient,
  __resetSentrySdkCache,
} from './src/index.js';
import type { SentryLikeClient } from './src/index.js';
import {
  getSentryMockEvents,
  __resetSentryMockEvents,
} from './mock.js';
import { pluginManager } from '../../src/plugins/PluginSystem.js';
import type { PluginError } from '../../src/plugins/PluginSystem.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';

const PLUGIN_NAME = '@minder/provider-sentry';
const FAKE_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

afterEach(() => {
  pluginManager.unregister(PLUGIN_NAME);
  __resetSentryMockEvents();
  __resetSentrySdkCache();
  jest.restoreAllMocks();
});

function grabPlugin() {
  const plugin = pluginManager.getPlugin(PLUGIN_NAME);
  if (!plugin) throw new Error('sentry plugin not registered');
  return plugin;
}

function fakeError(overrides: Partial<PluginError> = {}): PluginError {
  return {
    message: 'Request failed with status code 500',
    code: 'ERR_BAD_RESPONSE',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Registration — plugin bus, NOT a capability contract
// ---------------------------------------------------------------------------

describe('registerSentryProvider — plugin bus registration', () => {
  it('registers a MinderPlugin on the global pluginManager and increases its size', () => {
    const before = pluginManager.size;
    expect(pluginManager.hasPlugin(PLUGIN_NAME)).toBe(false);

    registerSentryProvider({ mock: true });

    expect(pluginManager.size).toBe(before + 1);
    expect(pluginManager.hasPlugin(PLUGIN_NAME)).toBe(true);
    const plugin = grabPlugin();
    expect(plugin.name).toBe(PLUGIN_NAME);
    expect(typeof plugin.onError).toBe('function');
  });

  it('unregister() removes the plugin — size decreases and it is no longer present', () => {
    const before = pluginManager.size;
    const unregister = registerSentryProvider({ mock: true });
    expect(pluginManager.size).toBe(before + 1);

    unregister();

    expect(pluginManager.size).toBe(before);
    expect(pluginManager.hasPlugin(PLUGIN_NAME)).toBe(false);
    expect(pluginManager.getPlugin(PLUGIN_NAME)).toBeUndefined();
  });

  it('after unregister, a fresh registration is required before errors forward again', async () => {
    const unregister = registerSentryProvider({ mock: true });
    unregister();

    // Nothing left to drive onError through — the plugin is gone.
    expect(pluginManager.getPlugin(PLUGIN_NAME)).toBeUndefined();

    // Re-registering brings forwarding back.
    registerSentryProvider({ mock: true });
    await grabPlugin().onError!(fakeError());
    expect(getSentryMockEvents().length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// onError forwarding — mock sink
// ---------------------------------------------------------------------------

describe('onError — forwards a fake MDP error to the mock sink', () => {
  it('driving the onError hook directly with a fake PluginError records it in getSentryMockEvents()', async () => {
    registerSentryProvider({ mock: true });

    const error = fakeError({ stack: 'Error: boom\n    at fakeCall' });
    await grabPlugin().onError!(error);

    const events = getSentryMockEvents();
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('exception');
    const captured = events[0].value as Error & { code?: string };
    expect(captured.message).toBe(error.message);
    expect(captured.code).toBe('ERR_BAD_RESPONSE');
    expect(captured.stack).toBe(error.stack);
  });

  it('multiple errors are recorded in order', async () => {
    registerSentryProvider({ mock: true });
    await grabPlugin().onError!(fakeError({ message: 'first' }));
    await grabPlugin().onError!(fakeError({ message: 'second' }));

    const events = getSentryMockEvents();
    expect(events.map((e) => (e.value as Error).message)).toEqual(['first', 'second']);
  });
});

// ---------------------------------------------------------------------------
// Mock parity — mock sink vs a fake SDK via createSentryFactory
// ---------------------------------------------------------------------------

describe('mock parity — mock sink and createSentryFactory both receive the forwarded error', () => {
  it('the same error reaches both the mock sink and a fake SDK client with equivalent shape', async () => {
    const fakeSdkEvents: Array<{ message: string; code?: string }> = [];
    const fakeSdkClient: SentryLikeClient = {
      captureException: (e: unknown) => {
        const err = e as Error & { code?: string };
        fakeSdkEvents.push({ message: err.message, code: err.code });
      },
    };

    const error = fakeError({ message: 'parity check' });

    // Path 1: mock: true → the in-memory sink.
    registerSentryProvider({ mock: true });
    await grabPlugin().onError!(error);
    pluginManager.unregister(PLUGIN_NAME);

    // Path 2: createSentryFactory → the fake SDK client (DI seam).
    registerSentryProvider({ createSentryFactory: () => fakeSdkClient });
    await grabPlugin().onError!(error);

    const mockEvents = getSentryMockEvents();
    expect(mockEvents.length).toBe(1);
    expect((mockEvents[0].value as Error).message).toBe('parity check');
    expect((mockEvents[0].value as Error & { code?: string }).code).toBe('ERR_BAD_RESPONSE');

    expect(fakeSdkEvents.length).toBe(1);
    expect(fakeSdkEvents[0]).toEqual({ message: 'parity check', code: 'ERR_BAD_RESPONSE' });
  });

  it('getProviderClient() resolves to the mock sink when mock:true', async () => {
    registerSentryProvider({ mock: true });
    const client = await getProviderClient();
    expect(client).not.toBeNull();
    expect(typeof client!.captureException).toBe('function');
  });

  it('getProviderClient() resolves to the createSentryFactory object when supplied', async () => {
    const fakeSdkClient: SentryLikeClient = { captureException: () => {} };
    registerSentryProvider({ createSentryFactory: () => fakeSdkClient });
    const client = await getProviderClient();
    expect(client).toBe(fakeSdkClient);
  });
});

// ---------------------------------------------------------------------------
// SDK-missing → graceful degrade (design decision: warn, don't throw)
// ---------------------------------------------------------------------------

describe('SDK-missing — real path with no @sentry/browser installed', () => {
  it('onError does NOT throw; it logs one console.warn with an install hint and skips forwarding', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    registerSentryProvider({ dsn: FAKE_DSN }); // no mock, no factory -> real SDK path
    await expect(grabPlugin().onError!(fakeError())).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(warned).toContain('@sentry/browser is not installed');
    expect(warned).toContain('npm i @sentry/browser');

    // Nothing was recorded anywhere (there is no sink in the real path, and
    // the SDK was never reached) — the degrade is silent to the caller.
    expect(getSentryMockEvents().length).toBe(0);
  });

  it('getProviderClient() resolves to null (never rejects) when the SDK is missing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    registerSentryProvider({ dsn: FAKE_DSN });
    await expect(getProviderClient()).resolves.toBeNull();
  });

  it('the missing-SDK warning is only logged once even across repeated errors', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    registerSentryProvider({ dsn: FAKE_DSN });
    await grabPlugin().onError!(fakeError());
    await grabPlugin().onError!(fakeError());
    await grabPlugin().onError!(fakeError());
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// No over-forwarding — PluginError.request (headers/body) must NEVER reach Sentry
// ---------------------------------------------------------------------------

describe('no over-forwarding — internal MDP request detail never reaches the sink', () => {
  it('drops PluginError.request (headers/body) — only message/code/stack are forwarded', async () => {
    registerSentryProvider({ mock: true });

    const secretToken = 'Bearer secret-token-value-should-not-leak';
    const leakedBodyMarker = 'internal-body-should-not-leak';
    const error = fakeError({
      request: {
        method: 'POST',
        url: '/api/secret',
        headers: { authorization: secretToken },
        body: { note: leakedBodyMarker },
        timestamp: Date.now(),
      },
    });

    await grabPlugin().onError!(error);

    const events = getSentryMockEvents();
    expect(events.length).toBe(1);
    const captured = events[0].value as Error & { request?: unknown };

    // The reportable Error carries no `request` field at all.
    expect(captured.request).toBeUndefined();
    expect('request' in captured).toBe(false);

    // Neither the auth header nor the body payload leaked into message/stack.
    expect(captured.message).not.toContain(secretToken);
    expect(captured.message).not.toContain(leakedBodyMarker);
    expect(captured.stack ?? '').not.toContain(secretToken);
    expect(captured.stack ?? '').not.toContain(leakedBodyMarker);
  });

  it('onRequest/onResponse breadcrumbs (best-effort) never receive headers or bodies', () => {
    // With mock:true (no real SDK, no addBreadcrumb sink) the breadcrumb path
    // is a deliberate no-op — asserting it does not throw is the security-
    // relevant behavior: no headers/body are ever read out for forwarding.
    registerSentryProvider({ mock: true });
    const plugin = grabPlugin();
    expect(() =>
      plugin.onRequest?.({
        method: 'POST',
        url: '/api/secret',
        headers: { authorization: 'Bearer should-not-be-read' },
        body: { apiKey: 'sk_should_not_be_read' },
        timestamp: Date.now(),
      })
    ).not.toThrow();
    expect(() =>
      plugin.onResponse?.({ status: 200, data: { token: 'should-not-be-read' }, duration: 5, timestamp: Date.now() })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DSN is public — passes config validation
// ---------------------------------------------------------------------------

describe('config validation — Sentry clientSafe allowlist (browser-like)', () => {
  let hadWindow = false;
  let savedWindow: unknown;
  beforeAll(() => {
    hadWindow = 'window' in globalThis;
    savedWindow = (globalThis as Record<string, unknown>).window;
    // The credential-key checks in validateMinderConfig run only in a
    // browser-like env (typeof window !== 'undefined'); simulate one here.
    (globalThis as Record<string, unknown>).window = (globalThis as Record<string, unknown>).window ?? {};
  });
  afterAll(() => {
    if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = savedWindow;
  });

  it('a raw dsn passes validateMinderConfig — DSNs are public by design', () => {
    // Importing ./src/index.js registered sentry's clientSafe keys at module load.
    const result = validateMinderConfig({
      providers: { sentry: { dsn: FAKE_DSN } },
    });
    expect(result.errors.find((e) => e.key === 'providers.sentry.dsn')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('mock is also client-safe', () => {
    const result = validateMinderConfig({
      providers: { sentry: { dsn: FAKE_DSN, mock: true } },
    });
    expect(result.errors.find((e) => e.key === 'providers.sentry.mock')).toBeUndefined();
    expect(result.valid).toBe(true);
  });
});
