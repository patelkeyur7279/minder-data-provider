/**
 * @jest-environment node
 *
 * Task C: `minder codemod redux-removal` — auto-migrate off the Redux
 * integration removed in v3.0 (see docs/MIGRATION_GUIDE.md, "v2.x -> v3.0").
 *
 * Same three-layer shape as tests/openapi-codegen.test.ts (matching that
 * command's own established pattern):
 *   1. Unit tests against the pure module's primitives (bracket matching,
 *      object-key-removal planning, import-binding parsing).
 *   2. Fixture-based golden-file byte-equality: every tests/fixtures/codemod-redux/before/*
 *      file transforms to exactly its tests/fixtures/codemod-redux/after/*
 *      counterpart, PLUS idempotency (transforming the "after" output again
 *      changes nothing) for every fixture.
 *   3. CLI-level smoke tests (child process via bin/minder.js): --dry-run
 *      writes nothing and previews a diff, default mode writes and matches
 *      the golden files, --dir scoping, node_modules skip, unknown-subcommand
 *      error path.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const codemod = require('../scripts/lib/codemod-redux-removal.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cli = require('../src/cli/index.cjs');

const REPO_ROOT = path.join(__dirname, '..');
const BIN_PATH = path.join(REPO_ROOT, 'bin', 'minder.js');
const FIXTURES_BEFORE = path.join(__dirname, 'fixtures', 'codemod-redux', 'before');
const FIXTURES_AFTER = path.join(__dirname, 'fixtures', 'codemod-redux', 'after');

const FIXTURE_NAMES = fs.readdirSync(FIXTURES_BEFORE).sort();

function makeCtx(cwd: string) {
  let out = '';
  let err = '';
  return {
    ctx: {
      cwd,
      stdout: { write: (s: string) => { out += s; return true; } },
      stderr: { write: (s: string) => { err += s; return true; } },
    },
    getOut: () => out,
    getErr: () => err,
  };
}

function copyFixturesInto(dir: string) {
  for (const name of FIXTURE_NAMES) {
    fs.copyFileSync(path.join(FIXTURES_BEFORE, name), path.join(dir, name));
  }
}

// ============================================================================
// 1. Unit tests — pure module primitives
// ============================================================================

describe('codemod-redux-removal: findMatchingClose', () => {
  it('matches a simple object literal', () => {
    const src = 'const x = { a: 1, b: 2 };';
    const open = src.indexOf('{');
    expect(codemod.findMatchingClose(src, open)).toBe(src.indexOf('}'));
  });

  it('is string/comment aware -- braces inside strings/comments do not desync depth', () => {
    const src = 'const x = { a: "}", b: /* } */ 2, c: `${"}"}` };';
    const open = src.indexOf('{');
    expect(codemod.findMatchingClose(src, open)).toBe(src.lastIndexOf('}'));
  });

  it('returns -1 for unterminated input', () => {
    const src = 'const x = { a: 1';
    expect(codemod.findMatchingClose(src, src.indexOf('{'))).toBe(-1);
  });
});

describe('codemod-redux-removal: findObjectKey / planObjectKeyRemoval', () => {
  it('finds a top-level key and ignores a same-named nested key', () => {
    const src = '{ redux: { redux: true }, auth: true }';
    const bodyStart = 1;
    const bodyEnd = src.length - 1;
    const found = codemod.findObjectKey(src, bodyStart, bodyEnd, 'redux');
    expect(found).not.toBeNull();
    // The TOP-level "redux:" is the first one, not the nested one.
    expect(src.slice(found!.keyStart, found!.keyStart + 5)).toBe('redux');
    expect(src.indexOf('redux', bodyStart)).toBe(found!.keyStart);
  });

  it('returns null when the key is absent', () => {
    const src = '{ auth: true }';
    expect(codemod.findObjectKey(src, 1, src.length - 1, 'redux')).toBeNull();
  });

  it('plans removal of a middle property including its trailing comma', () => {
    const src = '{\n  a: 1,\n  redux: false,\n  b: 2,\n}';
    const plan = codemod.planObjectKeyRemoval(src, 1, src.length - 1, 'redux');
    expect(plan).not.toBeNull();
    const out = src.slice(0, plan!.start) + src.slice(plan!.end);
    expect(out).toBe('{\n  a: 1,\n  b: 2,\n}');
  });

  it('plans removal of the last property by absorbing the preceding comma', () => {
    const src = '{\n  a: 1,\n  redux: false,\n}';
    const plan = codemod.planObjectKeyRemoval(src, 1, src.length - 1, 'redux');
    const out = src.slice(0, plan!.start) + src.slice(plan!.end);
    expect(out).toBe('{\n  a: 1,\n}');
  });
});

describe('codemod-redux-removal: findMinderImports', () => {
  it('parses named imports (with aliases) only from minder-data-provider specifiers', () => {
    const src = "import { useStore, useReduxSlice as useSlice } from 'minder-data-provider';\n" +
      "import { useSomethingElse } from 'other-package';\n";
    const imports = codemod.findMinderImports(src);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifier).toBe('minder-data-provider');
    expect(imports[0].entries).toEqual([
      expect.objectContaining({ imported: 'useStore', local: 'useStore' }),
      expect.objectContaining({ imported: 'useReduxSlice', local: 'useSlice' }),
    ]);
  });

  it('recognizes platform subpaths (e.g. minder-data-provider/nextjs)', () => {
    const src = "import { useStore } from 'minder-data-provider/nextjs';\n";
    expect(codemod.findMinderImports(src)).toHaveLength(1);
  });

  it('ignores unrelated packages entirely (e.g. zustand)', () => {
    const src = "import { useStore } from 'zustand';\n";
    expect(codemod.findMinderImports(src)).toHaveLength(0);
  });
});

describe('codemod-redux-removal: reactReduxProviderBinding', () => {
  it('finds the local name Provider is bound to', () => {
    expect(codemod.reactReduxProviderBinding("import { Provider } from 'react-redux';\n")).toBe('Provider');
    expect(codemod.reactReduxProviderBinding("import { Provider as ReduxProvider } from 'react-redux';\n")).toBe(
      'ReduxProvider'
    );
    expect(codemod.reactReduxProviderBinding("import { connect } from 'react-redux';\n")).toBeNull();
  });
});

// ============================================================================
// 2. Fixture-based golden-file tests + idempotency
// ============================================================================

describe('codemod-redux-removal: fixtures (golden-file byte equality)', () => {
  for (const name of FIXTURE_NAMES) {
    it(`transforms ${name} to match its golden after/ file`, () => {
      const before = fs.readFileSync(path.join(FIXTURES_BEFORE, name), 'utf8');
      const golden = fs.readFileSync(path.join(FIXTURES_AFTER, name), 'utf8');
      const result = codemod.transformSource(before);
      expect(result.output).toBe(golden);
    });

    it(`is idempotent for ${name} (re-running the golden output changes nothing)`, () => {
      const golden = fs.readFileSync(path.join(FIXTURES_AFTER, name), 'utf8');
      const second = codemod.transformSource(golden);
      expect(second.changed).toBe(false);
      expect(second.output).toBe(golden);
    });
  }

  it('leaves an already-migrated file byte-for-byte untouched', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'already-migrated.tsx'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(before);
    expect(result.todos).toHaveLength(0);
    expect(result.transforms).toHaveLength(0);
  });

  it('leaves a file with no redux usage (incl. an unrelated zustand useStore) byte-for-byte untouched', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'no-redux-usage.ts'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(before);
  });

  it('renames useReduxSlice -> useMinder and flags the return-shape TODO', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'use-redux-slice.tsx'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).toContain("import { useMinder, useOneTouchCrud } from 'minder-data-provider';");
    expect(result.output).toContain("useMinder('todos')");
    expect(result.output).toContain('TODO(minder-codemod): review this useMinder() call');
    expect(result.transforms.map((t: { kind: string }) => t.kind)).toEqual(
      expect.arrayContaining([expect.stringContaining('useReduxSlice -> useMinder')])
    );
  });

  it('dedupes when useMinder is already imported alongside useReduxSlice', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'use-redux-slice-dedupe.tsx'), 'utf8');
    const result = codemod.transformSource(before);
    // Only ONE useMinder import survives -- no duplicate specifier.
    expect(result.output.match(/from 'minder-data-provider'/g)).toHaveLength(1);
    expect(result.output.match(/\buseMinder\b/g)!.length).toBeGreaterThanOrEqual(3); // import + 2 call sites
    // No more IMPORT of useReduxSlice, and no CALL to it outside of the
    // advisory TODO comment's prose (which documents the old return shape).
    expect(result.output).not.toMatch(/import\s*\{[^}]*useReduxSlice/);
    const codeLines = result.output.split('\n').filter((l: string) => !l.trim().startsWith('//'));
    expect(codeLines.join('\n')).not.toMatch(/\buseReduxSlice\s*\(/);
  });

  it('flags useStore() with a manual TODO but does not rewrite it', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'use-store.tsx'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).toContain("import { useStore } from 'minder-data-provider';"); // unchanged
    expect(result.output).toContain('TODO(minder-codemod): useStore() was removed');
    expect(result.transforms).toHaveLength(0); // flag-only, no auto-fix counted
    expect(result.todos.length).toBeGreaterThan(0);
  });

  it('removes the redux field from configureMinder(...) but leaves other fields intact', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'configure-minder-redux-field.ts'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).not.toMatch(/redux\s*:/);
    expect(result.output).toContain("apiUrl: 'https://api.example.com'");
    expect(result.output).toContain('auth: true');
  });

  it('removes a bare redux: false last property cleanly (no double comma or empty line left behind)', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'configure-minder-redux-last.ts'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).not.toMatch(/redux/);
    expect(result.output).not.toMatch(/,\s*,/); // no double comma artifact
    expect(result.output).toContain("apiUrl: 'https://api.example.com',\n});");
  });

  it('removes redux from a directly-typed MinderConfig variable (not just configureMinder calls)', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'minder-config-variable.ts'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).not.toMatch(/redux/);
    expect(result.output).toContain("apiUrl: 'https://api.example.com'");
  });

  it('flags the Redux <Provider> wrapper and useMinderContext().store with manual TODOs', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'provider-wrapper.tsx'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).toContain('<Provider store={undefined}>'); // untouched, flag-only
    expect(result.output).toContain('const { store } = useMinderContext();'); // untouched
    expect(result.todos.length).toBeGreaterThanOrEqual(2);
  });

  it('flags every DynamicLoader redux member with manual TODOs', () => {
    const before = fs.readFileSync(path.join(FIXTURES_BEFORE, 'dynamic-loader.ts'), 'utf8');
    const result = codemod.transformSource(before);
    expect(result.output).toContain('loader.loadRedux({})'); // untouched
    expect(result.output).toContain("preload: ['query', 'redux']"); // untouched
    expect(result.todos.length).toBe(6); // preload + loadRedux + getStore + isReduxLoaded + addReducer + .redux field
  });
});

// ============================================================================
// 3. CLI-level smoke tests (child process via bin/minder.js)
// ============================================================================

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: { cwd: string }): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [BIN_PATH, ...args], {
      cwd: opts.cwd,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : '',
    };
  }
}

describe('minder codemod redux-removal (CLI)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-codemod-cli-'));
    copyFixturesInto(tmpDir);
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--dry-run previews a diff and writes nothing', () => {
    const before = fs.readFileSync(path.join(tmpDir, 'use-store.tsx'), 'utf8');
    const result = run(['codemod', 'redux-removal', '--dry-run'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/--- use-store\.tsx/);
    expect(result.stdout).toMatch(/\+ .*TODO\(minder-codemod\)/);
    expect(result.stdout).toMatch(/no files written/);
    // Nothing was actually written:
    expect(fs.readFileSync(path.join(tmpDir, 'use-store.tsx'), 'utf8')).toBe(before);
  });

  it('default mode writes changes matching the golden files and prints a summary', () => {
    const result = run(['codemod', 'redux-removal'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/files changed: \d+/);
    expect(result.stdout).toMatch(/manual TODOs flagged: \d+/);
    expect(result.stdout).toMatch(/transforms applied/);

    for (const name of FIXTURE_NAMES) {
      const golden = fs.readFileSync(path.join(FIXTURES_AFTER, name), 'utf8');
      const written = fs.readFileSync(path.join(tmpDir, name), 'utf8');
      expect(written).toBe(golden);
    }
  });

  it('running twice is idempotent end-to-end (second run reports zero files changed)', () => {
    run(['codemod', 'redux-removal'], { cwd: tmpDir });
    const second = run(['codemod', 'redux-removal'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/files changed: 0/);
    expect(second.stdout).toMatch(/manual TODOs flagged: 0/);
  });

  it('--dir scopes the scan and never touches files outside it', () => {
    const nested = path.join(tmpDir, 'nested');
    fs.mkdirSync(nested);
    fs.copyFileSync(path.join(FIXTURES_BEFORE, 'use-store.tsx'), path.join(nested, 'use-store.tsx'));
    const outsideBefore = fs.readFileSync(path.join(tmpDir, 'use-store.tsx'), 'utf8');

    const result = run(['codemod', 'redux-removal', '--dir', 'nested'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const insideAfter = fs.readFileSync(path.join(nested, 'use-store.tsx'), 'utf8');
    expect(insideAfter).not.toBe(fs.readFileSync(path.join(FIXTURES_BEFORE, 'use-store.tsx'), 'utf8'));
    // The top-level copy (outside --dir) must be untouched:
    expect(fs.readFileSync(path.join(tmpDir, 'use-store.tsx'), 'utf8')).toBe(outsideBefore);
  });

  it('skips node_modules/dist/build output', () => {
    const nm = path.join(tmpDir, 'node_modules', 'some-pkg');
    fs.mkdirSync(nm, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES_BEFORE, 'use-store.tsx'), path.join(nm, 'use-store.tsx'));

    run(['codemod', 'redux-removal'], { cwd: tmpDir });

    expect(fs.readFileSync(path.join(nm, 'use-store.tsx'), 'utf8')).toBe(
      fs.readFileSync(path.join(FIXTURES_BEFORE, 'use-store.tsx'), 'utf8')
    );
  });

  it('exits 1 with a helpful usage error for a missing subcommand', () => {
    const result = run(['codemod'], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing subcommand/);
  });

  it('exits 1 for an unknown subcommand', () => {
    const result = run(['codemod', 'bogus-thing'], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unknown subcommand/);
  });

  it('exits 1 when --dir points at a nonexistent directory', () => {
    const result = run(['codemod', 'redux-removal', '--dir', 'does-not-exist'], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/directory not found/);
  });
});

// ============================================================================
// In-process cmdCodemod exercise (same pattern as cmdGenerate/cmdDoctor)
// ============================================================================

describe('cmdCodemod (in-process)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-codemod-inproc-'));
    copyFixturesInto(tmpDir);
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports transform counts and TODO locations in the summary', () => {
    const { ctx, getOut } = makeCtx(tmpDir);
    const code = cli.cmdCodemod(['redux-removal'], ctx);
    expect(code).toBe(0);
    const out = getOut();
    expect(out).toMatch(/use-store\.tsx:\d+/);
    expect(out).toMatch(/redux field removed from config object/);
  });

  it('--dir requires a path argument', () => {
    const { ctx, getErr } = makeCtx(tmpDir);
    const code = cli.cmdCodemod(['redux-removal', '--dir'], ctx);
    expect(code).toBe(1);
    expect(getErr()).toMatch(/--dir requires a path argument/);
  });
});
