/**
 * Runnable example for the good-provider certification fixture.
 * Referenced by manifest.json's "docs.example" field.
 */
import { createSupabaseProvider } from './src/index';

async function main() {
  const provider = createSupabaseProvider({
    url: 'https://example.supabase.co',
    anonKey: 'public-anon-key',
  });

  const rows = await provider.query('todos');
  console.log(rows);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
