/**
 * scripts/build-wiki.mjs — the GitHub-wiki "book" generator.
 *
 * The script is a Node-ESM (.mjs) CLI, so — unlike the CommonJS scripts
 * elsewhere in this repo — it cannot be `require()`-d from a ts-jest
 * (module: commonjs) test. Every case here drives it exactly the way
 * .github/workflows/wiki-sync.yml does: via child_process, against
 * throwaway fixture trees built per-test (plus one smoke test against the
 * real docs/ tree). This also means the tests exercise the same contract
 * consumers rely on: exit code, stdout summary, and files on disk.
 */
import {
  describe, it, expect, afterEach,
} from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'build-wiki.mjs');
const REPO_ROOT = path.join(__dirname, '..');

const tmpDirs: string[] = [];
function mkTmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function writeFiles(base: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

/** Builds a minimal valid fixture project: a repo root with docs/ + manifest. */
function makeProject(opts: {
  root?: string;
  docsFiles: Record<string, string>;
  manifest: unknown;
  outsideFiles?: Record<string, string>;
}) {
  const root = opts.root ?? mkTmp('mdp-wiki-root-');
  writeFiles(path.join(root, 'docs'), opts.docsFiles);
  if (opts.outsideFiles) writeFiles(root, opts.outsideFiles);
  fs.writeFileSync(
    path.join(root, 'docs', 'wiki-book.json'),
    JSON.stringify(opts.manifest, null, 2),
  );
  // README.md is read unconditionally for the Home page pitch.
  if (!opts.outsideFiles?.['README.md']) {
    writeFiles(root, {
      'README.md': '# Fixture Project\n\n### The tagline\n\n**Bold pitch.**\n\nMore pitch text.\n',
    });
  }
  return root;
}

function runProject(root: string, out: string, extra: string[] = []): RunResult {
  return run([
    '--out', out,
    '--docs', path.join(root, 'docs'),
    '--manifest', path.join(root, 'docs', 'wiki-book.json'),
    '--root', root,
    '--repo', 'acme/fixture',
    '--branch', 'main',
    ...extra,
  ]);
}

describe('build-wiki: manifest completeness', () => {
  it('fails when a docs/*.md file is neither listed nor excluded', () => {
    const root = makeProject({
      docsFiles: {
        'A.md': '# A\n\nBody.\n',
        'B.md': '# B\n\nUnlisted body.\n',
      },
      manifest: {
        chapters: [{ num: 1, title: 'One', pages: ['A.md'] }],
        excluded: [],
      },
    });
    const out = mkTmp('mdp-wiki-out-');
    const result = runProject(root, out);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('B.md');
    expect(result.stderr.toLowerCase()).toContain('neither listed');
  });

  it('passes when every file is listed or excluded, and skips development/ + superpowers/', () => {
    const root = makeProject({
      docsFiles: {
        'A.md': '# A\n\nBody.\n',
        'B.md': '# B\n\nBody.\n',
        'development/internal.md': '# Internal\n\nNever scanned.\n',
        'superpowers/plan.md': '# Plan\n\nNever scanned.\n',
      },
      manifest: {
        chapters: [{ num: 1, title: 'One', pages: ['A.md'] }],
        excluded: ['B.md'],
      },
    });
    const out = mkTmp('mdp-wiki-out-');
    const result = runProject(root, out);
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(out, '01.1-A.md'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'development'))).toBe(false);
  });
});

describe('build-wiki: link rewriting', () => {
  function rewritingProject() {
    return makeProject({
      docsFiles: {
        'A.md': [
          '# Page A',
          '',
          'Same dir: [B](./B.md).',
          'Subdir: [C](./sub/C.md).',
          'Anchor: [B section](./B.md#a-heading).',
          'Excluded: [D](./D.md).',
          'Outside docs: [Readme](../README.md).',
          'Bare same-dir: [B bare](B.md).',
          '',
        ].join('\n'),
        'B.md': '# Page B\n\n## A heading\n\nBody.\n',
        'sub/C.md': '# Page C\n\nBody.\n',
        'D.md': '# Excluded Page D\n\nBody.\n',
      },
      manifest: {
        chapters: [{ num: 1, title: 'One', pages: ['A.md', 'B.md', 'sub/C.md'] }],
        excluded: ['D.md'],
      },
    });
  }

  it('rewrites same-dir, subdir, anchor, bare, excluded, and outside-docs links', () => {
    const root = rewritingProject();
    const out = mkTmp('mdp-wiki-out-');
    const result = runProject(root, out);
    expect(result.status).toBe(0);
    const a = fs.readFileSync(path.join(out, '01.1-A.md'), 'utf8');

    expect(a).toContain('[B](01.2-B)');
    expect(a).toContain('[C](01.3-C)');
    expect(a).toContain('[B section](01.2-B#a-heading)');
    expect(a).toContain('[D](https://github.com/acme/fixture/blob/main/docs/D.md)');
    expect(a).toContain('[Readme](https://github.com/acme/fixture/blob/main/README.md)');
    expect(a).toContain('[B bare](01.2-B)');
  });

  it('fails when two source files map to the same generated output name', () => {
    // Both chapters use num:1 and a same-named file ("A.md"), so the
    // chapter-num + page-index + filename-slug scheme collides on
    // "01.1-A.md" — the generator must catch this before writing anything.
    const out = mkTmp('mdp-wiki-out-');
    const dup = makeProject({
      docsFiles: {
        'A.md': '# Same Title\n\nBody A.\n',
        'sub/A.md': '# Same Title\n\nBody A2 — same slug as A.md once tokenized.\n',
      },
      manifest: {
        chapters: [
          { num: 1, title: 'One', pages: ['A.md'] },
          { num: 1, title: 'Two', pages: ['sub/A.md'] },
        ],
        excluded: [],
      },
    });
    const result = runProject(dup, out);
    expect(result.status).not.toBe(0);
  });
});

describe('build-wiki: book order (prev/next across chapter boundaries)', () => {
  it('chains prev/next in book order, including chapter-index pages, wrapping to Home at the ends', () => {
    const root = makeProject({
      docsFiles: {
        'A1.md': '# Chapter One Page One\n\nBody.\n',
        'A2.md': '# Chapter One Page Two\n\nBody.\n',
        'B1.md': '# Chapter Two Page One\n\nBody.\n',
        'B2.md': '# Chapter Two Page Two\n\nBody.\n',
      },
      manifest: {
        chapters: [
          { num: 1, title: 'Chapter One', pages: ['A1.md', 'A2.md'] },
          { num: 2, title: 'Chapter Two', pages: ['B1.md', 'B2.md'] },
        ],
        excluded: [],
      },
    });
    const out = mkTmp('mdp-wiki-out-');
    const result = runProject(root, out);
    expect(result.status).toBe(0);

    const read = (name: string) => fs.readFileSync(path.join(out, name), 'utf8');
    const ch1Index = read('01-Chapter-One.md');
    const a1 = read('01.1-A1.md');
    const a2 = read('01.2-A2.md');
    const ch2Index = read('02-Chapter-Two.md');
    const b1 = read('02.1-B1.md');
    const b2 = read('02.2-B2.md');

    // Book order: Ch1 index -> A1 -> A2 -> Ch2 index -> B1 -> B2
    expect(ch1Index).toContain('[prev](Home)');
    expect(ch1Index).toContain('[next](01.1-A1)');
    expect(a1).toContain('[prev](01-Chapter-One)');
    expect(a1).toContain('[next](01.2-A2)');
    expect(a2).toContain('[prev](01.1-A1)');
    // Chapter boundary: last page of chapter 1 hands off to chapter 2's index.
    expect(a2).toContain('[next](02-Chapter-Two)');
    expect(ch2Index).toContain('[prev](01.2-A2)');
    expect(ch2Index).toContain('[next](02.1-B1)');
    expect(b1).toContain('[prev](02-Chapter-Two)');
    expect(b2).toContain('[prev](02.1-B1)');
    // End of book wraps to Home.
    expect(b2).toContain('[next](Home)');
  });
});

describe('build-wiki: determinism', () => {
  it('produces byte-identical output across two runs of the same input', () => {
    const root = makeProject({
      docsFiles: {
        'A.md': '# A\n\nSome body text.\n\n## Section\n\nMore text.\n',
        'B.md': '# B\n\nOther body.\n',
      },
      manifest: {
        chapters: [{ num: 1, title: 'One', pages: ['A.md', 'B.md'] }],
        excluded: [],
      },
    });
    const out1 = mkTmp('mdp-wiki-out1-');
    const out2 = mkTmp('mdp-wiki-out2-');
    expect(runProject(root, out1).status).toBe(0);
    expect(runProject(root, out2).status).toBe(0);

    const files1 = fs.readdirSync(out1).sort();
    const files2 = fs.readdirSync(out2).sort();
    expect(files1).toEqual(files2);
    for (const f of files1) {
      expect(fs.readFileSync(path.join(out1, f))).toEqual(fs.readFileSync(path.join(out2, f)));
    }
  });
});

describe('build-wiki: H1 handling', () => {
  it('replaces an existing H1 with the numbered title', () => {
    const root = makeProject({
      docsFiles: { 'A.md': '# Original Title\n\nBody.\n' },
      manifest: { chapters: [{ num: 1, title: 'One', pages: ['A.md'] }], excluded: [] },
    });
    const out = mkTmp('mdp-wiki-out-');
    expect(runProject(root, out).status).toBe(0);
    const a = fs.readFileSync(path.join(out, '01.1-A.md'), 'utf8');
    expect(a).toContain('# 1.1 — Original Title');
    expect(a.split('\n').filter((l) => l.startsWith('# ')).length).toBe(1);
  });

  it('injects an H1 when the file has none', () => {
    const root = makeProject({
      docsFiles: { 'NO_HEADING.md': 'Just a body paragraph, no heading at all.\n' },
      manifest: { chapters: [{ num: 1, title: 'One', pages: ['NO_HEADING.md'] }], excluded: [] },
    });
    const out = mkTmp('mdp-wiki-out-');
    expect(runProject(root, out).status).toBe(0);
    const a = fs.readFileSync(path.join(out, '01.1-No-Heading.md'), 'utf8');
    expect(a).toMatch(/# 1\.1 — No Heading/);
    expect(a).toContain('Just a body paragraph, no heading at all.');
  });
});

describe('build-wiki: per-page title overrides', () => {
  it('a { file, title } page entry drives the H1, breadcrumb, chapter index, sidebar, and Home TOC — description still comes from content', () => {
    const root = makeProject({
      docsFiles: {
        'MESSY_TITLE.md': '# 🔥 Some Messy v2.0.3 Title (2026-07-19)\n\nThe real description paragraph.\n',
        'PLAIN.md': '# Plain\n\nOther body.\n',
      },
      manifest: {
        chapters: [{
          num: 1,
          title: 'One',
          pages: [{ file: 'MESSY_TITLE.md', title: 'Clean Title' }, 'PLAIN.md'],
        }],
        excluded: [],
      },
    });
    const out = mkTmp('mdp-wiki-out-');
    expect(runProject(root, out).status).toBe(0);

    const page = fs.readFileSync(path.join(out, '01.1-Messy-Title.md'), 'utf8');
    // H1 uses the override, not the messy source H1.
    expect(page).toContain('# 1.1 — Clean Title');
    expect(page).not.toContain('Some Messy v2.0.3 Title');
    // Breadcrumb uses the override.
    expect(page).toContain('› 1.1 Clean Title');
    // Description still comes from the page's own content, untouched by the override.
    expect(page).toContain('The real description paragraph.');
    // Back-to-top anchor tracks the overridden H1 text.
    expect(page).toContain('[⬆ back to top](#11-clean-title)');

    const chapterIndex = fs.readFileSync(path.join(out, '01-One.md'), 'utf8');
    expect(chapterIndex).toContain('[1.1 Clean Title](01.1-Messy-Title) — The real description paragraph.');

    const sidebar = fs.readFileSync(path.join(out, '_Sidebar.md'), 'utf8');
    expect(sidebar).toContain('[1.1 Clean Title](01.1-Messy-Title)');

    const home = fs.readFileSync(path.join(out, 'Home.md'), 'utf8');
    expect(home).toContain('[1.1 Clean Title](01.1-Messy-Title)');
    expect(home).not.toContain('Some Messy v2.0.3 Title');

    // Filenames are still derived from the file basename, not the title override.
    expect(fs.existsSync(path.join(out, '01.1-Messy-Title.md'))).toBe(true);
  });

  it('a plain string page entry keeps deriving its title from the source H1 (backward compatible)', () => {
    const root = makeProject({
      docsFiles: { 'A.md': '# A Title\n\nBody.\n' },
      manifest: { chapters: [{ num: 1, title: 'One', pages: ['A.md'] }], excluded: [] },
    });
    const out = mkTmp('mdp-wiki-out-');
    expect(runProject(root, out).status).toBe(0);
    const a = fs.readFileSync(path.join(out, '01.1-A.md'), 'utf8');
    expect(a).toContain('# 1.1 — A Title');
  });
});

describe('build-wiki: footer completeness', () => {
  it('every generated page (chapter indexes and content pages alike) ends with the full footer', () => {
    const root = makeProject({
      docsFiles: {
        'A1.md': '# Chapter One Page One\n\nBody.\n',
        'A2.md': '# Chapter One Page Two\n\nBody.\n',
        'B1.md': '# Chapter Two Page One\n\nBody.\n',
      },
      manifest: {
        chapters: [
          { num: 1, title: 'Chapter One', pages: ['A1.md', 'A2.md'] },
          { num: 2, title: 'Chapter Two', pages: ['B1.md'] },
        ],
        excluded: [],
      },
    });
    const out = mkTmp('mdp-wiki-out-');
    expect(runProject(root, out).status).toBe(0);

    const names = fs.readdirSync(out).filter((n) => !['Home.md', '_Sidebar.md', '_Footer.md'].includes(n));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const content = fs.readFileSync(path.join(out, name), 'utf8');
      expect(content).toMatch(/\* \* \*\n\n\[⬆ back to top\]\(#[^)]+\)\n\n◀ \[prev\]\([^)]+\) · \[⌂ Home\]\(Home\) · \[next\]\([^)]+\) ▶\n\n<sub>minder-data-provider documentation · © 2026 Keyur Patel · MIT<\/sub>/);
    }
  });

  it('every real-docs generated page ends with the full footer', () => {
    const out = mkTmp('mdp-wiki-real-footer-out-');
    expect(run(['--out', out]).status).toBe(0);
    const names = fs.readdirSync(out).filter((n) => !['Home.md', '_Sidebar.md', '_Footer.md'].includes(n));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const content = fs.readFileSync(path.join(out, name), 'utf8');
      expect(content).toContain('* * *\n\n[⬆ back to top](#');
      expect(content).toMatch(/◀ \[prev\]\([^)]+\) · \[⌂ Home\]\(Home\) · \[next\]\([^)]+\) ▶/);
      expect(content.trim().endsWith('<sub>minder-data-provider documentation · © 2026 Keyur Patel · MIT</sub>')).toBe(true);
    }
  });
});

describe('build-wiki: real docs/ smoke test', () => {
  it('generates the whole book from the real repo docs/ with exit 0 and no broken links', () => {
    const out = mkTmp('mdp-wiki-real-out-');
    const result = run(['--out', out]);
    if (result.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(result.stdout, result.stderr);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/build-wiki: OK — \d+ pages across \d+ chapters/);
    expect(fs.existsSync(path.join(out, 'Home.md'))).toBe(true);
    expect(fs.existsSync(path.join(out, '_Sidebar.md'))).toBe(true);
    expect(fs.existsSync(path.join(out, '_Footer.md'))).toBe(true);
    // Real docs/ must not be touched.
    expect(fs.existsSync(path.join(REPO_ROOT, 'docs', 'wiki-book.json'))).toBe(true);
  });
});
