/**
 * Real `node:http` server that records `{ method, url, headers, rawBody }`
 * for every request it receives, and answers every request with a small
 * canned 200 JSON body. This is the "wire" the wire-level suite watches —
 * drivers assert against `records`, never against a mock.
 *
 * See tests/wire/manifest.json + FIX_PLAN.md §5 ("Mechanism", steps 3-5).
 */
import http from 'node:http';

/**
 * @returns {Promise<{
 *   baseUrl: string,
 *   records: Array<{ method: string, url: string, headers: Record<string, string|string[]|undefined>, rawBody: string }>,
 *   clear: () => void,
 *   close: () => Promise<void>,
 * }>}
 */
export function startRecordingServer() {
  /** @type {Array<{ method: string, url: string, headers: any, rawBody: string }>} */
  const records = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      records.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: { ...req.headers },
        rawBody,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, receivedMethod: req.method, receivedUrl: req.url }));
    });
    req.on('error', () => {
      // Swallow — a client-side abort must not crash the recording server and
      // take the rest of the suite down with it.
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('recording server did not bind to a TCP port'));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        records,
        clear: () => {
          records.length = 0;
        },
        close: () =>
          new Promise((r) => {
            server.close(() => r(undefined));
          }),
      });
    });
  });
}
