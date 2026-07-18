/**
 * M1-02: config schema validation + serverOnly key enforcement.
 *
 * Default Jest environment for this project is jsdom (see package.json
 * "jest" block), so `window` is defined here by default — matching how
 * `configureMinder` is exercised from client code in the rest of the suite.
 * For the "no window" (server) scenarios we temporarily delete `global.window`
 * and restore it afterwards, mirroring the client/server split already used
 * by `tests/secrets.test.ts` (`@jest-environment node`) and
 * `tests/secrets-client.test.ts` (`@jest-environment jsdom`).
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  validateMinderConfig,
  serverOnlyKeys,
  KNOWN_TOP_LEVEL_KEYS,
} from '../src/config/validateConfig';
import { configureMinder } from '../src/config/index';
import { secret } from '../src/security/secrets';
import { MinderConfigError } from '../src/errors/MinderError';

describe('validateMinderConfig — schema validation', () => {
  it('flags an invalid apiUrl with an exact key and a fix', () => {
    const result = validateMinderConfig({ apiUrl: 'not-a-url' });

    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'apiUrl');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.message).toContain('not-a-url');
    expect(err!.fix).toContain('https://');
  });

  it('accepts a valid apiUrl and apiBaseUrl', () => {
    expect(validateMinderConfig({ apiUrl: 'https://api.example.com' }).valid).toBe(true);
    expect(validateMinderConfig({ apiBaseUrl: 'https://api.example.com' }).valid).toBe(true);
  });

  it('flags a route entry missing url/method', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      routes: {
        broken: { method: 'GET' }, // missing url
        alsoMissing: { url: '/x' }, // missing method
        fine: { method: 'GET', url: '/fine' },
        shorthand: '/shorthand', // string shorthand is exempt
      },
    });

    expect(result.valid).toBe(false);

    const brokenErr = result.errors.find((e) => e.key === 'routes.broken');
    expect(brokenErr).toBeDefined();
    expect(brokenErr!.message).toContain('"url"');
    expect(brokenErr!.fix).toContain('routes.broken');

    const missingMethodErr = result.errors.find((e) => e.key === 'routes.alsoMissing');
    expect(missingMethodErr).toBeDefined();
    expect(missingMethodErr!.message).toContain('"method"');

    expect(result.errors.find((e) => e.key === 'routes.fine')).toBeUndefined();
    expect(result.errors.find((e) => e.key === 'routes.shorthand')).toBeUndefined();
  });

  it('flags negative/non-numeric timeout and retries', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      performance: { timeout: -5, retries: 'three' as any },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.key === 'performance.timeout')).toBeDefined();
    expect(result.errors.find((e) => e.key === 'performance.retries')).toBeDefined();
  });

  it('accepts zero and positive timeout/retries', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      performance: { timeout: 0, retries: 5 },
    });
    expect(result.valid).toBe(true);
  });

  it('warns (does not error) on an unknown top-level key and suggests the nearest known key', () => {
    const result = validateMinderConfig({ apiUrl: 'https://api.example.com', catch: true });

    const warning = result.errors.find((e) => e.key === 'catch');
    expect(warning).toBeDefined();
    expect(warning!.level).toBe('warning');
    expect(warning!.message).toContain('catch');
    expect(warning!.fix).toContain('cache'); // nearest known key by edit distance
    // A warning alone must not make the config invalid.
    expect(result.valid).toBe(true);
  });

  it('KNOWN_TOP_LEVEL_KEYS covers the UnifiedMinderConfig surface used elsewhere in the suite', () => {
    for (const key of ['apiUrl', 'routes', 'auth', 'cache', 'cors', 'corsHelper', 'websocket', 'security', 'debug', 'performance', 'ssr', 'environments']) {
      expect(KNOWN_TOP_LEVEL_KEYS).toContain(key);
    }
  });

  it('aggregates multiple failures into one result so developers can fix everything in one pass', () => {
    const result = validateMinderConfig({
      apiUrl: 'nope',
      routes: { broken: { url: '/x' } },
      performance: { timeout: -1 },
      totallyUnknownKey: 1,
    });

    expect(result.valid).toBe(false);
    const errorKeys = result.errors.map((e) => e.key);
    expect(errorKeys).toEqual(
      expect.arrayContaining(['apiUrl', 'routes.broken', 'performance.timeout', 'totallyUnknownKey'])
    );
    // Every entry carries a fix line.
    for (const e of result.errors) {
      expect(typeof e.fix).toBe('string');
      expect(e.fix.length).toBeGreaterThan(0);
    }
  });

  it('is a no-op (valid: true) for non-object input', () => {
    expect(validateMinderConfig(null).valid).toBe(true);
    expect(validateMinderConfig(undefined).valid).toBe(true);
    expect(validateMinderConfig('nope' as any).valid).toBe(true);
  });
});

describe('validateMinderConfig — serverOnly key enforcement', () => {
  afterEach(() => {
    // Guard against any test below failing to restore window.
    if (typeof (global as any).__savedWindow !== 'undefined') {
      (global as any).window = (global as any).__savedWindow;
      delete (global as any).__savedWindow;
    }
  });

  it('registers the documented placeholder namespace', () => {
    expect(serverOnlyKeys).toContain('providers.*.serverOnly');
  });

  it('window IS defined by default in this suite (jsdom)', () => {
    expect(typeof window).toBe('object');
  });

  it('hard-fails on a raw value under a registered serverOnly key in a browser-like environment', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { serverOnly: 'sk_live_raw_value_leaking' } },
    });

    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'providers.stripe.serverOnly');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.fix).toMatch(/move.*server config|secret\(/i);
  });

  it('passes when the serverOnly key holds a SecretRef instead of a raw value', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { serverOnly: secret('STRIPE_SERVER_ONLY') } },
    });

    expect(result.errors.find((e) => e.key === 'providers.stripe.serverOnly')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('matches the wildcard segment for any provider name', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { sendgrid: { serverOnly: 'raw-again' } },
    });
    expect(result.errors.find((e) => e.key === 'providers.sendgrid.serverOnly')).toBeDefined();
  });

  it('does NOT hard-fail when window is absent (server/node environment)', () => {
    (global as any).__savedWindow = (global as any).window;
    delete (global as any).window;
    expect(typeof window).toBe('undefined');

    try {
      const result = validateMinderConfig({
        apiUrl: 'https://api.example.com',
        providers: { stripe: { serverOnly: 'raw-value-fine-on-server' } },
      });

      expect(result.errors.find((e) => e.key === 'providers.stripe.serverOnly')).toBeUndefined();
      expect(result.valid).toBe(true);
    } finally {
      (global as any).window = (global as any).__savedWindow;
      delete (global as any).__savedWindow;
    }
  });
});

describe('configureMinder — wired validation', () => {
  it('still throws the original message when apiUrl is entirely missing (existing behavior preserved)', () => {
    // @ts-expect-error - intentionally invalid for the runtime check
    expect(() => configureMinder({})).toThrow(/Missing required "apiUrl"/);
  });

  it('throws ONE MinderConfigError listing every schema failure with its fix line', () => {
    expect(() =>
      configureMinder({
        apiUrl: 'not-a-url',
        routes: { broken: { url: '/x' } } as any,
        performance: { timeout: -1 },
      })
    ).toThrow(MinderConfigError);

    try {
      configureMinder({
        apiUrl: 'not-a-url',
        routes: { broken: { url: '/x' } } as any,
        performance: { timeout: -1 },
      });
      throw new Error('should have thrown');
    } catch (error) {
      const e = error as MinderConfigError;
      expect(e.code).toBe('CONFIG_VALIDATION_ERROR');
      expect(e.message).toContain('apiUrl');
      expect(e.message).toContain('routes.broken');
      expect(e.message).toContain('performance.timeout');
      expect(e.message).toContain('Fix:');
    }
  });

  it('does not throw for a purely unknown-key warning (does not regress existing valid configs)', () => {
    expect(() =>
      configureMinder({
        apiUrl: 'https://api.example.com',
        routes: { users: '/users' },
      } as any)
    ).not.toThrow();
  });

  it('hard-fails via configureMinder when a serverOnly key holds a raw value in this (jsdom) environment', () => {
    expect(() =>
      configureMinder({
        apiUrl: 'https://api.example.com',
        providers: { stripe: { serverOnly: 'raw-secret' } },
      } as any)
    ).toThrow(MinderConfigError);
  });

  it('does not throw when the serverOnly key is wrapped with secret()', () => {
    expect(() =>
      configureMinder({
        apiUrl: 'https://api.example.com',
        providers: { stripe: { serverOnly: secret('STRIPE_SERVER_ONLY') } },
      } as any)
    ).not.toThrow();
  });
});
