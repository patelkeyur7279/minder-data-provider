#!/usr/bin/env node
/**
 * measure-bundles.mjs — honest per-subpath bundle cost.
 *
 * For every subpath export, bundles the built dist entry the way a consumer's
 * bundler would (entry + transitive shared chunks), minifies, and reports
 * raw / minified / min+gzip sizes. All node_modules stay external, so numbers
 * are the LIBRARY's own cost — peer deps and runtime deps priced separately.
 *
 * Usage:
 *   node scripts/measure-bundles.mjs            # table of all subpaths
 *   node scripts/measure-bundles.mjs --json     # machine-readable output
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const entries = Object.entries(pkg.exports)
  .filter(([sub, target]) => sub !== './package.json' && target?.import)
  .map(([sub, target]) => ({
    subpath: sub === '.' ? '. (main)' : sub.replace('./', ''),
    file: resolve(root, target.import),
  }))
  .filter((e) => existsSync(e.file));

const results = [];
for (const { subpath, file } of entries) {
  const out = await build({
    entryPoints: [file],
    bundle: true,
    minify: true,
    format: 'esm',
    packages: 'external',
    write: false,
    logLevel: 'silent',
  });
  const minified = Buffer.concat(out.outputFiles.map((f) => Buffer.from(f.contents)));
  const raw = await build({
    entryPoints: [file],
    bundle: true,
    minify: false,
    format: 'esm',
    packages: 'external',
    write: false,
    logLevel: 'silent',
  });
  const rawBytes = raw.outputFiles.reduce((n, f) => n + f.contents.length, 0);
  results.push({
    subpath,
    raw: rawBytes,
    min: minified.length,
    gzip: gzipSync(minified, { level: 9 }).length,
  });
}

results.sort((a, b) => b.gzip - a.gzip);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generatedFrom: 'dist', results }, null, 2));
} else {
  const kb = (n) => (n / 1024).toFixed(2).padStart(8) + ' KB';
  console.log('subpath'.padEnd(24) + 'raw'.padStart(11) + 'min'.padStart(11) + 'min+gz'.padStart(11));
  console.log('-'.repeat(57));
  for (const r of results) {
    console.log(r.subpath.padEnd(24) + kb(r.raw) + kb(r.min) + kb(r.gzip));
  }
}
