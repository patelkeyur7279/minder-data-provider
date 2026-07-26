// Astro server endpoint (runs under the @astrojs/node SSR adapter). Relays to
// the mock upstream via minder() so the client-side React island
// (useMinder -> /api/users, see src/components/UsersList.tsx) never needs
// cross-origin access to the mock upstream directly.
import type { APIRoute } from 'astro';
import { minder } from 'minder-data-provider';

export const prerender = false;

const UPSTREAM_BASE_URL = process.env.UPSTREAM_BASE_URL ?? 'http://127.0.0.1:8788';

export const GET: APIRoute = async () => {
  const { data, success, error, status } = await minder<{ id: number; name: string }[]>(
    '/users',
    undefined,
    { baseURL: UPSTREAM_BASE_URL }
  );

  if (!success || error) {
    return new Response(JSON.stringify({ error: error?.message ?? 'upstream request failed' }), {
      status: status || 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
