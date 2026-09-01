/**
 * M4 — `createCorsMiddleware` (exported from `minder-data-provider/server`,
 * server-side middleware, not a client HTTP call). Two real defects:
 *   (a) a string-only `origin === '*'` guard let a trivially-matching RegExp
 *       slip through and reflect any Origin header together with
 *       `Access-Control-Allow-Credentials: true` — must now be REJECTED at
 *       construction time.
 *   (b) `'*'` inside an `origin` ARRAY was never recognised as a wildcard, so
 *       the middleware emitted NO CORS headers at all — must now be treated
 *       as a wildcard.
 *
 * Exercised directly against the real exported factory (loaded from the
 * scratch install) with synthetic req/res objects matching its documented
 * `(req, res) => Promise<void>` signature — no mock of the library itself.
 */
export async function run(ctx) {
  const { scratchDir } = ctx;
  const { requireFromScratch } = ctx.load;
  const results = [];

  const { createCorsMiddleware } = requireFromScratch(scratchDir, 'minder-data-provider/server');

  // --- (a) credentials + a trivially-matching RegExp origin must be rejected ---
  {
    let threw = false;
    let threwMessage = '';
    try {
      createCorsMiddleware({ origin: /.*/, credentials: true });
    } catch (err) {
      threw = true;
      threwMessage = String(err?.message ?? err);
    }
    results.push({
      id: 'm4-cors-credentials-with-wildcard-regex-rejected',
      pass: threw,
      message: threw
        ? `construction threw as expected: ${threwMessage.slice(0, 120)}`
        : 'createCorsMiddleware({ origin: /.*/,  credentials: true }) did NOT throw — a match-all RegExp with credentials must be rejected',
    });
  }

  // --- (b) '*' inside an origin array must be treated as a wildcard (headers ARE emitted) ---
  {
    const middleware = createCorsMiddleware({ origin: ['*'], credentials: false });
    const setHeaders = {};
    const req = { headers: { origin: 'https://consumer.example' }, method: 'GET' };
    const res = {
      setHeader: (name, value) => {
        setHeaders[name] = value;
      },
      end: () => {},
      statusCode: 200,
    };
    await middleware(req, res);
    const allowOrigin = setHeaders['Access-Control-Allow-Origin'];
    const pass = allowOrigin === '*';
    results.push({
      id: 'm4-cors-wildcard-inside-array-treated-as-wildcard',
      pass,
      message: pass
        ? `Access-Control-Allow-Origin: '*' emitted for origin:['*'] as expected`
        : `origin:['*'] emitted headers=${JSON.stringify(setHeaders)} — expected Access-Control-Allow-Origin: '*'`,
    });
  }

  return results;
}
