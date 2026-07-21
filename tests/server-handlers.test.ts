/**
 * @jest-environment node
 *
 * F-02: edge-safe web-standard server handler core + HMAC webhook verification
 * + Node mount. Security-critical — signature verification must be constant-time
 * (crypto.subtle.verify), never string comparison.
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';

import { createWebhookHandler } from '../src/server/webhooks';
import { jsonResponse } from '../src/server/handlers';
import { toNodeHandler } from '../src/server/nodeMount';
import { secret } from '../src/security/secrets';
import { resolveCredential } from '../src/security/credentials';
import { __setCredentialResolver } from '../src/server/_credentialResolver';
// Regression: existing server exports must still work through the barrel.
import { resolveSecret } from '../src/server';

// This Jest project runs without --experimental-vm-modules, so the CommonJS VM
// cannot execute the handler's internal dynamic `import()` of credentials.ts.
// Inject the REAL resolveCredential through the edge-safe seam so verification is
// exercised genuinely end-to-end. (On real edge/Node runtimes the dynamic import
// works and no injection is needed.)
beforeAll(() => {
  __setCredentialResolver(resolveCredential);
});

afterAll(() => {
  __setCredentialResolver(undefined);
});

// Runtime-generated fake secret — never a scanner-matching literal.
const FAKE_SECRET = 'whsec_' + 'x'.repeat(8);
const SECRET_ENV = 'MINDER_TEST_WEBHOOK_SECRET';
const SIG_HEADER = 'x-minder-signature';
const TS_HEADER = 'x-minder-timestamp';

function credential() {
  process.env[SECRET_ENV] = FAKE_SECRET;
  return secret(SECRET_ENV);
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

function makeRequest(rawBody: string, headers: Record<string, string>): Request {
  return new Request('http://localhost/webhooks/test', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('F-02 webhook verification', () => {
  it('accepts a valid signature, parses the body, and returns 200 {received:true}', async () => {
    const body = JSON.stringify({ hello: 'world', n: 42 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_SECRET, `${ts}.${body}`);

    const onEvent = jest.fn(async () => {});
    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      timestampHeader: TS_HEADER,
      algorithm: 'hmac-sha256',
      onEvent,
    });

    const res = await handler(
      makeRequest(body, { [SIG_HEADER]: sig, [TS_HEADER]: ts, 'content-type': 'application/json' })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(onEvent).toHaveBeenCalledTimes(1);
    const arg = onEvent.mock.calls[0][0] as { body: unknown; rawBody: string; headers: Headers };
    expect(arg.body).toEqual({ hello: 'world', n: 42 });
    expect(arg.rawBody).toBe(body);
    expect(arg.headers).toBeInstanceOf(Headers);
  });

  it('rejects a tampered body with 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const original = JSON.stringify({ amount: 10 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_SECRET, `${ts}.${original}`);
    const tampered = JSON.stringify({ amount: 1000000 });

    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      timestampHeader: TS_HEADER,
      algorithm: 'hmac-sha256',
      onEvent: async () => {},
    });

    const res = await handler(makeRequest(tampered, { [SIG_HEADER]: sig, [TS_HEADER]: ts }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects a stale timestamp with 401 WEBHOOK_TIMESTAMP_STALE', async () => {
    const body = JSON.stringify({ ok: true });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = await signHex(FAKE_SECRET, `${staleTs}.${body}`); // signature is authentic

    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      timestampHeader: TS_HEADER,
      timestampToleranceSec: 300,
      algorithm: 'hmac-sha256',
      onEvent: async () => {},
    });

    const res = await handler(makeRequest(body, { [SIG_HEADER]: sig, [TS_HEADER]: staleTs }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_TIMESTAMP_STALE' });
  });

  it('tolerance 0 disables the timestamp check (stale but valid signature → 200)', async () => {
    const body = JSON.stringify({ ok: true });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = await signHex(FAKE_SECRET, `${staleTs}.${body}`);

    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      timestampHeader: TS_HEADER,
      timestampToleranceSec: 0,
      algorithm: 'hmac-sha256',
      onEvent: async () => {},
    });

    const res = await handler(makeRequest(body, { [SIG_HEADER]: sig, [TS_HEADER]: staleTs }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      algorithm: 'hmac-sha256',
      onEvent: async () => {},
    });
    const res = await handler(makeRequest('{}', {}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' });
  });

  it('returns 400 when the signature header is not valid hex', async () => {
    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      algorithm: 'hmac-sha256',
      onEvent: async () => {},
    });
    const res = await handler(makeRequest('{}', { [SIG_HEADER]: 'not-hex-zz!!' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MALFORMED' });
  });

  it('passes through a custom Response returned by onEvent', async () => {
    const body = JSON.stringify({ ping: 1 });
    const sig = await signHex(FAKE_SECRET, body); // no timestamp → payload is the raw body

    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      algorithm: 'hmac-sha256',
      onEvent: async () => new Response('custom-body', { status: 202 }),
    });

    const res = await handler(makeRequest(body, { [SIG_HEADER]: sig }));
    expect(res.status).toBe(202);
    await expect(res.text()).resolves.toBe('custom-body');
  });
});

describe('F-02 parseSignatureHeader extension (Stripe-style packed header)', () => {
  // Parse a Stripe-style `t=<ts>,v1=<hex>` header into { signature, timestamp }.
  function parsePackedSig(raw: string): { signature: string; timestamp?: string } | null {
    let t: string | undefined;
    let v1: string | undefined;
    for (const part of raw.split(',')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k === 't') t = v;
      else if (k === 'v1' && v1 === undefined) v1 = v;
    }
    if (!t || !v1) return null;
    return { signature: v1, timestamp: t };
  }

  it('verifies end-to-end with a parser: t=<ts>,v1=<hex> over `${t}.${body}` → 200', async () => {
    const body = JSON.stringify({ event: 'checkout.session.completed', amount: 4200 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_SECRET, `${ts}.${body}`);

    const onEvent = jest.fn(async () => {});
    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: 'stripe-signature',
      algorithm: 'hmac-sha256',
      parseSignatureHeader: parsePackedSig,
      payloadFormat: (b, t) => `${t}.${b}`,
      onEvent,
    });

    const res = await handler(
      makeRequest(body, { 'stripe-signature': `t=${ts},v1=${sig}` })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects with 401 WEBHOOK_TIMESTAMP_STALE when the parsed timestamp is stale (staleness enforced from the parser)', async () => {
    const body = JSON.stringify({ ok: true });
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = await signHex(FAKE_SECRET, `${staleTs}.${body}`); // authentic signature

    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: 'stripe-signature',
      algorithm: 'hmac-sha256',
      timestampToleranceSec: 300,
      parseSignatureHeader: parsePackedSig,
      payloadFormat: (b, t) => `${t}.${b}`,
      onEvent: async () => {},
    });

    const res = await handler(makeRequest(body, { 'stripe-signature': `t=${staleTs},v1=${sig}` }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_TIMESTAMP_STALE' });
  });

  it('returns 400 WEBHOOK_SIGNATURE_MALFORMED when the parser returns null', async () => {
    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: 'stripe-signature',
      algorithm: 'hmac-sha256',
      parseSignatureHeader: parsePackedSig,
      onEvent: async () => {},
    });

    // Header has no `v1=` segment → parser returns null → malformed.
    const res = await handler(makeRequest('{}', { 'stripe-signature': 't=123' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MALFORMED' });
  });

  it('regression: WITHOUT a parser, the default path is unchanged (whole header is the hex signature, timestamp from timestampHeader)', async () => {
    const body = JSON.stringify({ default: 'path' });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signHex(FAKE_SECRET, `${ts}.${body}`);

    const onEvent = jest.fn(async () => {});
    const handler = createWebhookHandler({
      secret: credential(),
      signatureHeader: SIG_HEADER,
      timestampHeader: TS_HEADER,
      algorithm: 'hmac-sha256',
      onEvent,
    });

    // No parseSignatureHeader: the raw hex sig is the whole header value.
    const res = await handler(makeRequest(body, { [SIG_HEADER]: sig, [TS_HEADER]: ts }));
    expect(res.status).toBe(200);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});

describe('F-02 constant-time source inspection', () => {
  it('webhooks.ts never string-compares signatures and never uses require()', () => {
    const source = readFileSync(join(__dirname, '../src/server/webhooks.ts'), 'utf8');
    expect(source).not.toMatch(/===\s*signature/);
    expect(source).not.toMatch(/==\s*signature/);
    expect(source).not.toMatch(/signature\s*===/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    // Positive assertion: verification goes through the constant-time primitive.
    expect(source).toMatch(/crypto\.subtle\.verify/);
  });
});

describe('F-02 jsonResponse helper', () => {
  it('serializes JSON and sets content-type', async () => {
    const res = jsonResponse({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({ a: 1 });
  });
});

describe('F-02 toNodeHandler round-trip', () => {
  it('faithfully transfers method, headers, body, and status against a real http.Server', async () => {
    const handler: (req: Request) => Promise<Response> = async (req) => {
      const inBody = await req.text();
      return jsonResponse(
        {
          method: req.method,
          echoedBody: inBody,
          receivedHeader: req.headers.get('x-custom-header'),
        },
        { status: 201, headers: { 'x-handler-header': 'from-handler' } }
      );
    };

    const server = http.createServer(toNodeHandler(handler));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${port}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-custom-header': 'hello-node' },
        body: JSON.stringify({ v: 7 }),
      });

      expect(resp.status).toBe(201);
      expect(resp.headers.get('x-handler-header')).toBe('from-handler');
      const json = (await resp.json()) as { method: string; echoedBody: string; receivedHeader: string };
      expect(json.method).toBe('POST');
      expect(json.echoedBody).toBe(JSON.stringify({ v: 7 }));
      expect(json.receivedHeader).toBe('hello-node');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('F-02 regression — existing server exports intact', () => {
  it('resolveSecret still resolves through the barrel', () => {
    process.env.MINDER_REGRESSION_SECRET = 'value-123';
    expect(resolveSecret('MINDER_REGRESSION_SECRET')).toBe('value-123');
    expect(typeof resolveSecret).toBe('function');
  });
});
