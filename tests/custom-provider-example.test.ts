/**
 * @jest-environment node
 *
 * Contract + security tests for the Acme reference custom provider (see
 * docs/providers/CUSTOM.md #3) — sentinel-test pattern mirrors
 * providers/clerk/provider.test.ts, this repo's template.
 *
 * MOVED from examples/custom-provider/acme-provider.test.ts (G-06): jest's
 * `testPathIgnorePatterns` excludes `/examples/`, so a test file living there
 * never ran as part of `npx jest` — this reference example's own tests were
 * silently skipped by the gate. This file is that same test suite, unchanged
 * in substance (same four cases), relocated so it actually runs. It also now
 * exercises acme-provider.ts's imports for real: that file imports ONLY from
 * '../../src/index.js' and '../../src/server.js' (standing in for
 * 'minder-data-provider' and 'minder-data-provider/server'), so a green run
 * here is proof the published surface is sufficient to build it.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { registerAcmeProvider, getProviderClient, createAcmeIngestHandler } from '../examples/custom-provider/acme-provider';
import type { AcmeLikeClient } from '../examples/custom-provider/acme-provider';
import { getCapabilityProvider } from '../src/contracts/registry';
import type { LiveContract } from '../src/contracts/types';
import { validateMinderConfig } from '../src/config/validateConfig';
import { secret } from '../src/security/secrets';

const FAKE_SECRET = 'acme_sk_test_' + 'x'.repeat(16);
const SECRET_ENV = 'MINDER_TEST_ACME_API_SECRET';

const fakeClient = (): AcmeLikeClient => {
  const listeners = new Map<string, (e: unknown) => void>();
  return { on: (ch, cb) => void listeners.set(ch, cb), off: (ch) => void listeners.delete(ch) };
};

describe('registerAcmeProvider', () => {
  it('registers a live capability, exposes the fake SDK via getProviderClient(), and unregister() cleans it up', () => {
    const client = fakeClient();
    const unregister = registerAcmeProvider({ projectId: 'proj_1', createAcmeClient: () => client });

    const p = getCapabilityProvider<LiveContract>('live');
    expect(p?.providerName).toBe('acme-analytics');
    expect(p?.isMock).toBeFalsy();
    expect(getProviderClient()).toBe(client);

    unregister();
    expect(getCapabilityProvider('live')).toBeNull();
    expect(getProviderClient()).toBeNull();
  });

  it('mock: true registers a deterministic isMock live provider with zero SDK/keys', () => {
    const unregister = registerAcmeProvider({ mock: true });
    const p = getCapabilityProvider<LiveContract>('live');
    expect(p?.isMock).toBe(true);
    expect(getProviderClient()).toBeNull();

    const events: unknown[] = [];
    p!.implementation.subscribe('events', (e) => events.push(e));
    expect(events).toEqual([{ channel: 'events', mock: true }]);
    unregister();
  });
});

describe('config validation — raw secret-shaped key hard-fails (browser-like)', () => {
  it('providers.acme.apiSecret as a raw string is rejected; projectId (registered client-safe) passes', () => {
    const saved = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {};

    const ok = validateMinderConfig({ providers: { acme: { projectId: 'proj_1' } } });
    expect(ok.errors.find((e) => e.key === 'providers.acme.projectId')).toBeUndefined();

    const bad = validateMinderConfig({ providers: { acme: { apiSecret: 'raw-secret-value-not-wrapped' } } });
    expect(bad.errors.find((e) => e.key === 'providers.acme.apiSecret')?.level).toBe('error');
    expect(bad.valid).toBe(false);

    (globalThis as Record<string, unknown>).window = saved;
  });
});

describe('createAcmeIngestHandler — security sentinel', () => {
  it('never leaks the resolved secret into the response or any console channel, success or failure', async () => {
    const captured: string[] = [];
    for (const ch of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, ch).mockImplementation((...a) => void captured.push(a.map(String).join(' ')));
    }
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;

    process.env[SECRET_ENV] = FAKE_SECRET;
    const okRes = await createAcmeIngestHandler({ apiSecret: secret(SECRET_ENV) })(
      new Request('http://localhost/ingest', { method: 'POST', body: '{"e":1}' })
    );
    expect(okRes.status).toBe(202);

    delete process.env[SECRET_ENV]; // now unresolvable -> the masked-failure path
    const failRes = await createAcmeIngestHandler({ apiSecret: secret(SECRET_ENV) })(
      new Request('http://localhost/ingest', { method: 'POST', body: '{}' })
    );
    expect(failRes.status).toBe(500);

    const bodies = (await okRes.text()) + (await failRes.text());
    expect(bodies).not.toContain(FAKE_SECRET);
    expect(captured.join('\n')).not.toContain(FAKE_SECRET);

    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });
});
