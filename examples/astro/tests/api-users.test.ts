// Server data path: the /api/users Astro endpoint (src/pages/api/users.ts)
// relays to the mock upstream via minder(). minder() itself is mocked so this
// stays a unit test of the relay's status/error handling, not a network test
// (the ci:smoke script exercises the real network path end-to-end).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { minderMock } = vi.hoisted(() => ({ minderMock: vi.fn() }));

vi.mock('minder-data-provider', () => ({
  minder: minderMock,
}));

const { GET } = await import('../src/pages/api/users');

describe('GET /api/users (server data path)', () => {
  beforeEach(() => {
    minderMock.mockReset();
  });

  it('returns the upstream data as JSON on success', async () => {
    minderMock.mockResolvedValue({
      success: true,
      data: [{ id: 1, name: 'Ada' }],
      error: null,
      status: 200,
    });

    // @ts-expect-error - GET only reads its APIContext lazily; a stub is fine here.
    const response = await GET({});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('returns a 502 error response when the upstream call fails', async () => {
    minderMock.mockResolvedValue({
      success: false,
      data: null,
      error: { message: 'upstream unreachable' },
      status: undefined,
    });

    // @ts-expect-error - GET only reads its APIContext lazily; a stub is fine here.
    const response = await GET({});
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('upstream unreachable');
  });
});
