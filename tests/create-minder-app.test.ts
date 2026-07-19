/**
 * @jest-environment node
 *
 * A4 — create-minder-app scaffolder. Verifies it produces the expected files,
 * renames template dotfiles, substitutes the app name, refuses a non-empty
 * target, and ships no secrets in the template.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cma = require('../packages/create-minder-app/index.js');

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cma-'));
}

describe('create-minder-app', () => {
  it('scaffolds the expected files and renames dotfiles', () => {
    const cwd = tmp();
    try {
      const r = cma.scaffold('my-app', cwd);
      expect(r.ok).toBe(true);
      const dir = path.join(cwd, 'my-app');
      for (const f of [
        'package.json',
        'index.html',
        'vite.config.ts',
        'tsconfig.json',
        'src/main.tsx',
        'src/App.tsx',
        '.gitignore', // renamed from _gitignore
        '.env.example', // renamed from _env.example
        'README.md',
      ]) {
        expect(fs.existsSync(path.join(dir, f))).toBe(true);
      }
      // template placeholders must not leak into the output
      expect(fs.existsSync(path.join(dir, '_gitignore'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('substitutes the app name into package.json', () => {
    const cwd = tmp();
    try {
      cma.scaffold('cool-app', cwd);
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'cool-app', 'package.json'), 'utf8'));
      expect(pkg.name).toBe('cool-app');
      expect(JSON.stringify(pkg)).not.toContain('__APP_NAME__');
      // pins current minder ecosystem
      expect(pkg.dependencies['@tanstack/react-query']).toMatch(/5\.9/);
      expect(pkg.dependencies.react).toMatch(/19/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('refuses a target directory that exists and is not empty', () => {
    const cwd = tmp();
    try {
      fs.mkdirSync(path.join(cwd, 'taken'));
      fs.writeFileSync(path.join(cwd, 'taken', 'file.txt'), 'x');
      const r = cma.scaffold('taken', cwd);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/not empty/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('requires a target argument', () => {
    const cwd = tmp();
    try {
      const r = cma.scaffold(undefined, cwd);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/Usage/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ships no real secret values in the template (.env.example is comments only)', () => {
    const cwd = tmp();
    try {
      cma.scaffold('sec', cwd);
      const env = fs.readFileSync(path.join(cwd, 'sec', '.env.example'), 'utf8');
      // every non-empty, non-comment line must be an empty assignment (KEY=) — no values
      for (const line of env.split('\n').map((l) => l.trim())) {
        if (!line || line.startsWith('#')) continue;
        expect(line).toMatch(/^[A-Z0-9_]+=$/);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
