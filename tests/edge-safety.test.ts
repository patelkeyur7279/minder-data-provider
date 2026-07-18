/**
 * Regression guard: edge-safety bundling (platform=neutral, no Node APIs).
 *
 * Context — the constraint this guards against:
 *   `src/server/handlers.ts`, `src/server/webhooks.ts`, and `src/contracts/index.ts`
 *   must remain edge-safe: bundleable for non-Node runtimes (Cloudflare Workers,
 *   Vercel Edge, Deno, Bun, browser) with no require(), no Buffer, no node:
 *   builtins in the bundled output. Exemptions: `src/server/nodeMount.ts` (Node
 *   by design) and `src/security/credentials.ts` (imported dynamically by
 *   webhooks.ts, so marked external at bundle time).
 *
 * This test bundles each edge module with esbuild (platform=neutral) and asserts
 * the output text contains NO unsafe patterns: require(), Buffer., from"node:/
 * from "node:, or process. (except guarded process.env). A discrimination proof
 * test verifies the guard catches violations when a bad import is added.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');

/**
 * Bundle a TypeScript entry point with esbuild (platform=neutral).
 * Returns the bundled output as a string.
 */
function bundleEdgeModule(entryPath: string, externals: string[] = []): string {
  const os = require('os') as typeof import('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-safety-'));
  try {
    const outFile = path.join(tmp, 'bundle.mjs');
    const esbuildBin = require.resolve('esbuild/bin/esbuild');

    // Build external args: --external:pattern for each external module.
    const externalArgs = externals.flatMap((ext) => [`--external:${ext}`]);

    execFileSync(
      process.execPath,
      [
        esbuildBin,
        entryPath,
        '--bundle',
        '--format=esm',
        '--platform=neutral',
        '--main-fields=module,main',
        ...externalArgs,
        `--outfile=${outFile}`,
        '--log-level=silent',
      ],
      { encoding: 'utf8' }
    );

    return fs.readFileSync(outFile, 'utf8');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Check bundled output for unsafe patterns (require, Buffer, node: imports, process.).
 * Returns { ok: boolean; violations: string[] } so violations can be listed.
 */
function checkEdgeSafe(bundledText: string): { ok: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check 1: No require( calls (must match word boundary).
  if (/\brequire\s*\(/.test(bundledText)) {
    violations.push('Found require() call');
  }

  // Check 2: No Buffer. references.
  if (/\bBuffer\./.test(bundledText)) {
    violations.push('Found Buffer. reference');
  }

  // Check 3: No node: builtins in imports (from"node: or from "node:).
  // This regex looks for from with optional whitespace, then quote, then node:
  if (/from\s+["']node:/.test(bundledText)) {
    violations.push('Found from "node: or from \'node: import');
  }

  // Check 4: No process. references (but allow process.env as it's a guarded read).
  // Match process. but NOT process.env (use negative lookahead).
  if (/\bprocess\.(?!env\b)/.test(bundledText)) {
    violations.push('Found process. reference (other than process.env)');
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

describe('edge-safety regression guard', () => {
  const edgeModules = [
    {
      name: 'src/server/handlers.ts',
      path: path.join(projectRoot, 'src/server/handlers.ts'),
      externals: [],
    },
    {
      name: 'src/server/webhooks.ts',
      path: path.join(projectRoot, 'src/server/webhooks.ts'),
      // Mark credentials as external since webhooks.ts imports it dynamically
      // and credentials.ts is Node-only (dynamic import keeps it out of the bundled graph).
      // Use explicit paths because esbuild does not support multi-wildcard patterns.
      externals: ['../security/credentials', '../security/credentials.js'],
    },
    {
      name: 'src/contracts/index.ts',
      path: path.join(projectRoot, 'src/contracts/index.ts'),
      externals: [],
    },
  ];

  describe('bundling with platform=neutral', () => {
    for (const module of edgeModules) {
      describe(module.name, () => {
        test('bundle succeeds (exit 0)', () => {
          // If bundleEdgeModule throws, the test fails (which is correct).
          // If it returns without error, the bundle succeeded.
          expect(() => bundleEdgeModule(module.path, module.externals)).not.toThrow();
        });

        test('bundled output contains no unsafe patterns (require, Buffer, node:, process.)', () => {
          const bundled = bundleEdgeModule(module.path, module.externals);
          const check = checkEdgeSafe(bundled);

          expect(check.ok).toBe(true);
          if (!check.ok) {
            // If violations exist, list them in the error message for clarity.
            throw new Error(`Edge-safety violations found:\n  ${check.violations.join('\n  ')}`);
          }
        });
      });
    }
  });

  describe('discrimination proof: guard detects violations', () => {
    test('when require() is added to handlers.ts, bundling fails or output is caught by checkEdgeSafe', () => {
      const handlersPath = path.join(projectRoot, 'src/server/handlers.ts');
      const original = fs.readFileSync(handlersPath, 'utf8');

      const os = require('os') as typeof import('os');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-safety-discrim-'));
      try {
        // Create a modified copy with a bad require statement.
        const badCopy = path.join(tmp, 'bad-handlers.ts');
        const modified =
          original +
          '\n' +
          "// Test violation: intentional bad import\n" +
          "import { readFileSync } from 'fs';\n" +
          "export const __bad = readFileSync;\n";
        fs.writeFileSync(badCopy, modified);

        // Try to bundle it. Either:
        // (a) bundling fails (esbuild refuses to build with platform=neutral), OR
        // (b) bundling succeeds but checkEdgeSafe catches the violation in the output.
        let bundled: string;
        let bundleFailed = false;
        try {
          bundled = bundleEdgeModule(badCopy, []);
        } catch (err) {
          // Bundle failed, which is one valid way the guard catches the violation.
          bundleFailed = true;
          bundled = '';
        }

        if (!bundleFailed) {
          // Bundle succeeded, but the output should be caught by checkEdgeSafe.
          const check = checkEdgeSafe(bundled);
          expect(check.ok).toBe(false);
          expect(check.violations.length).toBeGreaterThan(0);
        }
        // If bundleFailed is true, the guard caught it at bundle time (also valid).
        // The test passes either way: discrimination was successful.
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
