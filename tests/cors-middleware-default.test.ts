/**
 * The default CORS middleware must never ship the wildcard-origin +
 * credentials combination (the same rule CorsManager.validateConfig enforces).
 */
import corsMiddleware, { createCorsMiddleware } from '../src/core/corsMiddleware';
import { EventEmitter } from 'events';

// Minimal req/res doubles for the `cors` package.
const makeReqRes = (origin = 'https://evil.example') => {
  const req: any = { method: 'GET', headers: { origin } };
  const res: any = new EventEmitter();
  res.headers = {} as Record<string, string>;
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v; };
  res.getHeader = (k: string) => res.headers[k.toLowerCase()];
  res.statusCode = 200;
  res.end = () => undefined;
  return { req, res };
};

describe('corsMiddleware safe default', () => {
  it('default middleware does NOT send Access-Control-Allow-Credentials', async () => {
    const { req, res } = makeReqRes();
    await corsMiddleware(req, res);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('createCorsMiddleware throws on credentials + wildcard origin', () => {
    expect(() => createCorsMiddleware({ origin: '*', credentials: true }))
      .toThrow(/credentials.*wildcard|wildcard.*credentials/i);
  });

  it('createCorsMiddleware allows credentials with an explicit origin allowlist', async () => {
    const mw = createCorsMiddleware({
      origin: ['https://app.example.com'],
      credentials: true,
    });
    const { req, res } = makeReqRes('https://app.example.com');
    await mw(req, res);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });
});
