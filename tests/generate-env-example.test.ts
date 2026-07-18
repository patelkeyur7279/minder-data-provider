/**
 * M1-02: .env.example generator (scripts/generate-env-example.js).
 *
 * The script is plain CommonJS with a `main()` + `module.exports` for
 * testability (per its own header comment) — we require it directly rather
 * than shelling out, except for one smoke test that drives the CLI via
 * child_process to prove the npm script entry point actually works end to end.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const generator = require('../scripts/generate-env-example.js');

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('generate-env-example — pure scan/build helpers', () => {
  it('scanFileContents finds env() calls and process.env.NAME / process.env["NAME"] usages', () => {
    const contents = `
      import { env, secret } from './secrets';
      const a = env('STRIPE_PUBLISHABLE_KEY');
      const b = process.env.STRIPE_SECRET_KEY;
      const c = process.env["SENDGRID_API_KEY"];
      const d = process.env['MAILGUN_KEY'];
    `;
    const names = generator.scanFileContents(contents);
    expect(Array.from(names).sort()).toEqual([
      'MAILGUN_KEY',
      'SENDGRID_API_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_SECRET_KEY',
    ]);
  });

  it('buildEnvExampleContent never inlines a real value, only placeholders', () => {
    const content = generator.buildEnvExampleContent(new Set(['STRIPE_SECRET_KEY']), new Map());
    expect(content).toContain('STRIPE_SECRET_KEY=your-stripe-secret-key-here');
    expect(content).not.toMatch(/sk_(live|test)_/);
  });

  it('buildEnvExampleContent is idempotent and deterministically sorted', () => {
    const names = new Set(['ZETA_KEY', 'ALPHA_KEY']);
    const first = generator.buildEnvExampleContent(names, new Map());
    const second = generator.buildEnvExampleContent(names, new Map());
    expect(first).toBe(second);
    expect(first.indexOf('ALPHA_KEY')).toBeLessThan(first.indexOf('ZETA_KEY'));
  });

  it('buildEnvExampleContent includes manifest descriptions as comments', () => {
    const manifest = new Map([['STRIPE_SECRET_KEY', { description: 'Stripe secret API key', required: true }]]);
    const content = generator.buildEnvExampleContent(new Set(['STRIPE_SECRET_KEY']), manifest);
    expect(content).toContain('# Stripe secret API key (required)');
  });
});

describe('generate-env-example — scanSrcForEnvVars over a temp source tree', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans nested files, skips tests/dist/node_modules, and dedupes', () => {
    tmpDir = makeTmpDir('minder-env-scan-');
    fs.mkdirSync(path.join(tmpDir, 'providers'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'x'), { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, 'providers', 'stripe.ts'),
      `export const key = env('STRIPE_SECRET_KEY'); export const again = env('STRIPE_SECRET_KEY');`
    );
    fs.writeFileSync(path.join(tmpDir, 'providers', 'stripe.test.ts'), `env('SHOULD_NOT_BE_SCANNED');`);
    fs.writeFileSync(path.join(tmpDir, 'dist', 'bundled.js'), `process.env.SHOULD_NOT_BE_SCANNED_EITHER;`);
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'x', 'index.js'), `process.env.IGNORED_DEP_VAR;`);
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), `env('NOT_CODE_SO_IGNORED')`);

    const names = generator.scanSrcForEnvVars(tmpDir);
    expect(Array.from(names)).toEqual(['STRIPE_SECRET_KEY']);
  });
});

describe('generate-env-example — main()', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('excludes framework-internal vars like NODE_ENV by default', () => {
    tmpDir = makeTmpDir('minder-env-main-');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'a.ts'),
      `if (process.env.NODE_ENV === 'development') {}\nconst k = env('REAL_API_KEY');`
    );

    const result = generator.main({
      srcDir,
      outPath: path.join(tmpDir, '.env.example'),
      manifestPath: path.join(tmpDir, 'does-not-exist.json'),
      dryRun: true,
    });

    expect(result.names).toEqual(['REAL_API_KEY']);
    expect(result.content).not.toContain('NODE_ENV');
  });

  it('merges in vars from an optional env-manifest.json', () => {
    tmpDir = makeTmpDir('minder-env-manifest-');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), `const k = env('FROM_SRC');`);

    const manifestPath = path.join(tmpDir, 'env-manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ FROM_MANIFEST: { description: 'A manifest-documented var', required: true } })
    );

    const result = generator.main({
      srcDir,
      outPath: path.join(tmpDir, '.env.example'),
      manifestPath,
      dryRun: true,
    });

    expect(result.names).toEqual(['FROM_MANIFEST', 'FROM_SRC']);
    expect(result.content).toContain('# A manifest-documented var (required)');
    expect(result.content).toContain('FROM_MANIFEST=your-from-manifest-here');
  });

  it('is idempotent: writing twice with unchanged input yields unchanged=false the second time', () => {
    tmpDir = makeTmpDir('minder-env-idempotent-');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), `const k = env('IDEMPOTENT_KEY');`);
    const outPath = path.join(tmpDir, '.env.example');

    const first = generator.main({ srcDir, outPath, manifestPath: path.join(tmpDir, 'none.json') });
    expect(first.changed).toBe(true); // file did not exist before

    const second = generator.main({ srcDir, outPath, manifestPath: path.join(tmpDir, 'none.json') });
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it('handles an absent manifest file gracefully (optional)', () => {
    tmpDir = makeTmpDir('minder-env-no-manifest-');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), `const k = env('ONLY_FROM_SRC');`);

    const result = generator.main({
      srcDir,
      outPath: path.join(tmpDir, '.env.example'),
      manifestPath: path.join(tmpDir, 'nope.json'),
      dryRun: true,
    });

    expect(result.names).toEqual(['ONLY_FROM_SRC']);
  });

  it('writes a header-only file with no variable lines when nothing is found', () => {
    tmpDir = makeTmpDir('minder-env-empty-');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.ts'), `export const x = 1;`);

    const result = generator.main({
      srcDir,
      outPath: path.join(tmpDir, '.env.example'),
      manifestPath: path.join(tmpDir, 'nope.json'),
      dryRun: true,
    });

    expect(result.names).toEqual([]);
    expect(result.content).toContain('No env() / process.env usages were found');
  });
});

describe('generate-env-example — CLI smoke test (child_process)', () => {
  it('running the script against this repo writes a real .env.example and reports variables', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-env-example.js');
    const output = execFileSync('node', [scriptPath], { encoding: 'utf8' });
    expect(output).toContain('[generate-env-example] Wrote');

    const envExamplePath = path.join(__dirname, '..', '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const content = fs.readFileSync(envExamplePath, 'utf8');
    expect(content).toContain('Auto-generated by `npm run generate:env-example`');
  });

  it('--check exits 0 when up to date and non-zero after a source change introduces a new var', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-env-example.js');
    // Ensure it's up to date first.
    execFileSync('node', [scriptPath], { encoding: 'utf8' });
    expect(() => execFileSync('node', [scriptPath, '--check'], { encoding: 'utf8' })).not.toThrow();

    const tmpDir = makeTmpDir('minder-env-check-');
    try {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), `const k = env('BRAND_NEW_VAR_NOT_ON_DISK');`);
      const outPath = path.join(tmpDir, '.env.example');
      fs.writeFileSync(outPath, 'stale content\n');

      expect(() =>
        execFileSync('node', [scriptPath, '--src', srcDir, '--out', outPath, '--manifest', path.join(tmpDir, 'none.json'), '--check'], {
          encoding: 'utf8',
        })
      ).toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
