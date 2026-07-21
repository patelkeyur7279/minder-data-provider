/**
 * R-03 (Next.js App Router / RSC safety): every source module that calls a
 * React hook or defines a React class component is client-only and MUST begin
 * with the "use client" directive, so it declares a correct server/client
 * boundary for the App Router.
 *
 * Caveat this does NOT cover: the tsup build (`splitting: true`) does not yet
 * reliably preserve these directives as valid top-of-chunk prologues in dist —
 * see docs/NEXTJS_APP_ROUTER.md and the backlog follow-up. This guard protects
 * the SOURCE intent, which is the prerequisite for that build fix.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const srcRoot = path.resolve(__dirname, '../src');

const HOOK_CALL =
  /\b(useState|useEffect|useContext|useReducer|useLayoutEffect|useCallback|useMemo|useImperativeHandle|useInsertionEffect)\s*\(/;
const CLASS_COMPONENT = /extends\s+(React\.)?(Component|PureComponent)\b|componentDidCatch\s*\(/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

describe('R-03: client modules declare "use client"', () => {
  it('every module calling a React hook or extending Component starts with "use client"', () => {
    const violations: string[] = [];
    for (const file of walk(srcRoot)) {
      const src = fs.readFileSync(file, 'utf8');
      const isClient = HOOK_CALL.test(src) || CLASS_COMPONENT.test(src);
      if (!isClient) continue;
      const firstLine = src.split('\n', 1)[0].trim();
      if (firstLine !== '"use client";' && firstLine !== "'use client';") {
        violations.push(path.relative(srcRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });
});
