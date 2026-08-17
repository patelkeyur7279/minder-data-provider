#!/usr/bin/env node
/**
 * Extract a single version's section body from CHANGELOG.md.
 *
 * Usage: node scripts/changelog-section.js <version> [changelogPath]
 *   <version>       exact version string as it appears in "## [<version>]",
 *                    e.g. "2.2.0" or "2.2.0-beta.0"
 *   [changelogPath] optional path override (defaults to ../CHANGELOG.md)
 *
 * Exit codes:
 *   0  section found — body printed to stdout
 *   2  bad arguments (missing version, or changelog file unreadable)
 *   3  no matching section (or the section is empty after trimming)
 *
 * Zero dependencies — Node builtins only.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function main() {
  const args = process.argv.slice(2);
  const version = args[0];
  const changelogPath = args[1] || path.join(__dirname, '..', 'CHANGELOG.md');

  if (!version) {
    console.error('Usage: node scripts/changelog-section.js <version> [changelogPath]');
    process.exit(2);
  }

  let raw;
  try {
    raw = fs.readFileSync(changelogPath, 'utf8');
  } catch (err) {
    console.error(`Cannot read changelog at ${changelogPath}: ${err.message}`);
    process.exit(2);
  }

  const md = raw.replace(/\r\n/g, '\n');

  // Escape the version for literal use inside a RegExp.
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // NOTE: deliberately NOT using the `m` flag. With `m`, the `$` in the
  // trailing lookahead matches end-of-line (the blank line right after the
  // heading), so the lazy group captures nothing and every lookup silently
  // returns "not found". Anchor the start with `(?:^|\n)` instead and leave
  // `$` meaning end-of-string, so the lookahead only fires on the next
  // "## " heading or true end of file.
  const re = new RegExp(
    '(?:^|\\n)## \\[' + esc + '\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)'
  );

  const match = md.match(re);
  const body = match ? match[1].trim() : '';

  if (!body) {
    process.exit(3);
  }

  process.stdout.write(body + '\n');
  process.exit(0);
}

main();
