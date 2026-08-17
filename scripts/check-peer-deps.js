#!/usr/bin/env node

/**
 * Postinstall peer-dependency notice.
 *
 * Runs after `npm install minder-data-provider`. Gently WARNS (never blocks the
 * install) when the consuming project's required peers are missing or below the
 * minimums minder declares, or when multiple React copies are present (a common
 * "hooks broke" cause). Points the developer at `npx minder doctor --fix`.
 *
 * Zero dependencies, no network, no secrets, no telemetry. Minimums are read
 * from minder's OWN package.json peerDependencies (single source of truth).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// The CONSUMING project directory. npm runs a dependency's lifecycle scripts
// with cwd = the dependency's own dir, but exposes the original project dir via
// INIT_CWD — use it so we inspect the user's node_modules, not our own.
function projectDir() {
  return process.env.INIT_CWD || process.cwd();
}

// minder's own package.json (this script lives in <pkg>/scripts/).
function minderPkg() {
  try {
    return require(path.join(__dirname, '..', 'package.json'));
  } catch {
    return null;
  }
}

/** Lowest concrete version in a range, e.g. "^18.0.0 || ^19.0.0" -> "18.0.0". */
function minVersionFromRange(range) {
  const found = String(range).match(/\d+\.\d+\.\d+/g);
  if (!found || found.length === 0) return null;
  return found
    .map((v) => v.split('.').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])[0]
    .join('.');
}

/** installed >= minimum ? true when either is unparseable (don't cry wolf). */
function gte(installed, minimum) {
  const a = String(installed).match(/(\d+)\.(\d+)\.(\d+)/);
  const b = String(minimum).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!a || !b) return true;
  for (let i = 1; i <= 3; i++) {
    if (+a[i] > +b[i]) return true;
    if (+a[i] < +b[i]) return false;
  }
  return true;
}

/** Installed version of a package under a directory's node_modules, or null. */
function installedVersion(dir, pkg) {
  try {
    const pj = path.join(dir, 'node_modules', ...pkg.split('/'), 'package.json');
    if (!fs.existsSync(pj)) return null;
    return JSON.parse(fs.readFileSync(pj, 'utf8')).version || null;
  } catch {
    return null;
  }
}

// The peers that must be present and current for minder to work at all.
const REQUIRED = ['react', 'react-dom', '@tanstack/react-query', '@tanstack/query-core'];

/** Build the list of human-readable warnings (empty = all good). */
function collectWarnings(dir, pkg) {
  const warnings = [];
  const peers = (pkg && pkg.peerDependencies) || {};
  const meta = (pkg && pkg.peerDependenciesMeta) || {};

  for (const name of REQUIRED) {
    if (!peers[name] || (meta[name] && meta[name].optional)) continue;
    const min = minVersionFromRange(peers[name]);
    const have = installedVersion(dir, name);
    if (!have) {
      warnings.push(`${name} is not installed — minder needs >= ${min}. Run: npm install ${name}@^${min}`);
      continue;
    }
    if (min && !gte(have, min)) {
      warnings.push(`${name} ${have} is older than the required ${min}. Run: npm install ${name}@^${min}`);
    }
  }

  // Light duplicate-React check: a second nested React under minder's own
  // node_modules at a different version is the classic invalid-hook-call cause.
  const top = installedVersion(dir, 'react');
  const nested = installedVersion(path.join(dir, 'node_modules', 'minder-data-provider'), 'react');
  if (top && nested && top !== nested) {
    warnings.push(`Multiple React versions detected (${top} and ${nested}) — dedupe React to a single copy.`);
  }

  return warnings;
}

/** Print warnings (never throws). Returns the number of warnings. */
function run(dir, pkg, log) {
  const warnings = collectWarnings(dir, pkg);
  if (warnings.length === 0) return 0; // silent on success — no install noise
  log('\n⚠️  minder-data-provider: peer dependency check');
  for (const w of warnings) log('  • ' + w);
  log('  ↳ Run `npx minder doctor --fix` to resolve.\n');
  return warnings.length;
}

if (require.main === module) {
  try {
    run(projectDir(), minderPkg(), (m) => console.warn(m));
  } catch {
    // Never let a diagnostic crash an install.
  }
  process.exit(0); // Non-blocking by contract.
}

module.exports = { collectWarnings, minVersionFromRange, gte, installedVersion, run, REQUIRED };
