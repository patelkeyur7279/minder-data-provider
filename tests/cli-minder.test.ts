/**
 * @jest-environment node
 *
 * F-05: `minder` CLI skeleton (init / add / doctor).
 *
 * Drives the CLI the same way a real user would — as a child process via
 * `bin/minder.js` — in a scratch temp directory per test, so filesystem
 * side effects (minder.config.ts, .env.example) never touch the repo. The
 * `writeScaffold` machinery is additionally unit-tested directly (in-process)
 * since it's exported for exactly that purpose.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cli = require('../src/cli/index.cjs');

const REPO_ROOT = path.join(__dirname, '..');
const BIN_PATH = path.join(REPO_ROOT, 'bin', 'minder.js');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [BIN_PATH, ...args], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
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

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-cli-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('minder init', () => {
  it('creates minder.config.ts and .env.example, and prints the key-source table', () => {
    const result = run(['init'], { cwd: tmpDir });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'minder.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.env.example'))).toBe(true);

    const config = fs.readFileSync(path.join(tmpDir, 'minder.config.ts'), 'utf8');
    expect(config).toContain('configureMinder');
    expect(config).toContain('providers: {');
    expect(config).toContain('docs/providers/CATALOG.md');

    const envExample = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
    expect(envExample).toContain('# minder providers');

    // Key-source table: every registry entry's name + keysUrl on stdout.
    for (const entry of cli.KEY_SOURCE_REGISTRY) {
      expect(result.stdout).toContain(entry.name);
      expect(result.stdout).toContain(entry.keysUrl);
    }
    expect(result.stdout.toLowerCase()).toContain('planned');
  });

  it('is idempotent: a second run without --force skips and leaves files unchanged', () => {
    const first = run(['init'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const configBefore = fs.readFileSync(path.join(tmpDir, 'minder.config.ts'), 'utf8');
    const envBefore = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');

    const second = run(['init'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout.toLowerCase()).toContain('already');
    expect(second.stdout).toContain('--force');

    const configAfter = fs.readFileSync(path.join(tmpDir, 'minder.config.ts'), 'utf8');
    const envAfter = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
    expect(configAfter).toBe(configBefore);
    expect(envAfter).toBe(envBefore);
  });

  it('--force overwrites existing files', () => {
    const first = run(['init'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    // Corrupt both files to prove --force actually rewrites them.
    fs.writeFileSync(path.join(tmpDir, 'minder.config.ts'), '// corrupted\n', 'utf8');
    fs.appendFileSync(path.join(tmpDir, '.env.example'), '\n# corrupted extra line\n', 'utf8');

    const forced = run(['init', '--force'], { cwd: tmpDir });
    expect(forced.status).toBe(0);

    const config = fs.readFileSync(path.join(tmpDir, 'minder.config.ts'), 'utf8');
    expect(config).toContain('configureMinder');
    expect(config).not.toContain('// corrupted');

    const envExample = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
    expect(envExample).toContain('# minder providers');
  });
});

describe('minder add', () => {
  it('exits 1 and points at the provider catalog', () => {
    const result = run(['add', 'stripe'], { cwd: tmpDir });

    expect(result.status).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('No certified providers are available yet');
    expect(combined).toContain('docs/providers/CATALOG.md');
  });
});

describe('writeScaffold (unit)', () => {
  it('creates parent directories that do not yet exist', () => {
    const result = cli.writeScaffold([{ path: 'nested/deep/file.txt', content: 'hello' }], { cwd: tmpDir });

    expect(result).toEqual({ written: ['nested/deep/file.txt'], skipped: [] });
    expect(fs.readFileSync(path.join(tmpDir, 'nested', 'deep', 'file.txt'), 'utf8')).toBe('hello');
  });

  it('never overwrites an existing file without force', () => {
    fs.writeFileSync(path.join(tmpDir, 'existing.txt'), 'original', 'utf8');

    const result = cli.writeScaffold([{ path: 'existing.txt', content: 'new content' }], { cwd: tmpDir });

    expect(result).toEqual({ written: [], skipped: ['existing.txt'] });
    expect(fs.readFileSync(path.join(tmpDir, 'existing.txt'), 'utf8')).toBe('original');
  });

  it('overwrites an existing file when force is true', () => {
    fs.writeFileSync(path.join(tmpDir, 'existing.txt'), 'original', 'utf8');

    const result = cli.writeScaffold([{ path: 'existing.txt', content: 'new content' }], {
      cwd: tmpDir,
      force: true,
    });

    expect(result).toEqual({ written: ['existing.txt'], skipped: [] });
    expect(fs.readFileSync(path.join(tmpDir, 'existing.txt'), 'utf8')).toBe('new content');
  });

  it('returns { written, skipped } covering a mix of new and existing files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a', 'utf8');

    const result = cli.writeScaffold(
      [
        { path: 'a.txt', content: 'new-a' },
        { path: 'b.txt', content: 'new-b' },
      ],
      { cwd: tmpDir }
    );

    expect(result.written).toEqual(['b.txt']);
    expect(result.skipped).toEqual(['a.txt']);
  });
});

describe('minder doctor', () => {
  it('reports a masked table from a JSON config and exits 0 when the env var is set', () => {
    // Constructed at runtime — never a scanner-matching literal in the repo
    // (see commit 4a4f84c).
    const fakeSecretValue = 'sk_test_' + Math.random().toString(36).slice(2) + 'x'.repeat(8);
    const envVarName = 'MINDER_CLI_TEST_STRIPE_KEY';

    fs.writeFileSync(
      path.join(tmpDir, 'minder.providers.json'),
      JSON.stringify({
        providers: {
          stripe: {
            secretKey: { kind: 'env', name: envVarName },
          },
        },
      }),
      'utf8'
    );

    const result = run(['doctor', '--config', './minder.providers.json'], {
      cwd: tmpDir,
      env: { ...process.env, [envVarName]: fakeSecretValue },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('***');
    expect(result.stdout).not.toContain(fakeSecretValue);
    expect(result.stderr).not.toContain(fakeSecretValue);
  });

  it('exits 1 and names the missing env var (never a value) when absent', () => {
    const envVarName = 'MINDER_CLI_TEST_MISSING_KEY';

    fs.writeFileSync(
      path.join(tmpDir, 'minder.providers.json'),
      JSON.stringify({
        providers: {
          stripe: {
            secretKey: { kind: 'env', name: envVarName },
          },
        },
      }),
      'utf8'
    );

    const env = { ...process.env };
    delete env[envVarName];

    const result = run(['doctor', '--config', './minder.providers.json'], { cwd: tmpDir, env });

    expect(result.status).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain(envVarName);
  });

  it('falls back to scanning .env.example when no --config is given', () => {
    const envVarName = 'MINDER_CLI_TEST_ENV_EXAMPLE_KEY';
    fs.writeFileSync(path.join(tmpDir, '.env.example'), `${envVarName}=your-value-here\n`, 'utf8');

    const envWithoutVar = { ...process.env };
    delete envWithoutVar[envVarName];
    const missing = run(['doctor'], { cwd: tmpDir, env: envWithoutVar });
    expect(missing.status).toBe(1);

    const present = run(['doctor'], { cwd: tmpDir, env: { ...process.env, [envVarName]: 'anything' } });
    expect(present.status).toBe(0);
    expect(present.stdout).toContain('***');
  });
});

describe('minder --help / no args', () => {
  it('lists all three commands', () => {
    const help = run(['--help'], { cwd: tmpDir });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('init');
    expect(help.stdout).toContain('add');
    expect(help.stdout).toContain('doctor');

    const noArgs = run([], { cwd: tmpDir });
    expect(noArgs.status).toBe(0);
    expect(noArgs.stdout).toBe(help.stdout);
  });
});

describe('npm pack --dry-run ships the CLI', () => {
  it('includes bin/minder.js and src/cli/index.cjs', () => {
    const output = execSync('npm pack --dry-run --json', { cwd: REPO_ROOT, encoding: 'utf8' });
    const parsed = JSON.parse(output);
    const files: string[] = parsed[0].files.map((f: { path: string }) => f.path);

    expect(files).toContain('bin/minder.js');
    expect(files).toContain('src/cli/index.cjs');
  });
});
