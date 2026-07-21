#!/usr/bin/env node
/**
 * Provider certification script.
 *
 * Checks a provider package directory against the 10-point certification checklist from
 * `docs/product/RISKS_AND_THREAT_MODEL.md` ("Provider certification checklist"), as made
 * concrete in `docs/providers/CERTIFICATION.md`.
 *
 * Usage:
 *   node scripts/certify-provider.js <provider-dir>
 *   npm run certify:provider -- <provider-dir>
 *
 * Zero dependencies by design: this file ships inside the published `minder-data-provider`
 * package (see package.json "files") so third-party provider authors can run it against their
 * own package without installing anything beyond Node itself. That also means it CANNOT
 * `require()` the TypeScript manifest validator in `src/plugins/manifest.ts` (there is no
 * compiled/importable build of it available at provider-authoring time, and adding a TS loader
 * as a runtime dependency of this script would defeat the zero-dep goal). Instead, this script
 * carries its own standalone re-implementation of the manifest schema rules.
 *
 * Keep in sync with src/plugins/manifest.ts:
 *   - PROVIDER_CATEGORIES / PROVIDER_RUNTIMES / PROVIDER_FRAMEWORKS enums
 *   - NAME_PATTERN / SEMVER_PATTERN / RELATIVE_PATH_PATTERN regexes
 *   - the required-field list on ProviderManifest
 * `tests/provider-certification.test.ts` exercises both copies against the same fixtures so
 * drift between them shows up as a test failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Shared rules (hand-synced with src/plugins/manifest.ts — see header comment above)
// ---------------------------------------------------------------------------

const PROVIDER_CATEGORIES = ['auth', 'database', 'storage', 'payments', 'messaging', 'analytics', 'ai', 'other'];
const PROVIDER_RUNTIMES = ['web', 'node', 'edge', 'react-native'];
const PROVIDER_FRAMEWORKS = ['react', 'nextjs', 'vite', 'remix', 'react-native'];

const NAME_PATTERN = /^@[a-z0-9-][a-z0-9-._]*\/[a-z0-9-][a-z0-9-._]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*:\/\/).+$/;

const REQUIRED_MANIFEST_FIELDS = [
  'name',
  'version',
  'displayName',
  'categories',
  'capabilities',
  'config',
  'scopes',
  'runtimes',
  'frameworks',
  'peerDependencies',
  'docs',
];

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs',
  'http', 'https', 'net', 'os', 'path', 'querystring', 'readline', 'stream', 'string_decoder',
  'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'zlib', 'process',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Recursively list files under `dir`, skipping SKIP_DIRS. */
function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walkFiles(path.join(dir, entry.name)));
    } else if (entry.isFile()) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Standalone re-implementation of validateProviderManifest (see src/plugins/manifest.ts).
 * Returns { valid, errors }.
 */
function validateManifest(manifest) {
  const errors = [];

  if (!isPlainObject(manifest)) {
    return { valid: false, errors: ['Manifest must be a plain object.'] };
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest)) {
      errors.push(`Missing required field "${field}".`);
    }
  }

  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    errors.push('"name" is required and must be a non-empty string.');
  } else if (!NAME_PATTERN.test(manifest.name)) {
    errors.push(`"name" must match the scoped package pattern (e.g. "@scope/name"), got "${manifest.name}".`);
  }

  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    errors.push('"version" is required and must be a non-empty string.');
  } else if (!SEMVER_PATTERN.test(manifest.version)) {
    errors.push(`"version" must be a valid semver string, got "${manifest.version}".`);
  }

  if (typeof manifest.displayName !== 'string' || manifest.displayName.trim().length === 0) {
    errors.push('"displayName" is required and must be a non-empty string.');
  }

  if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
    errors.push('"categories" is required and must be a non-empty array.');
  } else {
    for (const c of manifest.categories) {
      if (!PROVIDER_CATEGORIES.includes(c)) {
        errors.push(`"categories" contains invalid value "${c}" (expected one of: ${PROVIDER_CATEGORIES.join(', ')}).`);
      }
    }
  }

  if (!isStringArray(manifest.capabilities)) {
    errors.push('"capabilities" is required and must be an array of strings.');
  }

  if (!isPlainObject(manifest.config)) {
    errors.push('"config" is required and must be an object with "clientSafe" and "serverOnly" arrays.');
  } else {
    if (!isStringArray(manifest.config.clientSafe)) {
      errors.push('"config.clientSafe" is required and must be an array of strings.');
    }
    if (!isStringArray(manifest.config.serverOnly)) {
      errors.push('"config.serverOnly" is required and must be an array of strings.');
    }
    if (isStringArray(manifest.config.clientSafe) && isStringArray(manifest.config.serverOnly)) {
      const overlap = manifest.config.clientSafe.filter((k) => manifest.config.serverOnly.includes(k));
      if (overlap.length > 0) {
        errors.push(`"config.clientSafe" and "config.serverOnly" must be disjoint; overlapping key(s): ${overlap.join(', ')}.`);
      }
    }
  }

  if (!Array.isArray(manifest.scopes)) {
    errors.push('"scopes" is required and must be an array.');
  } else {
    manifest.scopes.forEach((s, i) => {
      if (!isPlainObject(s)) {
        errors.push(`"scopes[${i}]" must be an object with "scope" and "why".`);
        return;
      }
      if (typeof s.scope !== 'string' || s.scope.trim().length === 0) {
        errors.push(`"scopes[${i}].scope" is required and must be a non-empty string.`);
      }
      if (typeof s.why !== 'string' || s.why.trim().length === 0) {
        errors.push(`"scopes[${i}].why" is required and must be a non-empty string.`);
      }
    });
  }

  if (!Array.isArray(manifest.runtimes) || manifest.runtimes.length === 0) {
    errors.push('"runtimes" is required and must be a non-empty array.');
  } else {
    for (const r of manifest.runtimes) {
      if (!PROVIDER_RUNTIMES.includes(r)) {
        errors.push(`"runtimes" contains invalid value "${r}" (expected one of: ${PROVIDER_RUNTIMES.join(', ')}).`);
      }
    }
  }

  if (!Array.isArray(manifest.frameworks)) {
    errors.push('"frameworks" is required and must be an array (may be empty).');
  } else {
    for (const f of manifest.frameworks) {
      if (!PROVIDER_FRAMEWORKS.includes(f)) {
        errors.push(`"frameworks" contains invalid value "${f}" (expected one of: ${PROVIDER_FRAMEWORKS.join(', ')}).`);
      }
    }
  }

  if (!isPlainObject(manifest.peerDependencies)) {
    errors.push('"peerDependencies" is required and must be an object mapping package name -> semver range.');
  }

  if (!isPlainObject(manifest.docs)) {
    errors.push('"docs" is required and must be an object with "setup", "example", and "security".');
  } else {
    for (const key of ['setup', 'example', 'security']) {
      const val = manifest.docs[key];
      if (typeof val !== 'string' || val.length === 0) {
        errors.push(`"docs.${key}" is required and must be a non-empty relative path string.`);
      } else if (!RELATIVE_PATH_PATTERN.test(val)) {
        errors.push(`"docs.${key}" must be a relative path (no leading "/", no "://"), got "${val}".`);
      }
    }
  }

  if (manifest.license !== undefined && (typeof manifest.license !== 'string' || manifest.license.trim().length === 0)) {
    errors.push('"license", if present, must be a non-empty string.');
  }

  return { valid: errors.length === 0, errors };
}

/** Extract bare (non-relative, non-builtin) import specifiers referenced under `srcDir`. */
function findSdkImports(srcDir) {
  const files = walkFiles(srcDir).filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
  const found = new Set();
  const importRe = /(?:import\s+(?:[^'"]+\s+from\s+)?|export\s+(?:[^'"]+\s+from\s+)?|require\()\s*['"]([^'"]+)['"]/g;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let match;
    while ((match = importRe.exec(content)) !== null) {
      const spec = match[1];
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      const parts = spec.split('/');
      const pkgName = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (NODE_BUILTINS.has(pkgName)) continue;
      found.add(pkgName);
    }
  }
  return Array.from(found).sort();
}

function findFilesMatching(dir, regex) {
  return walkFiles(dir).filter((f) => regex.test(path.basename(f)));
}

// ---------------------------------------------------------------------------
// The 10 certification checks
// ---------------------------------------------------------------------------

function runChecks(providerDir) {
  const results = [];
  const manifestPath = path.join(providerDir, 'manifest.json');

  let manifest = null;
  let manifestParseError = null;
  let manifestValidation = { valid: false, errors: ['manifest.json not found.'] };

  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestValidation = validateManifest(manifest);
    } catch (err) {
      manifestParseError = err.message;
      manifestValidation = { valid: false, errors: [`manifest.json is not valid JSON: ${err.message}`] };
    }
  }

  // 1. manifest.json exists + validates
  results.push({
    id: 1,
    key: 'manifest',
    title: 'manifest.json exists and validates against the provider manifest schema',
    pass: manifestValidation.valid,
    details: manifestParseError ? [manifestParseError] : manifestValidation.errors,
  });

  // 2. README.md exists with required sections
  const readmePath = path.join(providerDir, 'README.md');
  const requiredSections = ['Setup', 'Security', 'Credentials'];
  let readmeDetails = [];
  let readmePass = false;
  if (!fs.existsSync(readmePath)) {
    readmeDetails.push('README.md not found.');
  } else {
    const content = fs.readFileSync(readmePath, 'utf8');
    const missing = requiredSections.filter((s) => !new RegExp(`^##\\s+${s}\\s*$`, 'mi').test(content));
    if (missing.length > 0) {
      readmeDetails = missing.map((s) => `Missing required section "## ${s}".`);
    } else {
      readmePass = true;
    }
  }
  results.push({
    id: 2,
    key: 'readme',
    title: 'README.md exists with required sections (## Setup, ## Security, ## Credentials)',
    pass: readmePass,
    details: readmeDetails,
  });

  // 3. config.clientSafe / config.serverOnly disjoint
  let configPass = false;
  const configDetails = [];
  if (!manifest || !isPlainObject(manifest.config)) {
    configDetails.push('manifest.config is missing or not an object.');
  } else {
    const clientSafe = manifest.config.clientSafe;
    const serverOnly = manifest.config.serverOnly;
    if (!isStringArray(clientSafe) || !isStringArray(serverOnly)) {
      configDetails.push('manifest.config.clientSafe / serverOnly must both be arrays of strings.');
    } else {
      const overlap = clientSafe.filter((k) => serverOnly.includes(k));
      if (overlap.length > 0) {
        configDetails.push(`clientSafe and serverOnly overlap on: ${overlap.join(', ')}.`);
      } else {
        configPass = true;
      }
    }
  }
  results.push({
    id: 3,
    key: 'config-disjoint',
    title: 'config.clientSafe and config.serverOnly are disjoint sets',
    pass: configPass,
    details: configDetails,
  });

  // 4. example file exists at manifest.docs.example path
  let examplePass = false;
  const exampleDetails = [];
  if (!manifest || !isPlainObject(manifest.docs) || typeof manifest.docs.example !== 'string') {
    exampleDetails.push('manifest.docs.example is missing or not a string.');
  } else {
    const examplePath = path.join(providerDir, manifest.docs.example);
    if (!fs.existsSync(examplePath)) {
      exampleDetails.push(`Example file not found at "${manifest.docs.example}".`);
    } else {
      examplePass = true;
    }
  }
  results.push({
    id: 4,
    key: 'example-file',
    title: 'Example file exists at manifest.docs.example',
    pass: examplePass,
    details: exampleDetails,
  });

  // 5. mock file exists (mock.ts/mock.js)
  const mockFiles = findFilesMatching(providerDir, /^mock\.(ts|js|tsx|jsx)$/i);
  results.push({
    id: 5,
    key: 'mock-file',
    title: 'A mock file exists (mock.ts / mock.js)',
    pass: mockFiles.length > 0,
    details: mockFiles.length > 0 ? [] : ['No file named mock.ts / mock.js found in the provider directory.'],
  });

  // 6. LICENSE or license field
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].find((f) => fs.existsSync(path.join(providerDir, f)));
  const hasLicenseField = !!(manifest && typeof manifest.license === 'string' && manifest.license.trim().length > 0);
  results.push({
    id: 6,
    key: 'license',
    title: 'A LICENSE file or manifest "license" field is present',
    pass: !!licenseFile || hasLicenseField,
    details: licenseFile || hasLicenseField ? [] : ['No LICENSE file and no manifest.license field.'],
  });

  // 7. scopes all have `why`
  let scopesPass = false;
  const scopesDetails = [];
  if (!manifest || !Array.isArray(manifest.scopes)) {
    scopesDetails.push('manifest.scopes is missing or not an array.');
  } else if (manifest.scopes.length === 0) {
    scopesPass = true; // no scopes requested is valid (nothing to justify)
  } else {
    const missingWhy = manifest.scopes.filter(
      (s) => !isPlainObject(s) || typeof s.why !== 'string' || s.why.trim().length === 0
    );
    if (missingWhy.length > 0) {
      scopesDetails.push(
        `${missingWhy.length} scope(s) missing a non-empty "why": ${missingWhy
          .map((s) => (isPlainObject(s) && typeof s.scope === 'string' ? s.scope : '<unknown>'))
          .join(', ')}.`
      );
    } else {
      scopesPass = true;
    }
  }
  results.push({
    id: 7,
    key: 'scopes-why',
    title: 'Every scope in manifest.scopes has a non-empty "why"',
    pass: scopesPass,
    details: scopesDetails,
  });

  // 8. runtimes non-empty
  const runtimesValid = !!(manifest && Array.isArray(manifest.runtimes) && manifest.runtimes.length > 0);
  results.push({
    id: 8,
    key: 'runtimes',
    title: 'manifest.runtimes declares at least one runtime',
    pass: runtimesValid,
    details: runtimesValid ? [] : ['manifest.runtimes is missing, not an array, or empty.'],
  });

  // 9. peerDependencies declared for every SDK import found in src
  const srcDir = path.join(providerDir, 'src');
  let peerDepsPass = true;
  const peerDepsDetails = [];
  if (fs.existsSync(srcDir)) {
    const imports = findSdkImports(srcDir);
    const declared = manifest && isPlainObject(manifest.peerDependencies) ? Object.keys(manifest.peerDependencies) : [];
    const undeclared = imports.filter((pkg) => !declared.includes(pkg));
    if (undeclared.length > 0) {
      peerDepsPass = false;
      peerDepsDetails.push(`Imported but not declared in peerDependencies: ${undeclared.join(', ')}.`);
    }
  }
  results.push({
    id: 9,
    key: 'peer-deps',
    title: 'peerDependencies declared for every SDK import found in src/ (best-effort)',
    pass: peerDepsPass,
    details: peerDepsDetails,
  });

  // 10. a test file exists
  const testFiles = walkFiles(providerDir).filter(
    (f) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(f) || /(^|[/\\])__tests__[/\\]/.test(f)
  );
  results.push({
    id: 10,
    key: 'test-file',
    title: 'A test file exists (*.test.ts(x)/*.spec.ts(x) or __tests__/)',
    pass: testFiles.length > 0,
    details: testFiles.length > 0 ? [] : ['No test file found in the provider directory.'],
  });

  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printReport(providerDir, results) {
  const name = path.basename(path.resolve(providerDir));
  console.log(`\nProvider certification: ${name}\n`);

  for (const r of results) {
    const mark = r.pass ? '✅' : '❌';
    console.log(` ${String(r.id).padStart(2)}. ${mark} ${r.title}`);
    for (const d of r.details) {
      console.log(`       - ${d}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nResult: ${passed}/${results.length} checks passed.\n`);
}

function main() {
  const providerDir = process.argv[2];
  if (!providerDir) {
    console.error('Usage: node scripts/certify-provider.js <provider-dir>');
    process.exit(2);
  }
  const resolved = path.resolve(providerDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.error(`Provider directory not found: ${resolved}`);
    process.exit(2);
  }

  const results = runChecks(resolved);
  printReport(resolved, results);

  const allPassed = results.every((r) => r.pass);
  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  runChecks,
  validateManifest,
  findSdkImports,
  PROVIDER_CATEGORIES,
  PROVIDER_RUNTIMES,
  PROVIDER_FRAMEWORKS,
  NAME_PATTERN,
  SEMVER_PATTERN,
  RELATIVE_PATH_PATTERN,
};
