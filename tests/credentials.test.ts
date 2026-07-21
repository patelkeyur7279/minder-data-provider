/**
 * F-01: typed credential model (src/security/credentials.ts).
 *
 * Default Jest environment for this project is jsdom (see package.json
 * "jest" block), so `window` is defined here by default — used to exercise
 * the browser-throw path for `resolveCredential`. For server-only
 * scenarios we temporarily delete `global.window` and restore it
 * afterwards, mirroring `tests/config-validation.test.ts`.
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isCredentialInput,
  resolveCredential,
  describeCredential,
  type CredentialInput,
} from '../src/security/credentials';
import { secret } from '../src/security/secrets';
import { validateMinderConfig } from '../src/config/validateConfig';

// Fake credential payload constructed at RUNTIME — never a scanner-matching
// literal (lesson from commit 4a4f84c).
function fakeServiceAccountJson(): string {
  return JSON.stringify({
    type: 'service_account',
    private_key: 'fake_' + 'x'.repeat(8),
  });
}

// NOTE: must be `async` and `await fn()` inside the `try` — a synchronous
// `try { return fn(); } finally { restore(); }` wrapper would run `finally`
// as soon as an async `fn` returns its (still-pending) promise, restoring
// `window` before any code after `fn`'s first `await` actually executes.
async function withoutWindow<T>(fn: () => Promise<T> | T): Promise<T> {
  const saved = (global as any).window;
  delete (global as any).window;
  try {
    return await fn();
  } finally {
    (global as any).window = saved;
  }
}

describe('isCredentialInput', () => {
  it('accepts a SecretRef', () => {
    expect(isCredentialInput(secret('SOME_ENV'))).toBe(true);
  });

  it('accepts a well-formed serverConfig ref', () => {
    expect(isCredentialInput({ kind: 'serverConfig', key: 'apiKey' })).toBe(true);
  });

  it('accepts well-formed file refs (path and envJson)', () => {
    expect(isCredentialInput({ kind: 'file', source: 'path', ref: '/tmp/x.json' })).toBe(true);
    expect(isCredentialInput({ kind: 'file', source: 'envJson', ref: 'SOME_JSON_ENV' })).toBe(true);
  });

  it('rejects raw strings, malformed objects, and unrelated values', () => {
    expect(isCredentialInput('raw-secret-string')).toBe(false);
    expect(isCredentialInput(null)).toBe(false);
    expect(isCredentialInput(undefined)).toBe(false);
    expect(isCredentialInput(42)).toBe(false);
    expect(isCredentialInput({})).toBe(false);
    expect(isCredentialInput({ kind: 'serverConfig' })).toBe(false); // missing key
    expect(isCredentialInput({ kind: 'file', source: 'ftp', ref: 'x' })).toBe(false); // bad source
    expect(isCredentialInput({ kind: 'file', source: 'path' })).toBe(false); // missing ref
    expect(isCredentialInput({ kind: 'bogus' })).toBe(false);
  });
});

describe('resolveCredential — browser throw', () => {
  it('throws (rejects) when window is defined (default jsdom env)', async () => {
    expect(typeof window).toBe('object');
    await expect(resolveCredential(secret('WHATEVER'))).rejects.toThrow(
      /resolveCredential\(\) must only be called on the server/
    );
  });

  it('throws before touching serverConfig/file branches too', async () => {
    await expect(
      resolveCredential({ kind: 'serverConfig', key: 'apiKey' }, { apiKey: 'value' })
    ).rejects.toThrow(/must only be called on the server/);
    await expect(
      resolveCredential({ kind: 'file', source: 'envJson', ref: 'SOME_JSON_ENV' })
    ).rejects.toThrow(/must only be called on the server/);
  });
});

describe('resolveCredential — server-side resolution (node path)', () => {
  const envKeysToClean: string[] = [];

  afterEach(() => {
    for (const k of envKeysToClean.splice(0)) delete process.env[k];
  });

  it('resolves an EnvSecret (SecretRef) via the environment', async () => {
    process.env.MINDER_CRED_TEST_ENV = 'resolved-env-value';
    envKeysToClean.push('MINDER_CRED_TEST_ENV');

    await withoutWindow(async () => {
      const result = await resolveCredential(secret('MINDER_CRED_TEST_ENV'));
      expect(result).toBe('resolved-env-value');
    });
  });

  it('rejects naming the secret when the env var is not set', async () => {
    await withoutWindow(async () => {
      await expect(resolveCredential(secret('MINDER_CRED_TOTALLY_UNSET'))).rejects.toThrow(
        /"MINDER_CRED_TOTALLY_UNSET"/
      );
    });
  });

  it('resolves a serverConfig value from the supplied serverConfig object', async () => {
    await withoutWindow(async () => {
      const result = await resolveCredential(
        { kind: 'serverConfig', key: 'apiKey' },
        { apiKey: 'from-server-config' }
      );
      expect(result).toBe('from-server-config');
    });
  });

  it('rejects naming the exact key when the serverConfig key is missing', async () => {
    await withoutWindow(async () => {
      await expect(
        resolveCredential({ kind: 'serverConfig', key: 'missingKey' }, {})
      ).rejects.toThrow(/"missingKey"/);
      await expect(
        resolveCredential({ kind: 'serverConfig', key: 'missingKey' }, undefined)
      ).rejects.toThrow(/"missingKey"/);
    });
  });

  it('resolves an envJson FileRef from plain JSON', async () => {
    process.env.MINDER_CRED_TEST_JSON = fakeServiceAccountJson();
    envKeysToClean.push('MINDER_CRED_TEST_JSON');

    await withoutWindow(async () => {
      const result = await resolveCredential({
        kind: 'file',
        source: 'envJson',
        ref: 'MINDER_CRED_TEST_JSON',
      });
      expect(result).toEqual({ type: 'service_account', private_key: 'fake_xxxxxxxx' });
    });
  });

  it('resolves an envJson FileRef from base64-encoded JSON', async () => {
    const payload = fakeServiceAccountJson();
    process.env.MINDER_CRED_TEST_JSON_B64 = Buffer.from(payload, 'utf8').toString('base64');
    envKeysToClean.push('MINDER_CRED_TEST_JSON_B64');

    await withoutWindow(async () => {
      const result = await resolveCredential({
        kind: 'file',
        source: 'envJson',
        ref: 'MINDER_CRED_TEST_JSON_B64',
      });
      expect(result).toEqual(JSON.parse(payload));
    });
  });

  it('rejects naming the env var when the envJson var is unset', async () => {
    await withoutWindow(async () => {
      await expect(
        resolveCredential({ kind: 'file', source: 'envJson', ref: 'MINDER_CRED_JSON_UNSET' })
      ).rejects.toThrow(/"MINDER_CRED_JSON_UNSET"/);
    });
  });

  it('resolves a path FileRef by reading + parsing a real file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-cred-test-'));
    const filePath = path.join(dir, 'service-account.json');
    fs.writeFileSync(filePath, fakeServiceAccountJson(), 'utf8');

    try {
      await withoutWindow(async () => {
        const result = await resolveCredential({ kind: 'file', source: 'path', ref: filePath });
        expect(result).toEqual({ type: 'service_account', private_key: 'fake_xxxxxxxx' });
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects naming the path when the file cannot be read', async () => {
    await withoutWindow(async () => {
      await expect(
        resolveCredential({ kind: 'file', source: 'path', ref: '/no/such/path/minder-cred.json' })
      ).rejects.toThrow(/"\/no\/such\/path\/minder-cred\.json"/);
    });
  });

  describe('no-leak invariant — thrown errors never include content', () => {
    const SENTINEL = 'SENTINEL_PAYLOAD_' + Math.random().toString(36).slice(2);

    it('malformed envJson error excludes the sentinel payload', async () => {
      process.env.MINDER_CRED_BAD_JSON = `not json at all :: ${SENTINEL}`;
      envKeysToClean.push('MINDER_CRED_BAD_JSON');

      await withoutWindow(async () => {
        let message = '';
        try {
          await resolveCredential({ kind: 'file', source: 'envJson', ref: 'MINDER_CRED_BAD_JSON' });
        } catch (err) {
          message = (err as Error).message;
        }
        expect(message).not.toContain(SENTINEL);
        expect(message).toContain('MINDER_CRED_BAD_JSON');
      });
    });

    it('malformed path-file JSON error excludes the sentinel payload', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-cred-test-'));
      const filePath = path.join(dir, 'bad.json');
      fs.writeFileSync(filePath, `not json :: ${SENTINEL}`, 'utf8');

      try {
        await withoutWindow(async () => {
          let message = '';
          try {
            await resolveCredential({ kind: 'file', source: 'path', ref: filePath });
          } catch (err) {
            message = (err as Error).message;
          }
          expect(message).not.toContain(SENTINEL);
          expect(message).toContain(filePath);
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('SecretRef resolution failure never echoes any candidate value', async () => {
      await withoutWindow(async () => {
        let message = '';
        try {
          await resolveCredential(secret('MINDER_CRED_TOTALLY_UNSET_2'));
        } catch (err) {
          message = (err as Error).message;
        }
        expect(message).toContain('MINDER_CRED_TOTALLY_UNSET_2');
        expect(message).not.toContain(SENTINEL);
      });
    });
  });
});

describe('describeCredential — masked, never resolves', () => {
  it('masks an env-backed (SecretRef) label to at most 4 chars + "***"', () => {
    const d = describeCredential(secret('STRIPE_SECRET_KEY'));
    expect(d.kind).toBe('env');
    expect(d.label).toBe('STRI***');
    expect(d.label).not.toContain('STRIPE_SECRET_KEY');
    expect(d.label.length).toBeLessThan('STRIPE_SECRET_KEY'.length);
  });

  it('masks a serverConfig label and never reports present without a serverConfig object', () => {
    const d = describeCredential({ kind: 'serverConfig', key: 'someLongApiKeyName' });
    expect(d.kind).toBe('serverConfig');
    expect(d.label).toBe('some***');
    expect(d.label).not.toContain('someLongApiKeyName');
    expect(d.present).toBe(false);
  });

  it('masks a file label', () => {
    const d = describeCredential({ kind: 'file', source: 'path', ref: '/secrets/service-account.json' });
    expect(d.kind).toBe('file');
    expect(d.label).toBe('/sec***');
    expect(d.label).not.toContain('/secrets/service-account.json');
  });

  it('never reveals values (only kind/label/present shape)', () => {
    process.env.MINDER_CRED_DESCRIBE_ENV = 'super-secret-actual-value';
    const d = describeCredential(secret('MINDER_CRED_DESCRIBE_ENV'));
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain('super-secret-actual-value');
    delete process.env.MINDER_CRED_DESCRIBE_ENV;
  });

  it('reports present:false in the browser (default jsdom env) even when the env var is set', () => {
    process.env.MINDER_CRED_DESCRIBE_PRESENT = 'value';
    expect(typeof window).toBe('object');
    const d = describeCredential(secret('MINDER_CRED_DESCRIBE_PRESENT'));
    expect(d.present).toBe(false);
    delete process.env.MINDER_CRED_DESCRIBE_PRESENT;
  });

  it('reports present:true server-side when the env var is set, false when unset', async () => {
    process.env.MINDER_CRED_DESCRIBE_PRESENT_2 = 'value';
    await withoutWindow(() => {
      expect(describeCredential(secret('MINDER_CRED_DESCRIBE_PRESENT_2')).present).toBe(true);
      expect(describeCredential(secret('MINDER_CRED_DESCRIBE_UNSET_XYZ')).present).toBe(false);
    });
    delete process.env.MINDER_CRED_DESCRIBE_PRESENT_2;
  });

  it('reports present:true server-side for envJson file refs backed by a set env var', async () => {
    process.env.MINDER_CRED_DESCRIBE_FILE_ENV = fakeServiceAccountJson();
    await withoutWindow(() => {
      const d = describeCredential({
        kind: 'file',
        source: 'envJson',
        ref: 'MINDER_CRED_DESCRIBE_FILE_ENV',
      });
      expect(d.present).toBe(true);
    });
    delete process.env.MINDER_CRED_DESCRIBE_FILE_ENV;
  });
});

describe('validateMinderConfig — providers.* SUSPICIOUS_KEY heuristic (browser-only)', () => {
  afterEach(() => {
    if (typeof (global as any).__savedWindowCred !== 'undefined') {
      (global as any).window = (global as any).__savedWindowCred;
      delete (global as any).__savedWindowCred;
    }
  });

  it('hard-fails a raw string under a suspicious provider key, naming the exact key', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { secretKey: 'raw-string' } },
    });

    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.key === 'providers.stripe.secretKey');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(err!.message).toContain('providers.stripe.secretKey');
    expect(err!.fix).toMatch(/secret\(/);
    expect(err!.fix).toMatch(/server-side config/);
  });

  it('passes when the suspicious provider key holds a SecretRef', () => {
    const cred: CredentialInput = secret('STRIPE_SECRET_KEY');
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { secretKey: cred } },
    });

    expect(result.errors.find((e) => e.key === 'providers.stripe.secretKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('passes when the suspicious provider key holds another valid CredentialInput (serverConfig/file)', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: {
        stripe: { secretKey: { kind: 'serverConfig', key: 'stripeSecretKey' } },
        firebase: {
          serviceAccountSecret: { kind: 'file', source: 'envJson', ref: 'FIREBASE_JSON' },
        },
      },
    });

    expect(result.errors.find((e) => e.key === 'providers.stripe.secretKey')).toBeUndefined();
    expect(
      result.errors.find((e) => e.key === 'providers.firebase.serviceAccountSecret')
    ).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('does not flag non-suspicious raw string provider keys', () => {
    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { publishableKey: 'pk_live_not_suspicious_key_name' } },
    });

    expect(result.errors.find((e) => e.key === 'providers.stripe.publishableKey')).toBeUndefined();
  });

  it('does not hard-fail server-side (no window)', () => {
    (global as any).__savedWindowCred = (global as any).window;
    delete (global as any).window;

    const result = validateMinderConfig({
      apiUrl: 'https://api.example.com',
      providers: { stripe: { secretKey: 'raw-string-fine-on-server' } },
    });

    expect(result.errors.find((e) => e.key === 'providers.stripe.secretKey')).toBeUndefined();
    expect(result.valid).toBe(true);
  });
});
