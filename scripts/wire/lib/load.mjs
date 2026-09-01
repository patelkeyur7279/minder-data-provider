/**
 * Module loading for the wire suite, anchored at the SCRATCH consumer
 * install — never at this repo's own `node_modules/` — so every load
 * happens exactly the way a real consumer's would (FIX_PLAN.md §5,
 * "Consumer isolation is the entire point").
 *
 * `resolveEntry` reads the INSTALLED package's own `package.json` `exports`
 * map at runtime rather than guessing dist file names, so it stays correct
 * for every subpath (`.`, `./web`, `./nextjs`, ...) without duplicating the
 * map here.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A `require()` anchored at the scratch consumer project root. */
export function scratchRequire(scratchDir) {
  return createRequire(pathToFileURL(join(scratchDir, 'package.json')).href);
}

/** CJS `require(specifier)` resolved as the scratch consumer would resolve it. */
export function requireFromScratch(scratchDir, specifier) {
  return scratchRequire(scratchDir)(specifier);
}

/**
 * Reads `minder-data-provider`'s own installed `package.json` and returns
 * the absolute CJS/ESM/types file paths for the given exports subpath
 * (`'.'`, `'./web'`, `'./nextjs'`, ...).
 */
export function resolveEntry(scratchDir, subpath = '.') {
  const req = scratchRequire(scratchDir);
  const pkgJsonPath = req.resolve('minder-data-provider/package.json');
  const pkgRoot = dirname(pkgJsonPath);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const entry = pkg.exports?.[subpath];
  if (!entry) {
    throw new Error(`minder-data-provider's installed package.json has no "exports" entry for '${subpath}'`);
  }
  return {
    cjs: join(pkgRoot, entry.require),
    esm: join(pkgRoot, entry.import),
    types: entry.types ? join(pkgRoot, entry.types) : undefined,
  };
}

/** CJS `require()` of an absolute file path (bypasses package exports resolution). */
export function requireAbs(absPath) {
  const req = createRequire(import.meta.url);
  return req(absPath);
}

/** ESM `import()` of an absolute file path. */
export async function importAbs(absPath) {
  return import(pathToFileURL(absPath).href);
}
