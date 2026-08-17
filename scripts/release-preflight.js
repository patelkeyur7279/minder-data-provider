#!/usr/bin/env node
/**
 * Release preflight / postflight checks for minder-data-provider.
 *
 * This script NEVER performs a release action itself — it only reads git,
 * npm (anonymous registry reads), and the filesystem, then prints what the
 * human should run next. Publishing, tagging, and pushing stay entirely in
 * the owner's hands, on the owner's machine, with the owner's credentials.
 *
 * Usage:
 *   node scripts/release-preflight.js                    preflight (default)
 *   node scripts/release-preflight.js --branch <name>     override expected branch (default: main)
 *   node scripts/release-preflight.js --allow-existing-tag  don't fail if v<version> already exists
 *   node scripts/release-preflight.js --allow-published     don't fail if the version is already
 *                                                             published (recovery: publish
 *                                                             succeeded, tagging did not)
 *   node scripts/release-preflight.js --verify [<version>]  postflight checks (default: pkg.version)
 *   node scripts/release-preflight.js --verify --full       postflight + slow cold-install smoke test
 *
 * npm aliases (package.json):
 *   npm run release:preflight   -> node scripts/release-preflight.js
 *   npm run release:verify      -> node scripts/release-preflight.js --verify
 *
 * Zero dependencies — Node builtins only (fs, path, child_process, os).
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compareSemver } = require('./semver-compare.js');

const ROOT = path.join(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const CHANGELOG_SCRIPT = path.join(__dirname, 'changelog-section.js');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?(\+[0-9A-Za-z-.]+)?$/;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function tryRun(cmd, args, opts) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    const stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr ? err.stderr.toString('utf8') : '';
    return { ok: false, out: '', status: err.status, message: err.message, stderr };
  }
}

// `npm view` exits non-zero both when the registry is unreachable (offline)
// and when it was reached but the package/version genuinely doesn't exist.
// Those two failures must never be reported the same way: only the second
// one is safe to treat as "confirmed not published". This inspects the
// captured stderr to tell them apart.
function npmViewSaysNotFound(res) {
  const text = `${res.stderr || ''}\n${res.message || ''}`;
  return /\bE404\b/.test(text) || /404\s+Not Found/i.test(text) || /is not in (?:the|this) (?:npm )?registry/i.test(text);
}

function pass(id, message) {
  return { id, level: 'PASS', message };
}
function fail(id, message) {
  return { id, level: 'FAIL', message };
}
function warn(id, message) {
  return { id, level: 'WARN', message };
}
function info(id, message) {
  return { id, level: 'INFO', message };
}

function printResults(results) {
  const label = { PASS: '[ OK ]', WARN: '[WARN]', FAIL: '[FAIL]', INFO: '[INFO]' };
  for (const r of results) {
    console.log(`${label[r.level]} ${r.id}  ${r.message}`);
  }
}

function preId(version) {
  // "2.2.0-beta.0" -> "beta"
  const rest = version.split('-').slice(1).join('-');
  return rest.split('.')[0];
}

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    branch: 'main',
    allowExistingTag: false,
    allowPublished: false,
    verify: false,
    verifyVersion: null,
    full: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branch') {
      opts.branch = argv[++i];
    } else if (a === '--allow-existing-tag') {
      opts.allowExistingTag = true;
    } else if (a === '--allow-published') {
      opts.allowPublished = true;
    } else if (a === '--verify') {
      opts.verify = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        opts.verifyVersion = argv[++i];
      }
    } else if (a === '--full') {
      opts.full = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`release-preflight — read-only checks, never publishes/tags/pushes

  node scripts/release-preflight.js                       preflight (default)
  node scripts/release-preflight.js --branch <name>        expected branch (default: main)
  node scripts/release-preflight.js --allow-existing-tag    don't fail if v<version> exists
  node scripts/release-preflight.js --allow-published       don't fail if the version is already
                                                              on npm (recovery: publish succeeded,
                                                              tagging did not)
  node scripts/release-preflight.js --verify [<version>]    postflight checks
  node scripts/release-preflight.js --verify --full         + slow cold-install smoke test
`);
}

// ---------------------------------------------------------------------------
// changelog helpers (shells out to the shared extractor script)
// ---------------------------------------------------------------------------

function changelogHasSection(version) {
  const res = tryRun(process.execPath, [CHANGELOG_SCRIPT, version]);
  return res.ok;
}

function topmostChangelogVersion() {
  const raw = fs.readFileSync(CHANGELOG_PATH, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^## \[([^\]]+)\]/m);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// preflight (P1-P11)
// ---------------------------------------------------------------------------

function preflight(opts) {
  const results = [];
  const pkg = readPkg();
  const version = pkg.version;
  const pkgName = pkg.name;

  // P1 - current branch
  const branchRes = tryRun('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.ok ? branchRes.out : null;
  if (!branchRes.ok) {
    results.push(fail('P1', 'could not determine the current git branch.'));
  } else if (branch !== opts.branch) {
    results.push(
      fail('P1', `current branch is '${branch}', expected '${opts.branch}' (override with --branch <name>).`)
    );
  } else {
    results.push(pass('P1', `current branch is '${branch}'.`));
  }

  // P2 - working tree clean
  const statusRes = tryRun('git', ['status', '--porcelain']);
  if (!statusRes.ok) {
    results.push(fail('P2', 'could not run git status.'));
  } else if (statusRes.out !== '') {
    results.push(fail('P2', 'working tree is not clean (git status --porcelain is non-empty).'));
  } else {
    results.push(pass('P2', 'working tree is clean.'));
  }

  // P3 - fetch tags (warn only if offline)
  const fetchRes = tryRun('git', ['fetch', '--tags', 'origin']);
  if (!fetchRes.ok) {
    results.push(warn('P3', 'git fetch --tags origin failed — offline? Tag/HEAD checks below may be stale.'));
  } else {
    results.push(pass('P3', 'fetched refs and tags from origin.'));
  }

  // P4 - HEAD == origin/<branch>
  const headRes = tryRun('git', ['rev-parse', 'HEAD']);
  const remoteRes = tryRun('git', ['rev-parse', `refs/remotes/origin/${opts.branch}`]);
  if (!headRes.ok || !remoteRes.ok) {
    results.push(fail('P4', `could not resolve HEAD and/or origin/${opts.branch} for comparison.`));
  } else if (headRes.out !== remoteRes.out) {
    results.push(
      fail(
        'P4',
        `HEAD (${headRes.out.slice(0, 7)}) does not match origin/${opts.branch} (${remoteRes.out.slice(
          0,
          7
        )}) — not up to date (behind, ahead, or diverged).`
      )
    );
  } else {
    results.push(pass('P4', `HEAD matches origin/${opts.branch}.`));
  }

  // P5 - valid SemVer
  if (!SEMVER_RE.test(version)) {
    results.push(fail('P5', `package.json version '${version}' is not valid SemVer.`));
  } else {
    results.push(pass('P5', `version '${version}' is valid SemVer.`));
  }

  // P6 - CHANGELOG has the section
  const hasSection = changelogHasSection(version);
  if (!hasSection) {
    results.push(fail('P6', `CHANGELOG.md has no '## [${version}]' section.`));
  } else {
    results.push(pass('P6', `CHANGELOG.md has a '## [${version}]' section.`));
  }

  // P7 - topmost section matches pkg.version
  const topVersion = topmostChangelogVersion();
  if (!hasSection) {
    results.push(fail('P7', 'skipped — no matching section to compare (see P6).'));
  } else if (topVersion !== version) {
    results.push(
      fail('P7', `topmost CHANGELOG.md section is '${topVersion}', but package.json is '${version}'.`)
    );
  } else {
    results.push(pass('P7', 'topmost CHANGELOG.md section matches package.json version.'));
  }

  // P8 - tag v<version> absent locally and on origin
  const localTag = tryRun('git', ['rev-parse', '--verify', '--quiet', `refs/tags/v${version}`]);
  const localExists = localTag.ok && localTag.out !== '';
  const remoteTag = tryRun('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/v${version}`]);
  const remoteExists = remoteTag.ok; // --exit-code -> 0 only when a match was found
  if ((localExists || remoteExists) && !opts.allowExistingTag) {
    const where = [localExists ? 'locally' : null, remoteExists ? 'on origin' : null].filter(Boolean).join(' and ');
    results.push(fail('P8', `tag v${version} already exists ${where} (override with --allow-existing-tag).`));
  } else if (localExists || remoteExists) {
    results.push(warn('P8', `tag v${version} already exists, but --allow-existing-tag was passed.`));
  } else {
    results.push(pass('P8', `tag v${version} does not exist locally or on origin.`));
  }

  // P9 - not already published
  const npmViewRes = tryRun('npm', ['view', `${pkgName}@${version}`, 'version']);
  if (npmViewRes.ok) {
    const published = npmViewRes.out !== '';
    if (published && !opts.allowPublished) {
      results.push(
        fail(
          'P9',
          `${pkgName}@${version} is already published on npm (override with --allow-published if you are recovering from a partial publish — publish succeeded, tagging did not).`
        )
      );
    } else if (published) {
      results.push(warn('P9', `${pkgName}@${version} is already published on npm, but --allow-published was passed.`));
    } else {
      results.push(pass('P9', `${pkgName}@${version} is not yet on npm.`));
    }
  } else if (npmViewSaysNotFound(npmViewRes)) {
    // Registry was reached and it affirmatively said "no such version" —
    // safe to treat as "not published".
    results.push(pass('P9', `${pkgName}@${version} is not yet on npm (registry confirmed: no such version).`));
  } else {
    // Could NOT reach the registry at all (offline, DNS, timeout, ...).
    // This must NOT be reported as "not published" — that would be failing
    // open on a check that can't actually confirm anything.
    results.push(
      warn(
        'P9',
        `could not reach the npm registry to check whether ${pkgName}@${version} is already published (offline?) — this is NOT a confirmation that it is unpublished. Re-run when online before trusting this result.`
      )
    );
  }

  // P12 - stable version must not move npm dist-tag 'latest' backward.
  // `npm publish` sets 'latest' unconditionally for a non-pre-release
  // version, so publishing an old stable version after a newer one is live
  // would silently move every consumer's 'latest' backward.
  if (version.includes('-')) {
    results.push(
      info(
        'P12',
        `'${version}' is a pre-release — the backward-'latest' check only applies to stable versions (see P10 for the pre-release dist-tag requirement).`
      )
    );
  } else {
    const latestRes = tryRun('npm', ['view', pkgName, 'dist-tags.latest']);
    if (latestRes.ok && latestRes.out) {
      const currentLatest = latestRes.out;
      const cmp = compareSemver(version, currentLatest);
      if (cmp < 0) {
        results.push(
          fail(
            'P12',
            `publishing ${version} would move npm dist-tag 'latest' BACKWARD from ${currentLatest} — 'npm publish' sets 'latest' unconditionally for stable versions.`
          )
        );
      } else {
        results.push(pass('P12', `${version} is >= current npm 'latest' (${currentLatest}) — publishing will not move 'latest' backward.`));
      }
    } else if (latestRes.ok) {
      results.push(pass('P12', `${pkgName} has no npm dist-tag 'latest' yet (first publish) — nothing to compare.`));
    } else if (npmViewSaysNotFound(latestRes)) {
      results.push(pass('P12', `${pkgName} is not on npm yet (first publish) — nothing to compare.`));
    } else {
      results.push(
        warn('P12', `could not reach the npm registry to read dist-tags.latest for ${pkgName} (offline?) — backward-'latest' check skipped, not confirmed safe.`)
      );
    }
  }

  // P10 - pre-release reminder (warn only)
  if (version.includes('-')) {
    results.push(
      warn(
        'P10',
        `'${version}' is a pre-release — publish with the pre-release dist-tag flag (never a bare publish, or it becomes 'latest'). See RELEASING.md.`
      )
    );
  } else {
    results.push(pass('P10', 'stable version — a bare publish is the correct command.'));
  }

  // P11 - dist/ freshness (info only, prepublishOnly rebuilds anyway)
  const distIndex = path.join(ROOT, 'dist', 'index.js');
  if (!fs.existsSync(distIndex)) {
    results.push(info('P11', 'dist/ has not been built yet — prepublishOnly rebuilds it automatically.'));
  } else {
    const distStat = fs.statSync(distIndex);
    const pkgStat = fs.statSync(PKG_PATH);
    if (distStat.mtimeMs < pkgStat.mtimeMs) {
      results.push(info('P11', 'dist/ predates package.json — prepublishOnly rebuilds it automatically.'));
    } else {
      results.push(info('P11', 'dist/ is present.'));
    }
  }

  return { pkg, version, results };
}

// ---------------------------------------------------------------------------
// next-steps printout — plain, readable command strings. This script only
// ever prints these commands; it never executes any of them (grep the
// function body — there is no execFileSync/execSync/spawn call anywhere
// near this code). The real invariant is that no CI-executed path in this
// repo can publish and no credential is referenced anywhere; that is
// verified by reading execution paths, not by grepping for particular
// substrings like "npm" or "publish".
// ---------------------------------------------------------------------------

function printNextSteps(version) {
  const isPre = version.includes('-');
  const publishCmd = isPre ? `npm publish --tag ${preId(version)}` : 'npm publish';
  const tagCmd = `git tag -a v${version} -m "Release v${version}"`;
  const pushCmd = `git push origin v${version}`;
  const verifyCmd = 'npm run release:verify';

  console.log('');
  console.log('Preflight PASSED. Next steps — run these yourself; this script never runs them:');
  console.log('');
  console.log(`  1. ${publishCmd}`);
  if (isPre) {
    console.log('     (pre-release — the dist-tag flag above is mandatory, or this becomes "latest")');
  }
  console.log(`  2. ${tagCmd}`);
  console.log(`  3. ${pushCmd}`);
  console.log(`  4. ${verifyCmd}`);
  console.log('     (run this AFTER the push above — its tag-on-origin and `gh release view`');
  console.log('      checks can only pass once the tag exists remotely)');
  console.log('');
  console.log('See RELEASING.md for the full sequence, failure handling, and recovery paths.');
}

// ---------------------------------------------------------------------------
// verify / postflight (implements §3.4 assertions 1, 2, 4, 5; 3 with --full)
// ---------------------------------------------------------------------------

function verify(version, pkgName, opts) {
  const results = [];

  // Assertion 1: npm view <pkg>@<v> version == <v>
  const viewVersion = tryRun('npm', ['view', `${pkgName}@${version}`, 'version']);
  if (viewVersion.ok && viewVersion.out === version) {
    results.push(pass('V1', `npm view ${pkgName}@${version} version == ${version}.`));
  } else {
    results.push(
      fail('V1', `npm view ${pkgName}@${version} version returned '${viewVersion.out || '<empty>'}', expected '${version}'.`)
    );
  }

  // Assertion 2: dist-tags — stable: latest == v; pre-release: pre-tag == v AND latest unchanged
  const distTagsRes = tryRun('npm', ['view', pkgName, 'dist-tags', '--json']);
  if (distTagsRes.ok) {
    let tags = {};
    try {
      tags = JSON.parse(distTagsRes.out);
    } catch {
      tags = {};
    }
    if (version.includes('-')) {
      const pre = preId(version);
      if (tags[pre] === version) {
        results.push(pass('V2', `dist-tag '${pre}' == ${version}.`));
      } else {
        results.push(fail('V2', `dist-tag '${pre}' is '${tags[pre]}', expected '${version}'.`));
      }
      results.push(
        info(
          'V2b',
          `dist-tag 'latest' is currently '${tags.latest}' — confirm this did NOT change (a pre-release must never move 'latest'; a changed value here usually means the dist-tag flag was forgotten).`
        )
      );
    } else if (tags.latest === version) {
      results.push(pass('V2', `dist-tag 'latest' == ${version}.`));
    } else {
      results.push(fail('V2', `dist-tag 'latest' is '${tags.latest}', expected '${version}'.`));
    }
  } else {
    results.push(fail('V2', 'npm view dist-tags failed.'));
  }

  // Assertion 4: tag v<version> present on origin
  const remoteTag = tryRun('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${version}`]);
  if (remoteTag.ok && remoteTag.out.includes(`refs/tags/v${version}`)) {
    results.push(pass('V4', `tag v${version} is present on origin.`));
  } else {
    results.push(fail('V4', `tag v${version} was not found on origin.`));
  }

  // Assertion 5: gh release view — correct prerelease flag, body not the stub
  const ghRes = tryRun('gh', ['release', 'view', `v${version}`, '--json', 'isPrerelease,body']);
  if (!ghRes.ok) {
    results.push(fail('V5', `gh release view v${version} failed — the Release may not exist yet.`));
  } else {
    let data = {};
    try {
      data = JSON.parse(ghRes.out);
    } catch {
      data = {};
    }
    const expectedPre = version.includes('-');
    if (data.isPrerelease === expectedPre) {
      results.push(pass('V5a', `Release isPrerelease == ${expectedPre}.`));
    } else {
      results.push(fail('V5a', `Release isPrerelease is ${data.isPrerelease}, expected ${expectedPre}.`));
    }
    const body = typeof data.body === 'string' ? data.body : '';
    const looksLikeStub = body.includes('CHANGELOG.md') && !body.includes('###');
    if (body.trim() !== '' && !looksLikeStub) {
      results.push(pass('V5b', 'Release body is not the stub fallback.'));
    } else {
      results.push(warn('V5b', 'Release body looks like the stub fallback (or is empty) — curated notes may be missing.'));
    }
  }

  // Assertion 3: cold-install smoke (slow, opt-in via --full)
  if (opts.full) {
    results.push(...coldInstallSmoke(pkgName, version));
  } else {
    results.push(info('V3', 'cold-install smoke skipped — pass --full to run it.'));
  }

  return results;
}

function coldInstallSmoke(pkgName, version) {
  const results = [];
  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-release-verify-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'mdp-verify-smoke', private: true, version: '0.0.0' }, null, 2)
    );

    const install = tryRun('npm', ['install', `${pkgName}@${version}`, '--no-save', '--no-audit', '--no-fund'], {
      cwd: tmp,
    });
    if (!install.ok) {
      results.push(fail('V3', `cold install of ${pkgName}@${version} failed: ${install.message || 'unknown error'}`));
      return results;
    }
    results.push(pass('V3', `cold install of ${pkgName}@${version} succeeded.`));

    const rootCheck = tryRun('node', ['-e', `require(${JSON.stringify(pkgName)})`], { cwd: tmp });
    results.push(
      rootCheck.ok ? pass('V3a', 'root entry resolves via require().') : fail('V3a', 'root entry require() failed.')
    );

    const subpath = `${pkgName}/core`;
    const subpathCheck = tryRun('node', ['-e', `require(${JSON.stringify(subpath)})`], { cwd: tmp });
    results.push(
      subpathCheck.ok
        ? pass('V3b', "subpath export './core' resolves via require().")
        : fail('V3b', "subpath export './core' require() failed — 'files' or 'exports' may be broken.")
    );
  } finally {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.verify) {
    const pkg = readPkg();
    const version = opts.verifyVersion || pkg.version;
    console.log(`Verifying published release for ${pkg.name}@${version}`);
    console.log('(read-only — npm view, git ls-remote, gh release view; nothing is modified)\n');
    const results = verify(version, pkg.name, opts);
    printResults(results);
    const hasFail = results.some((r) => r.level === 'FAIL');
    console.log('');
    console.log(hasFail ? 'Verification FAILED — see [FAIL] lines above.' : 'Verification PASSED.');
    process.exit(hasFail ? 1 : 0);
  }

  const { version, results } = preflight(opts);
  console.log(`Preflight for ${readPkg().name}@${version} (expected branch: ${opts.branch})\n`);
  printResults(results);
  const hasFail = results.some((r) => r.level === 'FAIL');

  if (hasFail) {
    console.log('');
    console.log('Preflight FAILED — fix the [FAIL] items above before publishing.');
    process.exit(1);
  }

  printNextSteps(version);
  process.exit(0);
}

main();
