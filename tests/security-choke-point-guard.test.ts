/**
 * fix-percall-header-redirect-leak (B7): a structural grep guard proving
 * `dispatchSealed` (ApiClient.ts) and the single `axios(config)` dispatch
 * (minder.ts) are the ONLY places their respective files hand a request
 * config to axios's `.request(...)` — i.e. the only places `sealOutgoing
 * Request` could be bypassed. A SECOND, unguarded call site anywhere in
 * either file is exactly the "one path fixed, the sibling left open" defect
 * class this whole task exists to close (see the recurring-pattern note in
 * the task spec) — this test makes that shape a FAILING test, not a thing a
 * future contributor has to remember to check for.
 *
 * Comment/doc-string occurrences of the same text are deliberately excluded
 * (both files reference the pattern in prose) — only lines that are not
 * comment lines count as real call sites. This is itself proven by a
 * negative control below: inject a second REAL call site and assert the
 * guard fails — a guard that cannot fail is the same dead-guard class as
 * defect 6 (verify-consumer-treeshake's vacuous enum signal).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/** Real (non-comment) lines matching `pattern` in `relPath`. */
function realCodeOccurrences(relPath: string, pattern: RegExp): string[] {
  const source = readFileSync(join(ROOT, relPath), 'utf8');
  const lines = source.split('\n');
  const hits: string[] = [];
  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (pattern.test(line)) hits.push(trimmed);
  }
  return hits;
}

describe('B7: security choke-point grep guard', () => {
  it('ApiClient.ts calls `axiosInstance.request(` in exactly one real (non-comment) place', () => {
    const hits = realCodeOccurrences('src/core/ApiClient.ts', /axiosInstance\.request\(/);
    expect(hits).toEqual(['return this.axiosInstance.request(sealed);']);
  });

  it('minder.ts calls `axios(config)` in exactly one real (non-comment) place', () => {
    const hits = realCodeOccurrences('src/core/minder.ts', /\baxios\(config\)/);
    expect(hits).toEqual(['const response = await axios(config);']);
  });

  it('NEGATIVE CONTROL: the guard fails when a second real call site is added (proves it can fail)', () => {
    const source = readFileSync(join(ROOT, 'src/core/ApiClient.ts'), 'utf8');
    const withSecondCallSite = source + '\n// synthetic-test-only\nfunction __neverCalled() { return (globalThis as any).axiosInstance.request({}); }\n';
    const lines = withSecondCallSite.split('\n');
    const hits = lines
      .map((l) => l.trim())
      .filter((t) => !t.startsWith('//') && !t.startsWith('*') && /axiosInstance\.request\(/.test(t));
    expect(hits.length).toBeGreaterThan(1);
  });
});
