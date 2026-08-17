/**
 * Placeholder test file for the good-provider certification fixture.
 *
 * This file exists so scripts/certify-provider.js's "test file exists" check (point 10) has
 * something real to find. Its filename also matches Jest's default testMatch, so it doubles
 * as a real (trivial, harmless) test when the full suite runs.
 */
import { createMockSupabaseProvider } from './mock';

describe('good-provider fixture mock', () => {
  it('stores and returns inserted rows', async () => {
    const provider = createMockSupabaseProvider();
    await provider.insert('todos', { id: 1, title: 'write docs' });
    const rows = await provider.query('todos');
    expect(rows).toEqual([{ id: 1, title: 'write docs' }]);
  });
});
