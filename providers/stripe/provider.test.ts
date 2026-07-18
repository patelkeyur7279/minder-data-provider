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
 * (global `fetch` is mocked here), and the SDK-missing path is asserted by
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
import { createMockPayments, registerStripeMocks } from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { PaymentsContract } from '../../src/contracts/types.js';
import { secret } from '../../src/security/secrets.js';
import { resolveCredential } from '../../src/security/credentials.js';
import { __setCredentialResolver } from '../../src/server/_credentialResolver.js';

// Runtime-generated fake keys — never scanner-matching literals.
const FAKE_SECRET_KEY = 'sk_test_' + 'x'.repeat(16);
const FAKE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(16);
const FAKE_PUBLISHABLE_KEY = 'pk_test_' + 'x'.repeat(16);

const SECRET_ENV = 'MINDER_TEST_STRIPE_SECRET_KEY';
const WEBHOOK_ENV = 'MINDER_TEST_STRIPE_WEBHOOK_SECRET';

// The webhook handler resolves credentials via a dynamic import of
// credentials.ts, which this CommonJS Jest VM cannot execute; inject the REAL
// resolver through the edge-safe seam so verification runs genuinely end-to-end.
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
  jest.restoreAllMocks();
});

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
  it('resolves the secret key, form-encodes line items, calls Stripe, and returns { url, id }', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ id: 'cs_test_123', url: 'https://checkout.stripe.com/x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(
      req('http://localhost/api/minder/stripe/checkout', JSON.stringify({
        items: [{ price: 'price_abc', quantity: 2 }],
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/no',
      }))
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: 'https://checkout.stripe.com/x', id: 'cs_test_123' });

    // Exactly one Stripe call, to the sessions endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.stripe.com/v1/checkout/sessions');

    // Authorization header carried the resolved secret key.
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${FAKE_SECRET_KEY}`);
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded');

    // Form body carries the line items + success/cancel URLs.
    const body = String(init.body);
    expect(body).toContain('line_items%5B0%5D%5Bprice%5D=price_abc');
    expect(body).toContain('line_items%5B0%5D%5Bquantity%5D=2');
    expect(body).toContain('success_url=https%3A%2F%2Fapp.test%2Fok');
    expect(body).toContain('cancel_url=https%3A%2F%2Fapp.test%2Fno');
  });
});

describe('createCheckoutHandler — masked upstream error (sentinel)', () => {
  it('maps a Stripe API error to a 502 that passes the Stripe message but NEVER the key', async () => {
    const stripeMessage = 'No such price: price_missing';
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: stripeMessage, type: 'invalid_request_error' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    // Capture every console channel too — the key must appear nowhere.
    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(
      req('http://localhost/checkout', JSON.stringify({
        items: [{ price: 'price_missing', quantity: 1 }],
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/no',
      }))
    );

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string; code: string };
    // Stripe's own message is passed through.
    expect(json.error).toBe(stripeMessage);
    expect(json.code).toBe('STRIPE_CHECKOUT_FAILED');

    // SENTINEL: the secret key value never appears in the response body or logs.
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain(FAKE_SECRET_KEY);
    expect(captured.join('\n')).not.toContain(FAKE_SECRET_KEY);
  });

  it('returns 500 STRIPE_SECRET_UNRESOLVED (never the secret name) when the credential cannot resolve', async () => {
    delete process.env.MINDER_TEST_MISSING_SECRET;
    const handler = createCheckoutHandler({ secretKey: secret('MINDER_TEST_MISSING_SECRET') });
    const res = await handler(req('http://localhost/checkout', '{}'));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ code: 'STRIPE_SECRET_UNRESOLVED' });
  });

  it('rejects a non-POST request with 405', async () => {
    const handler = createCheckoutHandler({ secretKey: secretKeyCredential() });
    const res = await handler(new Request('http://localhost/checkout', { method: 'GET' }));
    expect(res.status).toBe(405);
    await expect(res.json()).resolves.toMatchObject({ code: 'STRIPE_METHOD_NOT_ALLOWED' });
  });
});

// ---------------------------------------------------------------------------
// SERVER — createStripeWebhookHandler (end-to-end via the F-02 primitive)
// ---------------------------------------------------------------------------

describe('createStripeWebhookHandler — end-to-end signature verification', () => {
  function makeHandler(onEvent = async () => {}) {
    return createStripeWebhookHandler({ webhookSecret: webhookCredential(), onEvent });
  }

  it('accepts a valid t=,v1= signature, invokes onEvent, and returns 200', async () => {
    const body = JSON.stringify({ type: 'checkout.session.completed', id: 'evt_1' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_WEBHOOK_SECRET, `${ts}.${body}`);

    const onEvent = jest.fn(async () => {});
    const handler = makeHandler(onEvent);
    const res = await handler(req('http://localhost/webhook', body, { 'stripe-signature': `t=${ts},v1=${sig}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(onEvent).toHaveBeenCalledTimes(1);
    const arg = onEvent.mock.calls[0][0] as { body: unknown; rawBody: string };
    expect(arg.body).toEqual({ type: 'checkout.session.completed', id: 'evt_1' });
    expect(arg.rawBody).toBe(body);
  });

  it('rejects a tampered body with 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const original = JSON.stringify({ amount: 10 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_WEBHOOK_SECRET, `${ts}.${original}`);
    const tampered = JSON.stringify({ amount: 1_000_000 });

    const res = await makeHandler()(
      req('http://localhost/webhook', tampered, { 'stripe-signature': `t=${ts},v1=${sig}` })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects a stale timestamp with 401 WEBHOOK_TIMESTAMP_STALE', async () => {
    const body = JSON.stringify({ ok: true });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = await signHex(FAKE_WEBHOOK_SECRET, `${staleTs}.${body}`); // authentic

    const res = await makeHandler()(
      req('http://localhost/webhook', body, { 'stripe-signature': `t=${staleTs},v1=${sig}` })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_TIMESTAMP_STALE' });
  });

  it('rejects a malformed header (no v1=) with 400 WEBHOOK_SIGNATURE_MALFORMED', async () => {
    const res = await makeHandler()(
      req('http://localhost/webhook', '{}', { 'stripe-signature': 't=123' })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MALFORMED' });
  });

  it('parseStripeSignatureHeader parses t/v1 and rejects incomplete headers', () => {
    expect(parseStripeSignatureHeader('t=123,v1=abcdef')).toEqual({ signature: 'abcdef', timestamp: '123' });
    // Uses the FIRST v1 scheme when multiple are present.
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
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/session-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

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

    const result = await grabPayments().createCheckout({
      items: [{ price: 'price_abc', quantity: 1 }],
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session-1' });

    // POSTed to the configured path with the JSON payload.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledPath, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe('/custom/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ price: 'price_abc', quantity: 1 }],
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
  });

  it('defaults checkoutPath to /api/minder/stripe/checkout', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/default' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    cleanups.push(await registerStripeProvider({ publishableKey: FAKE_PUBLISHABLE_KEY }));
    await grabPayments().createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });

    expect(DEFAULT_CHECKOUT_PATH).toBe('/api/minder/stripe/checkout');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(DEFAULT_CHECKOUT_PATH);
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
  it('mock:true registers an isMock payments provider that returns a deterministic mock:// url with zero network', async () => {
    // A fetch that throws — proves the mock never touches the network.
    const fetchMock = jest.fn(async () => {
      throw new Error('network must not be used in mock mode');
    });
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    cleanups.push(await registerStripeProvider({ mock: true }));

    const provider = getCapabilityProvider<PaymentsContract>('payments');
    expect(provider).not.toBeNull();
    expect(provider!.isMock).toBe(true);
    expect(provider!.providerName).toBe('@minder/provider-stripe');

    const result = await grabPayments().createCheckout({
      items: [{ price: 'price_abc', quantity: 1 }],
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
    expect(typeof result.url).toBe('string');
    expect(result.url).toMatch(/^mock:\/\/stripe\/checkout\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the mock PaymentsContract satisfies the same shape as the real one (deterministic sequence)', async () => {
    const mock = createMockPayments();
    const a = await mock.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    const b = await mock.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    expect(a.url).toBe('mock://stripe/checkout/cs_mock_1');
    expect(b.url).toBe('mock://stripe/checkout/cs_mock_2');
    // A fresh instance restarts the deterministic sequence.
    const fresh = createMockPayments();
    const c = await fresh.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    expect(c.url).toBe('mock://stripe/checkout/cs_mock_1');
  });

  it('registerStripeMocks registers + tears down the payments capability', () => {
    const unregister = registerStripeMocks();
    expect(getCapabilityProvider('payments')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('payments')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Security sentinel — a secretKey CredentialInput never leaks anywhere
// ---------------------------------------------------------------------------

describe('security — the secretKey value never appears in any output', () => {
  it('the raw secret value never reaches logs, errors, or the response, even on a Stripe failure', async () => {
    const SENTINEL = 'sk_test_' + 'SENTINEL'.repeat(4) + 'DO-NOT-LEAK';

    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    // Stripe rejects — a masked 502 path that also exercises the error surface.
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'card_declined' } }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      })
    );
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const secretKey = secret('MINDER_TEST_SENTINEL_KEY', SENTINEL);
    // The SecretRef masks itself under stringification.
    expect(String(secretKey)).toBe('[SECRET:MINDER_TEST_SENTINEL_KEY]');

    const handler = createCheckoutHandler({ secretKey });
    const res = await handler(
      req('http://localhost/checkout', JSON.stringify({
        items: [{ price: 'price_x', quantity: 1 }],
        successUrl: 'https://a/ok',
        cancelUrl: 'https://a/no',
      }))
    );

    const text = await res.text();
    expect(text).not.toContain(SENTINEL);
    expect(captured.join('\n')).not.toContain(SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// SDK-missing error from getProviderClient
// ---------------------------------------------------------------------------

describe('getProviderClient — optional peer', () => {
  it('throws the exact optional-peer install message when `stripe` is not installed', async () => {
    await expect(getProviderClient()).rejects.toThrow('Install stripe (optional peer): npm i stripe');
  });
});
