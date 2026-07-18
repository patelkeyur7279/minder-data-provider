/**
 * Minimal provider implementation for the good-provider certification fixture.
 * Imports its declared peer dependency so scripts/certify-provider.js's SDK-import check
 * (point 9) has something real to grep for and match against manifest.peerDependencies.
 */
import { createClient } from '@supabase/supabase-js';

export interface SupabaseProviderConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export function createSupabaseProvider(config: SupabaseProviderConfig) {
  const client = createClient(config.url, config.anonKey);

  return {
    async query(table: string) {
      const { data, error } = await client.from(table).select('*');
      if (error) throw error;
      return data;
    },
  };
}
