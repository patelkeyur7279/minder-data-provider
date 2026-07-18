# @minder/provider-supabase

A Minder data provider adapter for [Supabase](https://supabase.com) — Postgres database, auth,
and storage behind a single client.

This is a certification fixture used by `tests/provider-certification.test.ts` and
`scripts/certify-provider.js`. It is intentionally minimal but structurally complete: it exists
to pass every point of the provider certification checklist.

## Setup

1. Install the peer dependency: `npm install @supabase/supabase-js`.
2. Create a Supabase project and copy the project URL and anon key.
3. Register the provider:

   ```ts
   import { createSupabaseProvider } from '@minder/provider-supabase';

   const provider = createSupabaseProvider({
     url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
     anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
     serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY, // server-only
   });
   ```

4. Teardown: call `provider.destroy()` on server shutdown / test teardown to close open
   realtime sockets. No other cleanup is required — the provider holds no on-disk state.

## Credentials

| Key | Client-safe | Where it comes from |
| --- | --- | --- |
| `url` | Yes | Supabase project settings → API → Project URL |
| `anonKey` | Yes | Supabase project settings → API → anon/public key |
| `serviceRoleKey` | **No — server only** | Supabase project settings → API → service_role key |

`serviceRoleKey` bypasses row-level security. It must only ever be read from server-side
environment variables and must never be sent to, or bundled into, client code.

## Security

- **Threat: service-role key leakage.** The service-role key bypasses Row Level Security. This
  provider only reads it from `config.serverOnly` and refuses to attach it to any request
  executed in a browser runtime.
- **Threat: over-broad scopes.** Every scope this provider requests is listed in `manifest.json`
  with a `why`, so a reviewer can see exactly what it can do and reject unjustified scopes.
- **Mitigation: least privilege.** Consumers are encouraged to configure Postgres Row Level
  Security policies rather than relying solely on the anon key's default grants.
