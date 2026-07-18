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
  registerClientSafeProviderKeys,
  __resetClientSafeProviderKeys,
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

describe('registerClientSafeProviderKeys — certified-provider clientSafe allowlist (browser-only)', () => {
  // Default jest env here is jsdom, so `window` is defined and the browser-only
  // suspicious-key walker runs. The registry is module-level state — reset it
  // after each test so registrations don't bleed across tests.
  afterEach(() => {
    __resetClientSafeProviderKeys();
  });

  it('a raw serviceRoleKey under providers.supabase hard-fails ONLY once supabase registers its clientSafe keys', () => {
    // serviceRoleKey does not match SUSPICIOUS_KEY by name, so before the provider
    // declares its client-safe surface there is nothing marking it as a secret.
    const before = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { supabase: { serviceRoleKey: 'raw-service-role-string' } },
    });
    expect(before.errors.find((e) => e.key === 'providers.supabase.serviceRoleKey')).toBeUndefined();

    // Registering the client-safe allowlist marks supabase "certified": any other
    // credential-shaped key (e.g. serviceRoleKey) must be a secret() or hard-fails.
    registerClientSafeProviderKeys('supabase', ['url', 'anonKey']);

    const after = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { supabase: { serviceRoleKey: 'raw-service-role-string' } },
    });
    expect(after.valid).toBe(false);
    const err = after.errors.find((e) => e.key === 'providers.supabase.serviceRoleKey');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.message).toContain('providers.supabase.serviceRoleKey');
    expect(err!.fix).toMatch(/secret\(/);
  });

  it('anonKey (public by design) passes ONLY after it is registered clientSafe', () => {
    // Registered clientSafe WITHOUT anonKey: the credential-shaped `…Key` name is
    // flagged for the now-certified provider.
    registerClientSafeProviderKeys('supabase', ['url']);
    const cfg = {
      apiUrl: 'https://api.example.com',
      providers: { supabase: { anonKey: 'public-anon-key' } },
    };
    expect(validateMinderConfig(cfg).errors.find((e) => e.key === 'providers.supabase.anonKey')).toBeDefined();

    // Add anonKey to the allowlist -> exempt -> passes.
    registerClientSafeProviderKeys('supabase', ['anonKey']);
    expect(validateMinderConfig(cfg).errors.find((e) => e.key === 'providers.supabase.anonKey')).toBeUndefined();
    expect(validateMinderConfig(cfg).valid).toBe(true);
  });

  it('serviceRoleKey wrapped in secret() passes even for a certified provider', () => {
    registerClientSafeProviderKeys('supabase', ['url', 'anonKey']);
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { supabase: { serviceRoleKey: secret('SUPABASE_SERVICE_ROLE_KEY') } },
    });
    expect(result.errors.find((e) => e.key === 'providers.supabase.serviceRoleKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('client-safe keys (url, anonKey) hold raw strings without error once registered', () => {
    registerClientSafeProviderKeys('supabase', ['url', 'anonKey']);
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { supabase: { url: 'https://proj.supabase.co', anonKey: 'public-anon-key' } },
    });
    expect(result.valid).toBe(true);
  });

  it('other providers are unaffected: an unregistered provider keeps SUSPICIOUS_KEY-only behavior', () => {
    registerClientSafeProviderKeys('supabase', ['url', 'anonKey']);
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { publishableKey: 'pk_live_public', secretKey: 'raw-secret' } },
    });
    // publishableKey is credential-shaped but stripe is not certified -> not flagged.
    expect(result.errors.find((e) => e.key === 'providers.stripe.publishableKey')).toBeUndefined();
    // secretKey matches SUSPICIOUS_KEY regardless of certification -> still flagged.
    expect(result.errors.find((e) => e.key === 'providers.stripe.secretKey')).toBeDefined();
  });

  it('registration is additive / idempotent', () => {
    registerClientSafeProviderKeys('supabase', ['url']);
    registerClientSafeProviderKeys('supabase', ['anonKey']);
    registerClientSafeProviderKeys('supabase', ['url']); // duplicate is a no-op
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { supabase: { url: 'u', anonKey: 'a' } },
    });
    expect(result.valid).toBe(true);
  });
});

describe('registerClientSafeProviderKeys — Stripe certified provider', () => {
  // Default jest env here is jsdom, so `window` is defined and the browser-only
  // suspicious-key walker runs. Reset the module-level registry after each test.
  afterEach(() => {
    __resetClientSafeProviderKeys();
  });

  it('a raw secretKey under providers.stripe hard-fails once stripe registers its clientSafe keys', () => {
    // Register stripe's client-safe allowlist (as providers/stripe/src/index.ts does
    // at module scope): publishableKey + checkoutPath are exempt, marking stripe
    // "certified" so any other credential-shaped key must be a secret().
    registerClientSafeProviderKeys('stripe', ['publishableKey', 'checkoutPath']);

    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { secretKey: 'sk_raw_value_leaking_into_the_bundle' } },
    });

    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'providers.stripe.secretKey');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.fix).toMatch(/secret\(/);
  });

  it('a raw publishableKey (public by design) passes because it is registered client-safe', () => {
    registerClientSafeProviderKeys('stripe', ['publishableKey', 'checkoutPath']);

    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { publishableKey: 'pk_test_public_key', checkoutPath: '/api/minder/stripe/checkout' } },
    });

    expect(result.errors.find((e) => e.key === 'providers.stripe.publishableKey')).toBeUndefined();
    expect(result.errors.find((e) => e.key === 'providers.stripe.checkoutPath')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('secretKey wrapped in secret() passes even for the certified stripe provider', () => {
    registerClientSafeProviderKeys('stripe', ['publishableKey', 'checkoutPath']);
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { secretKey: secret('STRIPE_SECRET_KEY') } },
    });
    expect(result.errors.find((e) => e.key === 'providers.stripe.secretKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });
});

describe('registerClientSafeProviderKeys — Clerk certified provider', () => {
  // Default jest env here is jsdom, so `window` is defined and the browser-only
  // suspicious-key walker runs. Reset the module-level registry after each test.
  afterEach(() => {
    __resetClientSafeProviderKeys();
  });

  it('a raw secretKey under providers.clerk hard-fails once clerk registers its clientSafe keys', () => {
    // Register clerk's client-safe allowlist (as providers/clerk/src/index.ts does
    // at module scope): publishableKey + mock are exempt, marking clerk "certified"
    // so any other credential-shaped key must be a secret().
    registerClientSafeProviderKeys('clerk', ['publishableKey', 'mock']);

    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { clerk: { secretKey: 'sk_raw_value_leaking_into_the_bundle' } },
    });

    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'providers.clerk.secretKey');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.fix).toMatch(/secret\(/);
  });

  it('a raw publishableKey (public by design) passes because it is registered client-safe', () => {
    registerClientSafeProviderKeys('clerk', ['publishableKey', 'mock']);

    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { clerk: { publishableKey: 'pk_test_public_key' } },
    });

    expect(result.errors.find((e) => e.key === 'providers.clerk.publishableKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('secretKey wrapped in secret() passes even for the certified clerk provider', () => {
    registerClientSafeProviderKeys('clerk', ['publishableKey', 'mock']);
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { clerk: { secretKey: secret('CLERK_SECRET_KEY') } },
    });
    expect(result.errors.find((e) => e.key === 'providers.clerk.secretKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });
});

describe('registerClientSafeProviderKeys — Firebase certified provider (public apiKey, server-only serviceAccount)', () => {
  // Default jest env here is jsdom, so `window` is defined and the browser-only
  // suspicious-key walker runs. Reset the module-level registry after each test.
  afterEach(() => {
    __resetClientSafeProviderKeys();
  });

  // The whole Firebase web config is clientSafe. Crucially `apiKey` is PUBLIC —
  // Firebase's apiKey is a project IDENTIFIER, not a secret — so a raw apiKey
  // string must PASS even for the certified provider.
  const registerFirebase = (): void =>
    registerClientSafeProviderKeys('firebase', [
      'apiKey',
      'authDomain',
      'projectId',
      'storageBucket',
      'messagingSenderId',
      'appId',
      'mock',
    ]);

  it('a raw apiKey (public by design) PASSES because it is registered client-safe', () => {
    registerFirebase();
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { firebase: { apiKey: 'AIzaSy-raw-public-web-api-key', projectId: 'demo' } },
    });
    expect(result.errors.find((e) => e.key === 'providers.firebase.apiKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('a raw serviceAccount string under providers.firebase hard-fails once firebase registers its clientSafe keys', () => {
    registerFirebase();
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { firebase: { serviceAccount: '{"type":"service_account"}' } },
    });
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'providers.firebase.serviceAccount');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.fix).toMatch(/secret\(|server/i);
  });

  it('serviceAccount wrapped in secret() passes even for the certified firebase provider', () => {
    registerFirebase();
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { firebase: { serviceAccount: secret('FIREBASE_SERVICE_ACCOUNT') } },
    });
    expect(result.errors.find((e) => e.key === 'providers.firebase.serviceAccount')).toBeUndefined();
    expect(result.valid).toBe(true);
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
