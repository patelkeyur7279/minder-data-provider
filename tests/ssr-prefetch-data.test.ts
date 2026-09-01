/**
 * @jest-environment node
 *
 * fix-2.2.0-blockers (ResolvedRequest redesign) — `prefetchData` (src/ssr/index.ts)
 * was one of the two ALREADY-KNOWN unfixed readers of a declared route's raw
 * `.method`/`.url` on a real dispatch path (the architect's own finding,
 * alongside src/core/configValidator.ts:55): it compared `route.method ===
 * 'GET'` with strict case-sensitive equality, and built the fetch URL
 * straight from `route.url` with ZERO placeholder resolution or refusal —
 * a route whose URL still carried an unresolved ':param' would have been
 * fetched VERBATIM, literal colon and all.
 *
 * This suite drives `prefetchData` against a REAL `node:http` server (never
 * mocks `fetch`) and asserts the actual method/path that reaches the wire,
 * mirroring the wire-suite's own "never mock the transport" discipline for
 * the parts of this fix that live outside ApiClient.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { prefetchData } from '../src/ssr/index';
import type { MinderConfig, ApiRoute } from '../src/core/types';

interface Recorded {
  method: string;
  url: string;
}

async function startRecordingServer(): Promise<{
  baseUrl: string;
  records: Recorded[];
  close: () => Promise<void>;
}> {
  const records: Recorded[] = [];
  const server = http.createServer((req, res) => {
    records.push({ method: req.method ?? '', url: req.url ?? '' });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    records,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('prefetchData (SSR) — ResolvedRequest migration', () => {
  let server: Awaited<ReturnType<typeof startRecordingServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('fetches a real GET request for a placeholder-free route, on the wire', async () => {
    server = await startRecordingServer();
    const config: MinderConfig = {
      apiBaseUrl: server.baseUrl,
      routes: { items: { method: 'GET' as ApiRoute['method'], url: '/items' } },
    };

    const data = await prefetchData(config, ['items']);

    expect(server.records).toHaveLength(1);
    expect(server.records[0]).toEqual({ method: 'GET', url: '/items' });
    expect(data.items).toEqual({ ok: true, path: '/items' });
  });

  it('dispatches a lowercase-declared method case-insensitively (the src/ssr/index.ts:29 defect)', async () => {
    server = await startRecordingServer();
    const config: MinderConfig = {
      apiBaseUrl: server.baseUrl,
      // A hand-authored route can declare `method: 'get'` — nothing enforces
      // the HttpMethod enum at runtime. Before the fix, the strict
      // `route.method === 'GET'` comparison silently skipped this route.
      routes: { items: { method: 'get' as ApiRoute['method'], url: '/lc-items' } },
    };

    const data = await prefetchData(config, ['items']);

    expect(server.records).toHaveLength(1);
    expect(server.records[0]).toEqual({ method: 'GET', url: '/lc-items' });
    expect(data.items).toBeDefined();
  });

  it('REFUSES (skips) a route whose URL still carries an unresolved placeholder — never fetches it verbatim', async () => {
    server = await startRecordingServer();
    const config: MinderConfig = {
      apiBaseUrl: server.baseUrl,
      routes: {
        userById: { method: 'GET' as ApiRoute['method'], url: '/users/:id' },
        items: { method: 'GET' as ApiRoute['method'], url: '/items' },
      },
    };

    const data = await prefetchData(config, ['userById', 'items']);

    // Zero requests for the unresolved route — never a literal '/users/:id' on the wire.
    expect(server.records).toHaveLength(1);
    expect(server.records[0]).toEqual({ method: 'GET', url: '/items' });
    expect(data.userById).toBeUndefined();
    expect(data.items).toBeDefined();
  });

  it('never fetches a non-GET route (unchanged pre-existing behavior)', async () => {
    server = await startRecordingServer();
    const config: MinderConfig = {
      apiBaseUrl: server.baseUrl,
      routes: { createItem: { method: 'POST' as ApiRoute['method'], url: '/items' } },
    };

    const data = await prefetchData(config, ['createItem']);

    expect(server.records).toHaveLength(0);
    expect(data.createItem).toBeUndefined();
  });
});
