/**
 * Runnable example for @minder/provider-supabase (referenced by manifest.docs.example).
 *
 * Illustrative only — placeholder values throughout. It shows the three things an
 * app does to adopt the provider:
 *   1. describe the provider in Minder config (public keys inline, the secret via `secret()`),
 *   2. register the provider once at startup,
 *   3. consume it through the capability hooks (`useAuth()`).
 *
 * In a real app you would import from the published package:
 *
 *   import { registerSupabaseProvider } from 'minder-data-provider/providers/supabase';
 *   import { useAuth, secret } from 'minder-data-provider';
 *
 * In-repo, these resolve via relative paths for illustration.
 */
import { registerSupabaseProvider } from './src/index.js';
import type { SupabaseProviderConfig } from './src/index.js';
import { secret } from '../../src/security/secrets.js';
import { useAuth } from '../../src/hooks/contracts.js';

// 1. Config. `url` + `anonKey` are PUBLIC (safe inline). `serviceRoleKey` is a
//    secret referenced by env-var name — its value stays on the server, and a raw
//    string here would hard-fail config validation in the browser.
const supabaseConfig: SupabaseProviderConfig = {
  url: 'https://your-project-ref.supabase.co',
  anonKey: 'your-public-anon-key',
  serviceRoleKey: secret('SUPABASE_SERVICE_ROLE_KEY'),
};

// 2. Register once at app startup. For credential-free UI development, pass
//    `{ ...supabaseConfig, mock: true }` (or set providers.supabase.mock) instead.
export async function startSupabase(): Promise<() => void> {
  return registerSupabaseProvider(supabaseConfig);
}

// 3. Consume it anywhere via the stable capability hooks — no Supabase glue.
export function AuthStatus(): { ready: boolean; userId: string | null } {
  const { ready, session } = useAuth();
  return { ready, userId: session?.userId ?? null };
}
