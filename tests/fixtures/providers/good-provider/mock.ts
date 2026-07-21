/**
 * In-memory mock of the Supabase provider for the good-provider certification fixture.
 * Providers ship a mock so consuming apps can write contract tests without live credentials.
 */
export function createMockSupabaseProvider(seed: Record<string, unknown[]> = {}) {
  const tables = new Map<string, unknown[]>(Object.entries(seed));

  return {
    async query(table: string) {
      return tables.get(table) ?? [];
    },
    async insert(table: string, row: unknown) {
      const existing = tables.get(table) ?? [];
      existing.push(row);
      tables.set(table, existing);
      return row;
    },
  };
}
