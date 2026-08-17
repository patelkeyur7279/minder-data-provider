#!/usr/bin/env node
'use strict';

/**
 * `minder` CLI entry point.
 *
 * Requires src/cli/index.cjs directly — NOT dist/cli.js. The actual CLI
 * logic lives there as plain, zero-dependency CommonJS (see that file's
 * header for why), which keeps this executable usable straight from a git
 * checkout or `npm install` with no build step, and avoids coupling the
 * test suite to `npm run build`. Both files ship as source via package.json
 * "files".
 */

const { main } = require('../src/cli/index.cjs');

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);
