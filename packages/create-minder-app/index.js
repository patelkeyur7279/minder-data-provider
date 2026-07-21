#!/usr/bin/env node

/**
 * create-minder-app — scaffolds a working minder-data-provider starter
 * (Vite + React + TanStack Query) in one command:
 *
 *   npm create minder-app my-app
 *
 * Zero dependencies. Copies templates/react-vite/** into the target dir,
 * substitutes the app name, and prints next steps. Template dotfiles are stored
 * as `_gitignore` / `_env.example` because npm does not publish real dotfiles in
 * a package tarball — they are renamed back on copy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RENAME = { _gitignore: '.gitignore', '_env.example': '.env.example' };

function copyDir(src, dest, transform) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const outName = RENAME[entry.name] || entry.name;
    const to = path.join(dest, outName);
    if (entry.isDirectory()) {
      copyDir(from, to, transform);
    } else {
      fs.writeFileSync(to, transform(fs.readFileSync(from, 'utf8'), outName));
    }
  }
}

function scaffold(targetArg, cwd) {
  if (!targetArg) {
    return { ok: false, error: 'Usage: npm create minder-app <project-directory>' };
  }
  const dest = path.resolve(cwd, targetArg);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    return { ok: false, error: `Target directory "${targetArg}" already exists and is not empty.` };
  }
  const appName = path.basename(dest);
  const templateDir = path.join(__dirname, 'templates', 'react-vite');
  copyDir(templateDir, dest, (content, name) =>
    name === 'package.json' ? content.replace(/__APP_NAME__/g, appName) : content
  );
  return { ok: true, appName, dest };
}

function main(argv, io) {
  const out = (io && io.stdout) || process.stdout;
  const err = (io && io.stderr) || process.stderr;
  const result = scaffold(argv[0], (io && io.cwd) || process.cwd());
  if (!result.ok) {
    err.write(result.error + '\n');
    return 1;
  }
  out.write(
    `\n✅ Created ${result.appName}\n\nNext steps:\n` +
      `  cd ${argv[0]}\n` +
      `  npm install\n` +
      `  npm run dev\n\n` +
      `Docs: https://github.com/patelkeyur7279/minder-data-provider\n`
  );
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, scaffold, copyDir };
