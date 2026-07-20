/**
 * `minder doctor --bundle` — scans a user app for minder-data-provider imports
 * and prices each subpath from the shipped dist/bundle-sizes.json.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cli = require('../src/cli/index.cjs');

function makeCtx(cwd: string) {
  let out = '';
  let err = '';
  return {
    ctx: {
      cwd,
      stdout: { write: (s: string) => { out += s; return true; } },
      stderr: { write: (s: string) => { err += s; return true; } },
      exec: () => { throw new Error('exec not expected'); },
    },
    getOut: () => out,
    getErr: () => err,
  };
}

describe('minder doctor --bundle', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdp-doctor-bundle-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeApp(withSizes: boolean) {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'App.tsx'),
      `import { useMinder } from 'minder-data-provider/hook';\n` +
        `const x = () => import('minder-data-provider/upload');\n`,
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'api.ts'),
      `const { minder } = require('minder-data-provider');\n`,
    );
    // must be skipped:
    fs.mkdirSync(path.join(dir, 'node_modules', 'junk'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'node_modules', 'junk', 'index.js'),
      `require('minder-data-provider/websocket');\n`,
    );
    if (withSizes) {
      const distDir = path.join(dir, 'node_modules', 'minder-data-provider', 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(
        path.join(distDir, 'bundle-sizes.json'),
        JSON.stringify({
          results: [
            { subpath: '. (main)', gzip: 70 * 1024 },
            { subpath: 'hook', gzip: 40 * 1024 },
            { subpath: 'upload', gzip: 20 * 1024 },
          ],
        }),
      );
    }
  }

  test('lists imported subpaths with costs; skips node_modules', () => {
    writeApp(true);
    const { ctx, getOut } = makeCtx(dir);
    expect(cli.cmdDoctor(['--bundle'], ctx)).toBe(0);
    const out = getOut();
    expect(out).toContain('minder-data-provider/hook');
    expect(out).toContain('minder-data-provider/upload');
    expect(out).toContain('~40.00 KB min+gz');
    expect(out).toContain('~70.00 KB min+gz');
    expect(out).toContain('worst-case total');
    expect(out).not.toContain('websocket'); // node_modules skipped
    expect(out).toContain('src/App.tsx');
  });

  test('degrades gracefully without a size table', () => {
    writeApp(false);
    const { ctx, getOut } = makeCtx(dir);
    expect(cli.cmdDoctor(['--bundle'], ctx)).toBe(0);
    expect(getOut()).toContain('size table not found');
  });

  test('reports nothing-found on an empty app', () => {
    const { ctx, getOut } = makeCtx(dir);
    expect(cli.cmdDoctor(['--bundle'], ctx)).toBe(0);
    expect(getOut()).toContain('no minder-data-provider imports found');
  });

  test('main-entry-only app gets the subpath tip', () => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'a.ts'),
      `import { useMinder } from 'minder-data-provider';\n`,
    );
    const { ctx, getOut } = makeCtx(dir);
    expect(cli.cmdDoctor(['--bundle'], ctx)).toBe(0);
    expect(getOut()).toContain('minder-data-provider/hook');
  });
});
