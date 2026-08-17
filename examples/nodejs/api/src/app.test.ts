import crypto from 'crypto';
import request from 'supertest';
import createApp from './app';

const app = createApp();
const SECRET = process.env.NODEJS_WEBHOOK_SECRET ?? 'nodejs-smoke-secret';

function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('GET /health', () => {
  it('reports healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});

describe('POST /api/webhook', () => {
  const body = JSON.stringify({ event: 'ping' });

  it('accepts a validly signed payload (proves minder-data-provider/server on Node)', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .set('content-type', 'application/json')
      .set('x-minder-signature', sign(body))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: true, body: { event: 'ping' } });
  });

  it('rejects a tampered signature', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .set('content-type', 'application/json')
      .set('x-minder-signature', '0'.repeat(64))
      .send(body);

    expect(res.status).toBe(401);
  });

  it('rejects a request with no signature header', async () => {
    const res = await request(app)
      .post('/api/webhook')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
  });
});
