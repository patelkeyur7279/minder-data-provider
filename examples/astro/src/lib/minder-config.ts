// Shared MinderConfig for the client-side React island. The island calls this
// app's own `/api/users` Astro server endpoint (same origin, no CORS), which
// itself relays to the mock upstream via `minder()` server-side — same
// pattern as examples/nextjs-app-router/app/providers.tsx.
import { HttpMethod } from 'minder-data-provider';
import type { MinderConfig } from 'minder-data-provider';

export const minderConfig: MinderConfig = {
  apiBaseUrl: '',
  routes: {
    users: {
      method: HttpMethod.GET,
      url: '/api/users',
    },
  },
};

export interface User {
  id: number;
  name: string;
}
