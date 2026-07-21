/**
 * Wave J (error DX): every docs link a Minder error points a developer to must
 * resolve to a real file. A 404 in an error message is the worst DX — the
 * error IS the documentation for a low-experience developer.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..');
const errorSource = fs.readFileSync(
  path.join(repoRoot, 'src/errors/MinderError.ts'),
  'utf8'
);

describe('MinderError docs links', () => {
  it('every referenced docs/*.md file exists (no dead links in errors)', () => {
    const matches = [...errorSource.matchAll(/docs\/[A-Za-z0-9_./-]+\.md/g)].map((m) => m[0]);
    expect(matches.length).toBeGreaterThan(0); // sanity: the audit is actually scanning links
    const dead = [...new Set(matches)].filter(
      (rel) => !fs.existsSync(path.join(repoRoot, rel))
    );
    expect(dead).toEqual([]);
  });
});
