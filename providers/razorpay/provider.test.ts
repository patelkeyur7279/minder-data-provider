/**
 * @jest-environment node
 *
 * Contract + server-boundary + security tests for @minder/provider-razorpay.
 *
 * Runs in the `node` environment (no DOM): the server handlers resolve
 * credentials (which is server-only), and the `node` env lets `secret()` capture
 * a value so the secret-leak sentinel can prove the value never escapes.
 *
 * No `razorpay` SDK is installed — the order + webhook handlers use `fetch`
 * (global `fetch` is stubbed here), and the SDK-missing path is asserted by
 * letting `getProviderClient()` try (and fail) to import it.
 *
 * ALL fake keys are runtime-constructed (never scanner-shaped literals; 4a4f84c).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import {
  registerRazorpayProvider,
  getProviderClient,
  createOrderHandler,
  createRazorpayWebhookHandler,
  DEFAULT_ORDER_PATH,
} from './src/index.js';
import {
  createMockPayments,
  registerRazorpayMocks,
  getMockOrderCalls,
  __resetMockOrderCalls,
} from './mock.js';
import { getCapabilityProvider } from '../../src/contracts/registry.js';
import type { PaymentsContract } from '../../src/contracts/types.js';
import { validateMinderConfig } from '../../src/config/validateConfig.js';
import { MinderError } from '../../src/errors/MinderError.js';
import { secret } from '../../src/security/secrets.js';
import { resolveCredential } from '../../src/security/credentials.js';
import { __setCredentialResolver } from '../../src/server/_credentialResolver.js';

// Runtime-generated fake keys — never scanner-matching literals.
const FAKE_KEY_ID = 'rzp_test_' + 'x'.repeat(16);
const FAKE_KEY_SECRET = 'x'.repeat(16);
const FAKE_WEBHOOK_SECRET = 'x'.repeat(16);

const SECRET_ENV = 'MINDER_TEST_RAZORPAY_KEY_SECRET';
const WEBHOOK_ENV = 'MINDER_TEST_RAZORPAY_WEBHOOK_SECRET';

const REAL_FETCH = globalThis.fetch;

// The webhook handler resolves credentials via a dynamic import of
// credentials.ts, which this CommonJS Jest VM cannot execute; inject the REAL
// resolver through the edge-safe seam so verification runs genuinely end-to-end.
// (The order handler resolves credentials via a direct import and needs no
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
  __resetMockOrderCalls();
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

function keySecretCredential() {
  process.env[SECRET_ENV] = FAKE_KEY_SECRET;
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

function req(url: string, rawBody: string, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request(url, { method, headers, body: method === 'GET' ? undefined : rawBody });
}

function grabPayments(): PaymentsContract {
  const p = getCapabilityProvider<PaymentsContract>('payments');
  if (!p) throw new Error('no payments provider registered');
  return p.implementation;
}

// ---------------------------------------------------------------------------
// SERVER — createOrderHandler
// ---------------------------------------------------------------------------

describe('createOrderHandler — happy path', () => {
  it('resolves the key secret, sends Basic auth, calls Razorpay, and returns { id, amount, currency, keyId }', async () => {
    const fetchMock = stubFetch(async () =>
      jsonRes({ id: 'order_x', amount: 5000, currency: 'INR', status: 'created' }, 200)
    );

    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    const res = await handler(
      req(
        'http://localhost/api/minder/razorpay/order',
        JSON.stringify({ amount: 5000, currency: 'INR', receipt: 'rcpt_1' })
      )
    );

    expect(res.status).toBe(200);
    // keyId (public) is returned so the client widget can use it.
    await expect(res.json()).resolves.toEqual({
      id: 'order_x',
      amount: 5000,
      currency: 'INR',
      keyId: FAKE_KEY_ID,
    });

    // Exactly one Razorpay call, to the orders endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.razorpay.com/v1/orders');

    // Authorization header carries base64(keyId:secret) (runtime-generated).
    const headers = init.headers as Record<string, string>;
    const expectedBasic = 'Basic ' + Buffer.from(`${FAKE_KEY_ID}:${FAKE_KEY_SECRET}`).toString('base64');
    expect(headers.authorization).toBe(expectedBasic);
    expect(headers['content-type']).toBe('application/json');

    // JSON body carries amount/currency/receipt.
    expect(JSON.parse(String(init.body))).toEqual({ amount: 5000, currency: 'INR', receipt: 'rcpt_1' });
  });

  it('defaults currency to INR and omits receipt when not provided', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ id: 'order_y', amount: 300, currency: 'INR' }, 200));

    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    await handler(req('http://localhost/order', JSON.stringify({ amount: 300 })));

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).toEqual({ amount: 300, currency: 'INR' });
    expect('receipt' in body).toBe(false);
  });
});

describe('createOrderHandler — method + malformed guards', () => {
  it('returns 405 RAZORPAY_METHOD_NOT_ALLOWED for a non-POST request (never calls Razorpay)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ id: 'nope' }, 200));

    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    const res = await handler(req('http://localhost/order', '', {}, 'GET'));

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'RAZORPAY_METHOD_NOT_ALLOWED' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 RAZORPAY_BAD_REQUEST for a body missing amount (never calls Razorpay)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ id: 'nope' }, 200));

    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    const res = await handler(req('http://localhost/order', JSON.stringify({ currency: 'INR' })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'RAZORPAY_BAD_REQUEST' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    const res = await handler(req('http://localhost/order', 'not-json{'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'RAZORPAY_BAD_REQUEST' } });
  });

  it('returns 400 for a non-positive or non-integer amount', async () => {
    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    for (const amount of [0, -5, 12.5]) {
      const res = await handler(req('http://localhost/order', JSON.stringify({ amount })));
      expect(res.status).toBe(400);
    }
  });
});

describe('createOrderHandler — masked upstream error (sentinel)', () => {
  it('maps a Razorpay API error to a 502 that passes the description but NEVER the key secret', async () => {
    const rzpDescription = 'The amount must be atleast INR 1.00';
    stubFetch(async () =>
      jsonRes({ error: { code: 'BAD_REQUEST_ERROR', description: rzpDescription } }, 400)
    );

    // Capture every console channel too — the key secret must appear nowhere.
    const captured: string[] = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(' '));
      });
    }

    const handler = createOrderHandler({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() });
    const res = await handler(req('http://localhost/order', JSON.stringify({ amount: 50 })));

    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; message: string } };
    // Razorpay's own description is passed through under the masked upstream code.
    expect(json.error.code).toBe('RAZORPAY_UPSTREAM_ERROR');
    expect(json.error.message).toBe(rzpDescription);

    // SENTINEL: the key secret value never appears in the response body or logs.
    expect(JSON.stringify(json)).not.toContain(FAKE_KEY_SECRET);
    expect(captured.join('\n')).not.toContain(FAKE_KEY_SECRET);
  });

  it('returns 500 RAZORPAY_SECRET_UNRESOLVED (masked) when the credential cannot resolve', async () => {
    delete process.env.MINDER_TEST_MISSING_SECRET;
    stubFetch(async () => jsonRes({ id: 'unused' }, 200));

    const handler = createOrderHandler({
      keyId: FAKE_KEY_ID,
      keySecret: secret('MINDER_TEST_MISSING_SECRET'),
    });
    const res = await handler(req('http://localhost/order', JSON.stringify({ amount: 100 })));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'RAZORPAY_SECRET_UNRESOLVED' } });
  });
});

// ---------------------------------------------------------------------------
// SERVER — createRazorpayWebhookHandler (end-to-end via the F-02 primitive)
// ---------------------------------------------------------------------------

describe('createRazorpayWebhookHandler — end-to-end signature verification', () => {
  function makeHandler(
    onEvent: (event: { body: unknown; rawBody: string; headers: Headers }) => Promise<Response | void> = async () => {}
  ) {
    return createRazorpayWebhookHandler({ webhookSecret: webhookCredential(), onEvent });
  }

  it('accepts a valid bare hex signature over the raw body (no timestamp) and forwards { body, rawBody }', async () => {
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } };
    const body = JSON.stringify(event);
    const sig = await signHex(FAKE_WEBHOOK_SECRET, body); // NO timestamp — raw body only

    const onEvent = jest.fn(async () => {});
    const handler = makeHandler(onEvent as never);
    const res = await handler(req('http://localhost/webhook', body, { 'x-razorpay-signature': sig }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(onEvent).toHaveBeenCalledTimes(1);
    const arg = (onEvent.mock.calls[0] as unknown[])[0] as { body: unknown; rawBody: string };
    expect(arg.body).toEqual(event);
    expect(arg.rawBody).toBe(body);
  });

  it('rejects a tampered body with 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const original = JSON.stringify({ event: 'payment.captured', amount: 10 });
    const sig = await signHex(FAKE_WEBHOOK_SECRET, original);
    const tampered = JSON.stringify({ event: 'payment.captured', amount: 1_000_000 });

    const res = await makeHandler()(
      req('http://localhost/webhook', tampered, { 'x-razorpay-signature': sig })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects a missing signature header with 400 WEBHOOK_SIGNATURE_MISSING', async () => {
    const res = await makeHandler()(req('http://localhost/webhook', '{}'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' });
  });

  it('does not enforce any timestamp tolerance (accepts a body regardless of time)', async () => {
    // There is no timestamp in Razorpay signatures, so an "old" event still verifies
    // purely on the HMAC of the raw body.
    const body = JSON.stringify({ event: 'order.paid', at: 0 });
    const sig = await signHex(FAKE_WEBHOOK_SECRET, body);
    const res = await makeHandler()(req('http://localhost/webhook', body, { 'x-razorpay-signature': sig }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// CLIENT — PaymentsContract createCheckout POSTs to the order route
// ---------------------------------------------------------------------------

describe('registerRazorpayProvider — client PaymentsContract', () => {
  it('createCheckout POSTs the derived order to DEFAULT_ORDER_PATH and returns { url } (order ref)', async () => {
    const fetchMock = stubFetch(async () => jsonRes({ id: 'order_abc', amount: 5000, currency: 'INR', keyId: FAKE_KEY_ID }, 200));

    cleanups.push(await registerRazorpayProvider({ keyId: FAKE_KEY_ID }));

    const provider = getCapabilityProvider<PaymentsContract>('payments');
    expect(provider).not.toBeNull();
    expect(provider!.providerName).toBe('@minder/provider-razorpay');
    expect(provider!.isMock).toBeFalsy();

    const result = await grabPayments().createCheckout({
      items: [{ name: 'T-Shirt', amountCents: 2500, currency: 'inr', quantity: 2 }],
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
    expect(result).toEqual({ url: 'razorpay://order/order_abc' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledPath, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledPath).toBe(DEFAULT_ORDER_PATH);
    expect(DEFAULT_ORDER_PATH).toBe('/api/minder/razorpay/order');
    expect(init.method).toBe('POST');
    // amount = 2500 * 2, currency uppercased from the first item.
    expect(JSON.parse(String(init.body))).toEqual({ amount: 5000, currency: 'INR' });
  });

  it('surfaces the server-masked error message as a MinderError on a non-OK response', async () => {
    stubFetch(async () => jsonRes({ error: { code: 'RAZORPAY_UPSTREAM_ERROR', message: 'The amount must be atleast INR 1.00' } }, 502));

    cleanups.push(await registerRazorpayProvider({ keyId: FAKE_KEY_ID }));

    let thrown: unknown;
    try {
      await grabPayments().createCheckout({
        items: [{ name: 'x', amountCents: 1, quantity: 1 }],
        successUrl: 'https://a/ok',
        cancelUrl: 'https://a/no',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(MinderError);
    expect((thrown as MinderError).message).toBe('The amount must be atleast INR 1.00');
    expect((thrown as MinderError).code).toBe('RAZORPAY_ORDER_FAILED');
  });

  it('unregister() tears down the payments capability', async () => {
    const unregister = await registerRazorpayProvider({ keyId: FAKE_KEY_ID });
    expect(getCapabilityProvider('payments')).not.toBeNull();
    unregister();
    expect(getCapabilityProvider('payments')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLIENT — mock:true parity (zero network)
// ---------------------------------------------------------------------------

describe('registerRazorpayProvider — mock mode + parity', () => {
  it('mock:true registers an isMock payments provider returning mock://razorpay/order/... with zero network', async () => {
    // A fetch that throws — proves the mock never touches the network.
    const fetchMock = stubFetch(async () => {
      throw new Error('network must not be used in mock mode');
    });

    cleanups.push(await registerRazorpayProvider({ keyId: FAKE_KEY_ID, mock: true }));

    const provider = getCapabilityProvider<PaymentsContract>('payments');
    expect(provider).not.toBeNull();
    expect(provider!.isMock).toBe(true);
    expect(provider!.providerName).toBe('@minder/provider-razorpay');

    const result = await grabPayments().createCheckout({
      items: [{ name: 'x', amountCents: 1, quantity: 1 }],
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/no',
    });
    expect(result.url).toMatch(/^mock:\/\/razorpay\/order\/order_mock_\d+$/);
    expect(fetchMock).not.toHaveBeenCalled();

    // The mock recorded the checkout call for tests/demos.
    const calls = getMockOrderCalls();
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/no', url: result.url });
  });

  it('the mock PaymentsContract returns a deterministic monotonic sequence and records calls', async () => {
    const mock = createMockPayments();
    const a = await mock.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    const b = await mock.createCheckout({ items: [], successUrl: 'https://a/ok', cancelUrl: 'https://a/no' });
    expect(a.url).toBe('mock://razorpay/order/order_mock_1');
    expect(b.url).toBe('mock://razorpay/order/order_mock_2');
    expect(getMockOrderCalls().map((c) => c.url)).toEqual([
      'mock://razorpay/order/order_mock_1',
      'mock://razorpay/order/order_mock_2',
    ]);
  });

  it('registerRazorpayMocks registers + tears down the payments capability', () => {
    const unregister = registerRazorpayMocks();
    expect(getCapabilityProvider('payments')?.isMock).toBe(true);
    unregister();
    expect(getCapabilityProvider('payments')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CONFIG VALIDATION — registerClientSafeProviderKeys effect (browser-like)
// ---------------------------------------------------------------------------

describe('config validation — Razorpay clientSafe allowlist (browser-like)', () => {
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

  it('keyId (public by design) passes, but a raw keySecret string hard-fails', () => {
    // Importing ./src/index.js registered razorpay's clientSafe keys at module load.
    const ok = validateMinderConfig({
      providers: { razorpay: { keyId: FAKE_KEY_ID } },
    });
    expect(ok.errors.find((e) => e.key === 'providers.razorpay.keyId')).toBeUndefined();

    const bad = validateMinderConfig({
      providers: { razorpay: { keySecret: 'raw-secret-string-not-a-real-key' } },
    });
    const err = bad.errors.find((e) => e.key === 'providers.razorpay.keySecret');
    expect(err).toBeDefined();
    expect(err!.level).toBe('error');
    expect(bad.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SDK-missing error from getProviderClient (server-only escape hatch)
// ---------------------------------------------------------------------------

describe('getProviderClient — optional peer', () => {
  it('throws the exact optional-peer install message when `razorpay` is not installed', async () => {
    // Configure a resolvable keySecret so getProviderClient proceeds to load the SDK.
    cleanups.push(
      await registerRazorpayProvider({ keyId: FAKE_KEY_ID, keySecret: keySecretCredential() })
    );
    await expect(getProviderClient()).rejects.toThrow('Install razorpay (optional peer): npm i razorpay');
  });
});
