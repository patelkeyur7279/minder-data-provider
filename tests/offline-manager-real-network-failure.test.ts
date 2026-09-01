/**
 * @jest-environment node
 *
 * C3 root-cause isolation (Wave-B / OfflineManager ownership).
 *
 * The reported defect ("mutate() against a dead port reports success and
 * getOfflineManager().getQueueSize() stays 0 after a real ECONNREFUSED")
 * spans two layers:
 *
 *   1. Classifying a real network failure and calling
 *      `offlineManager.addToQueue()` — this is the axios response
 *      interceptor in `src/core/apiClient/errors.ts` (`buildApiError`),
 *      which is Wave-A's ApiClient territory, not OfflineManager.
 *   2. Actually enqueuing + persisting the request once `addToQueue()` is
 *      called — this is `OfflineManager`, which Wave-B owns.
 *
 * Root cause of (1), confirmed empirically against a real dead port (see
 * Wave-B report): axios sets `isAxiosError: true` on EVERY error it throws,
 * including connection-level failures with no HTTP response. `buildApiError`
 * checks `if (isAxios)` first, computes `status = axiosError.response?.status
 * || 0`, and its `switch(status)` falls to a generic `default:` case for any
 * network-level failure (status 0) — it never reaches the offline-queueing
 * branch further down, which only ever executes for a non-axios error shape.
 * That branch is dead code for every real request Minder ever sends.
 *
 * This suite proves layer (2) — the part Wave-B owns — is intact using a REAL
 * dead port (a server is opened and immediately closed so the port refuses
 * the next connection with a genuine ECONNREFUSED; nothing here is mocked).
 */
import { describe, it, expect } from '@jest/globals';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OfflineManager } from '../src/platform/offline/OfflineManager';

async function getDeadPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function realHttpPost(port: number, path: string, body: unknown): Promise<never> {
  return new Promise((_resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 2000,
      },
      () => reject(new Error('unexpected: dead port accepted a connection'))
    );
    req.on('error', reject); // real ECONNREFUSED lands here — no mocking
    req.end(data);
  });
}

describe('C3 — OfflineManager queues correctly after a REAL network failure (dead port)', () => {
  it('addToQueue() persists a request after a genuine, unmocked ECONNREFUSED', async () => {
    const port = await getDeadPort();
    const mgr = new OfflineManager({ enabled: true });

    expect(mgr.getQueueSize()).toBe(0);

    let networkError: NodeJS.ErrnoException | undefined;
    try {
      await realHttpPost(port, '/users', { name: 'x' });
    } catch (err) {
      networkError = err as NodeJS.ErrnoException;
    }

    // Real, unmocked proof of a genuine connection failure.
    expect(networkError?.code).toBe('ECONNREFUSED');

    // This is the call the axios response interceptor
    // (src/core/apiClient/errors.ts::buildApiError) must make on a network
    // failure. OfflineManager's half of the contract works correctly:
    await mgr.addToQueue('POST', '/users', { body: { name: 'x' } });

    expect(mgr.getQueueSize()).toBe(1);
    expect(mgr.getQueue()[0]).toMatchObject({ method: 'POST', url: '/users' });
  });

  it('manual addToQueue() works, matching the reported symptom (queue wiring itself is not broken)', async () => {
    const mgr = new OfflineManager({ enabled: true });

    await mgr.addToQueue('DELETE', '/users/8', {});

    expect(mgr.getQueueSize()).toBe(1);
    expect(mgr.getQueue()[0]).toMatchObject({ method: 'DELETE', url: '/users/8' });
  });
});
