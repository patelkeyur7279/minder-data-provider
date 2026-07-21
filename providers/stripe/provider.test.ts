/**
 * @jest-environment node
 *
 * Contract + server-boundary + security tests for @minder/provider-stripe.
 *
 * Runs in the `node` environment (no DOM): the server handlers resolve
 * credentials (which is server-only), and the `node` env lets `secret()` capture
 * a value so the secret-leak sentinel can prove the value never escapes.
 *
 * No `stripe` SDK is installed — the checkout + webhook handlers use `fetch`
 * (global `fetch` is stubbed here), and the SDK-missing path is asserted by
 * letting `getProviderClient()` try (and fail) to import it.
 *
 * ALL fake keys are runtime-constructed (never scanner-shaped literals; 4a4f84c).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import {
  registerStripeProvider,
  getProviderClient,
  createCheckoutHandler,
  createStripeWebhookHandler,
  parseStripeSignatureHeader,
  DEFAULT_CHECKOUT_PATH,
} from './src/index.js';
import {
  createMockPayments,
  registerStripeMocks,
  getMockCheckoutCalls,
  __resetMockCheckoutCalls,
} from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { PaymentsContract } from '../../src/contracts/types.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';
import { MinderError } from '../../src/errors/MinderError.js';
import { secret } from '../../src/security/secrets.js';
import { resolveCredential } from '../../src/security/credentials.js';
import { __setCredentialResolver } from '../../src/server/_credentialResolver.js';

// Runtime-generated fake keys — never scanner-matching literals.
const FAKE_SECRET_KEY = 'sk_test_' + 'x'.repeat(16);
const FAKE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(16);
const FAKE_PUBLISHABLE_KEY = 'pk_test_' + 'x'.repeat(16);

const SECRET_ENV = 'MINDER_TEST_STRIPE_SECRET_KEY';
const WEBHOOK_ENV = 'MINDER_TEST_STRIPE_WEBHOOK_SECRET';

const REAL_FETCH = globalThis.fetch;

// The webhook handler resolves credentials via a dynamic import of
// credentials.ts, which this CommonJS Jest VM cannot execute; inject the REAL
// resolver through the edge-safe seam so verification runs genuinely end-to-end.
// (The checkout handler resolves credentials via a direct import and needs no
// injection, but the injection is harmless there.)
beforeAll(() => {
  __setCredentialResolver(resolveCredential);
});
afterAll(() => {
  __setCredentialResolver(undefined);
});

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  globalThis.fetch = REAL_FETCH;
  __resetMockCheckoutCalls();
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

function secretKeyCredential() {
  process.env[SECRET_ENV] = FAKE_SECRET_KEY;
  return secret(SECRET_ENV);
}
function webhookCredential() {
  process.env[WEBHOOK_ENV] = FAKE_WEBHOOK_SECRET;
  return secret(WEBHOOK_ENV);
}

/** Compute a hex HMAC-SHA256 signature in-test using WebCrypto. */
async function signHex(secretValue: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretValue),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function req(url: string, rawBody: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers, body: rawBody });
}

function grabPayments(): PaymentsContract {
  const p = getCapabilityProvider<PaymentsContract>('payments');
  if (!p) throw new Error('no payments provider registered');
  return p.implementation;
}

// ---------------------------------------------------------------------------
// SERVER — createCheckoutHandler
// ---------------------------------------------------------------------------

describe('createCheckoutHandler — happy path', () => {
  it('resolves the secret key, form-encodes inline price_data line items, calls Stripe, and returns { url }', async () => {
    const fetchMock = stubFetch(async () =>
      jsonRes({ id: 'cs_test_123', url: 'https://checkout.stripe.com/x' }, 200)
    );

    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(
      req(
        'http://localhost/api/minder/stripe/checkout',
        JSON.stringify({
          items: [{ name: 'T-Shirt', amountCents: 2500, quantity: 2 }],
          successUrl: 'https://app.test/ok',
          cancelUrl: 'https://app.test/no',
        })
      )
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: 'https://checkout.stripe.com/x' });

    // Exactly one Stripe call, to the sessions endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.stripe.com/v1/checkout/sessions');

    // Authorization header carried the runtime-generated secret key (concatenated).
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${FAKE_SECRET_KEY}`);
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded');

    // Form body: mode + urls + flattened inline price_data + quantity.
    const params = new URLSearchParams(String(init.body));
    expect(params.get('mode')).toBe('payment');
    expect(params.get('success_url')).toBe('https://app.test/ok');
    expect(params.get('cancel_url')).toBe('https://app.test/no');
    expect(params.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(params.get('line_items[0][price_data][product_data][name]')).toBe('T-Shirt');
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('2500');
    expect(params.get('line_items[0][quantity]')).toBe('2');
  });

  it('defaults currency to usd and quantity to 1 when omitted', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ url: 'https://checkout.stripe.com/y' }, 200));

    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    await handler(
      req(
        'http://localhost/checkout',
        JSON.stringify({
          items: [{ name: 'Sticker', amountCents: 300 }],
          successUrl: 'https://a/ok',
          cancelUrl: 'https://a/no',
        })
      )
    );

    const params = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(params.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(params.get('line_items[0][quantity]')).toBe('1');
  });
});

describe('createCheckoutHandler — malformed request → 400', () => {
  it('returns 400 STRIPE_BAD_REQUEST for a body missing items/urls (never calls Stripe)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ url: 'nope' }, 200));

    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(req('http://localhost/checkout', JSON.stringify({ items: [] })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'STRIPE_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(req('http://localhost/checkout', 'not-json{'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'STRIPE_BAD_REQUEST' } });
  });

  it('returns 400 when an item lacks name or amountCents', async () => {
    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(
      req(
        'http://localhost/checkout',
        JSON.stringify({
          items: [{ amountCents: 100 }],
          successUrl: 'https://a/ok',
          cancelUrl: 'https://a/no',
        })
      )
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'STRIPE_BAD_REQUEST' } });
  });
});

describe('createCheckoutHandler — masked upstream error (sentinel)', () => {
  it('maps a Stripe API error to a 502 that passes the Stripe message but NEVER the key', async () => {
    const stripeMessage = 'No such price: price_missing';
    stubFetch(async () => jsonRes({ error: { message: stripeMessage, type: 'invalid_request_error' } }, 402));

    // Capture every console channel too — the key must appear nowhere.
    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(
      req(
        'http://localhost/checkout',
        JSON.stringify({
          items: [{ name: 'Ghost', amountCents: 999 }],
          successUrl: 'https://app.test/ok',
          cancelUrl: 'https://app.test/no',
        })
      )
    );

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    // Stripe's own message is passed through under the masked upstream code.
    expect(json.error.code).toBe('STRIPE_UPSTREAM_ERROR');
    expect(json.error.message).toBe(stripeMessage);

    // SENTINEL: the secret key value never appears in the response body or logs.
    expect(JSON.stringify(json)).not.toContain(FAKE_SECRET_KEY);
    expect(captured.join('\n')).not.toContain(FAKE_SECRET_KEY);
  });

  it('returns 500 STRIPE_SECRET_UNRESOLVED (masked) when the credential cannot resolve', async () => {
    delete process.env.MINDER_TEST_MISSING_SECRET;
    stubFetch(async () => jsonRes({ url: 'unused' }, 200));

    const handler = createCheckoutHandler({ secretKey: secret('MINDER_TEST_MISSING_SECRET') });
    const res = await handler(
      req(
        'http://localhost/checkout',
        JSON.stringify({
          items: [{ name: 'Item', amountCents: 100 }],
          successUrl: 'https://a/ok',
          cancelUrl: 'https://a/no',
        })
      )
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'STRIPE_SECRET_UNRESOLVED' } });
  });
});

// ---------------------------------------------------------------------------
// SERVER — createStripeWebhookHandler (end-to-end via the F-02 primitive)
// ---------------------------------------------------------------------------

describe('createStripeWebhookHandler — end-to-end signature verification', () => {
  function makeHandler(
    onEvent: (event: { type: string; data: unknown; raw: unknown }) => Promise<Response | void> = async () => {}
  ) {
    return createStripeWebhookHandler({ webhookSecret: webhookCredential(), onEvent });
  }

  it('accepts a valid t=,v1= signature and adapts the event to { type, data, raw }', async () => {
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } };
    const body = JSON.stringify(event);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_WEBHOOK_SECRET, `${ts}.${body}`);

    const onEvent = jest.fn(async () => {});
    const handler = makeHandler(onEvent as never);
    const res = await handler(req('http://localhost/webhook', body, { 'stripe-signature': `t=${ts},v1=${sig}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(onEvent).toHaveBeenCalledTimes(1);
    const arg = (onEvent.mock.calls[0] as unknown[])[0] as { type: string; data: unknown; raw: unknown };
    expect(arg.type).toBe('checkout.session.completed');
    expect(arg.data).toEqual({ object: { id: 'cs_1' } });
    expect(arg.raw).toEqual(event);
  });

  it('rejects a tampered body with 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const original = JSON.stringify({ type: 'x', amount: 10 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_WEBHOOK_SECRET, `${ts}.${original}`);
    const tampered = JSON.stringify({ type: 'x', amount: 1_000_000 });

    const res = await makeHandler()(
      req('http://localhost/webhook', tampered, { 'stripe-signature': `t=${ts},v1=${sig}` })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects a stale timestamp with 401 WEBHOOK_TIMESTAMP_STALE', async () => {
    const body = JSON.stringify({ type: 'ok' });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = await signHex(FAKE_WEBHOOK_SECRET, `${staleTs}.${body}`); // authentic signature

    const res = await makeHandler()(
      req('http://localhost/webhook', body, { 'stripe-signature': `t=${staleTs},v1=${sig}` })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_TIMESTAMP_STALE' });
  });

  it('rejects a garbled header (no v1=) with 400 WEBHOOK_SIGNATURE_MALFORMED', async () => {
    const res = await makeHandler()(req('http://localhost/webhook', '{}', { 'stripe-signature': 't=123' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MALFORMED' });
  });

  it('parseStripeSignatureHeader parses t/v1, takes the FIRST v1, and rejects incomplete headers', () => {
    expect(parseStripeSignatureHeader('t=123,v1=abcdef')).toEqual({ signature: 'abcdef', timestamp: '123' });
    expect(parseStripeSignatureHeader('t=1,v1=aaaa,v1=bbbb')).toEqual({ signature: 'aaaa', timestamp: '1' });
    expect(parseStripeSignatureHeader('t=123')).toBeNull();
    expect(parseStripeSignatureHeader('v1=abcdef')).toBeNull();
    expect(parseStripeSignatureHeader('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — PaymentsContract createCheckout POSTs to checkoutPath
// ---------------------------------------------------------------------------

describe('registerStripeProvider — client PaymentsContract', () => {
  it('createCheckout POSTs { items, successUrl, cancelUrl } to checkoutPath and returns { url }', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ url: 'https://checkout.stripe.com/session-1' }, 200));

    cleanups.push(
      await registerStripeProvider({
        publishableKey: FAKE_PUBLISHABLE_KEY,
        checkoutPath: '/custom/checkout',
      })
    );

    const provider = getCapabilityProvider<PaymentsContract>('payments');
    expect(provider).not.toBeNull();
    expect(provider!.providerName).toBe('@minder/provider-stripe');
    expect(provider!.isMock).toBeFalsy();

    const items = [{ name: 'T-Shirt', amountCents: 2500, quantity: 1 }];
    const result = await grabPayments().createCheckout({
      items,
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledPath, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe('/custom/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      items,
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
  });

  it('defaults checkoutPath to /api/minder/stripe/checkout', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ url: 'https://checkout.stripe.com/default' }, 200));

    cleanups.push(await registerStripeProvider({ publishableKey: FAKE_PUBLISHABLE_KEY }));
    await grabPayments().createCheckout({
      items: [{ name: 'x', amountCents: 1 }],
      successUrl: 'https://a/ok',
      cancelUrl: 'https://a/no',
    });

    expect(DEFAULT_CHECKOUT_PATH).toBe('/api/minder/stripe/checkout');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(DEFAULT_CHECKOUT_PATH);
  });

  it('surfaces the server-masked error message as a MinderError on a non-OK response', async () => {
    stubFetch(async () => jsonRes({ error: { code: 'STRIPE_UPSTREAM_ERROR', message: 'Your card was declined.' } }, 502));

    cleanups.push(await registerStripeProvider({ publishableKey: FAKE_PUBLISHABLE_KEY }));

    let thrown: unknown;
    try {
      await grabPayments().createCheckout({
        items: [{ name: 'x', amountCents: 1 }],
        successUrl: 'https://a/ok',
        cancelUrl: 'https://a/no',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(MinderError);
    expect((thrown as MinderError).message).toBe('Your card was declined.');
    expect((thrown as MinderError).code).toBe('STRIPE_CHECKOUT_FAILED');
  });

  it('unregister() tears down the payments capability', async () => {
    const unregister = await registerStripeProvider({ publishableKey: FAKE_PUBLISHABLE_KEY });
    expect(getCapabilityProvider('payments')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('payments')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — mock:true parity (zero network)
// ---------------------------------------------------------------------------

describe('registerStripeProvider — mock mode + parity', () => {
  it('mock:true registers an isMock payments provider that returns mock://checkout/session_<n> with zero network', async () => {
    // A fetch that throws — proves the mock never touches the network.
    const fetchMock = stubFetch(async () => {
      throw new Error('network must not be used in mock mode');
    });

    cleanups.push(await registerStripeProvider({ publishableKey: '', mock: true }));

    const provider = getCapabilityProvider<PaymentsContract>('payments');
    expect(provider).not.toBeNull();
    expect(provider!.isMock).toBe(true);
    expect(provider!.providerName).toBe('@minder/provider-stripe');

    const result = await grabPayments().createCheckout({
      items: [{ name: 'x', amountCents: 1 }],
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
    expect(result.url).toMatch(/^mock:\/\/checkout\/session_\d+$/);
    expect(fetchMock).not.toHaveBeenCalled();

    // The mock recorded the checkout call for tests/demos.
    const calls = getMockCheckoutCalls();
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/no', url: result.url });
  });

  it('the mock PaymentsContract returns a deterministic monotonic sequence and records calls', async () => {
    const mock = createMockPayments();
    const a = await mock.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    const b = await mock.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    expect(a.url).toBe('mock://checkout/session_1');
    expect(b.url).toBe('mock://checkout/session_2');
    expect(getMockCheckoutCalls().map((c) => c.url)).toEqual(['mock://checkout/session_1', 'mock://checkout/session_2']);
  });

  it('registerStripeMocks registers + tears down the payments capability', () => {
    const unregister = registerStripeMocks();
    expect(getCapabilityProvider('payments')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('payments')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CONFIG VALIDATION — registerClientSafeProviderKeys effect (browser-like)
// ---------------------------------------------------------------------------

describe('config validation — Stripe clientSafe allowlist (browser-like)', () => {
  let hadWindow = false;
  let savedWindow: unknown;
  beforeAll(() => {
    hadWindow = 'window' in globalThis;
    savedWindow = (globalThis as Record<string, unknown>).window;
    // The credential-key checks in validateMinderConfig run only in a browser-like
    // env (typeof window !== 'undefined'); simulate one for these assertions.
    (globalThis as Record<string, unknown>).window = (globalThis as Record<string, unknown>).window ?? {};
  });
  afterAll(() => {
    if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = savedWindow;
  });

  it('publishableKey (public by design) passes, but a raw secretKey string hard-fails', () => {
    // Importing ./src/index.js registered stripe's clientSafe keys at module load.
    const ok = validateMinderConfig({
      providers: { stripe: { publishableKey: FAKE_PUBLISHABLE_KEY } },
    });
    expect(ok.errors.find((e) => e.key === 'providers.stripe.publishableKey')).toBeUndefined();

    const bad = validateMinderConfig({
      providers: { stripe: { secretKey: 'raw-secret-string-not-a-real-key' } },
    });
    const err = bad.errors.find((e) => e.key === 'providers.stripe.secretKey');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(bad.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SDK-missing error from getProviderClient (server-only escape hatch)
// ---------------------------------------------------------------------------

describe('getProviderClient — optional peer', () => {
  it('throws the exact optional-peer install message when `stripe` is not installed', async () => {
    // Configure a resolvable secretKey so getProviderClient proceeds to load the SDK.
    cleanups.push(
      await registerStripeProvider({ publishableKey: FAKE_PUBLISHABLE_KEY, secretKey: secretKeyCredential() })
    );
    await expect(getProviderClient()).rejects.toThrow('Install stripe (optional peer): npm i stripe');
  });
});
