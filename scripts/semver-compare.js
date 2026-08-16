#!/usr/bin/env node
/**
 * Zero-dependency SemVer comparator (numeric major/minor/patch, with
 * pre-release precedence per semver.org §11).
 *
 * Shared by:
 *   - .github/workflows/release.yml   (previous-tag lookup for the
 *     "Full Changelog" compare link — inline `node -e` step)
 *   - scripts/release-preflight.js    (backward-'latest' guard)
 *
 * String sort (localeCompare / Array.prototype.sort default) is NOT
 * semver-aware:
 *   - it puts 'v2.2.0-beta.0' AFTER 'v2.2.0' (pre-release must sort BEFORE
 *     its own stable release)
 *   - it puts 'v2.9.0' AFTER 'v2.10.0' only by luck of digit width; once
 *     you compare 'v2.9.0' against 'v2.10.0' as plain strings, '2.9' > '2.10'
 *     lexically even though 9 < 10 numerically.
 *
 * This module fixes both by parsing each identifier into numeric fields
 * before comparing.
 */

'use strict';

/**
 * Parses a SemVer-ish string (optionally prefixed with 'v', as in git
 * tags) into its numeric core + pre-release identifiers.
 * Returns null if the string doesn't look like a version at all.
 */
function parseSemver(raw) {
  const m = String(raw).match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    // null = no pre-release (a release version); otherwise the dot-split
    // identifiers, e.g. 'beta.0' -> ['beta', '0'].
    pre: m[4] ? m[4].split('.') : null,
  };
}

/** Compares a single pair of dot-separated pre-release identifiers. */
function comparePreReleaseIdentifiers(a, b) {
  const aIsNum = /^\d+$/.test(a);
  const bIsNum = /^\d+$/.test(b);
  if (aIsNum && bIsNum) return parseInt(a, 10) - parseInt(b, 10);
  // semver §11.4.3: numeric identifiers always have lower precedence than
  // alphanumeric identifiers.
  if (aIsNum && !bIsNum) return -1;
  if (!aIsNum && bIsNum) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Compares two pre-release identifier arrays (or null for "no pre-release").
 * A version WITH a pre-release always sorts BEFORE the same version WITHOUT
 * one (semver §11.3: "a pre-release version has lower precedence than the
 * associated normal version").
 */
function comparePrerelease(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // no pre-release -> higher precedence
  if (b === null) return -1; // has pre-release -> lower precedence
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === undefined) return -1; // fewer fields = lower precedence
    if (b[i] === undefined) return 1;
    const c = comparePreReleaseIdentifiers(a[i], b[i]);
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * Standard comparator: negative if a < b, 0 if equal, positive if a > b.
 * Unparseable inputs sort after everything else (rather than throwing),
 * so a stray non-version tag can't crash a `tags.sort()` call.
 */
function compareSemver(rawA, rawB) {
  const a = parseSemver(rawA);
  const b = parseSemver(rawB);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return comparePrerelease(a.pre, b.pre);
}

module.exports = { compareSemver, parseSemver };
