// Self-contained CI smoke test for the Astro example.
//
// 1. Starts the plain-Node mock upstream (../mock-upstream.mjs) on :8788.
// 2. Starts the built Astro server (dist/server/entry.mjs, @astrojs/node
//    standalone adapter, requires `npm run build` first) on a fixed port.
// 3. Waits (bounded) for both to become reachable.
// 4. Curls the SSR page and asserts it contains the SSR marker AND the
//    server-fetched "Ada" string — i.e. minder() really ran server-side
//    against the mock upstream at request time.
// 5. Always kills both background processes and exits with the right code.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UPSTREAM_URL = 'http://127.0.0.1:8788';
const APP_PORT = 4322;
const APP_HOST = '127.0.0.1';
const APP_URL = `http://${APP_HOST}:${APP_PORT}/`;

const MARKER = 'Astro SSR example page rendered.';
const EXPECTED_USER = 'Ada';

/** Poll `url` until it responds ok or `timeoutMs` elapses. Bounded — never hangs forever. */
async function waitFor(url, { timeoutMs = 15000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

function spawnProcess(command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.on('error', (err) => {
    console.error(`[ci:smoke] failed to start "${command} ${args.join(' ')}":`, err);
  });
  return child;
}

function killProcess(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
}

async function main() {
  const upstream = spawnProcess('node', ['mock-upstream.mjs'], { cwd: ROOT });
  const app = spawnProcess('node', ['./dist/server/entry.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: APP_HOST,
      PORT: String(APP_PORT),
      UPSTREAM_BASE_URL: UPSTREAM_URL,
    },
  });

  try {
    await waitFor(`${UPSTREAM_URL}/users`);
    console.log('[ci:smoke] mock upstream ready on :8788');

    await waitFor(APP_URL);
    console.log(`[ci:smoke] astro server ready on :${APP_PORT}`);

    const res = await fetch(APP_URL);
    const html = await res.text();

    if (!html.includes(MARKER)) {
      throw new Error(`page did not contain SSR marker "${MARKER}"`);
    }
    if (!html.includes(EXPECTED_USER)) {
      throw new Error(`page did not contain server-fetched user "${EXPECTED_USER}"`);
    }

    console.log('[ci:smoke] PASS — page contains SSR marker and server-fetched "Ada"');
  } finally {
    killProcess(app);
    killProcess(upstream);
  }
}

main().catch((err) => {
  console.error('[ci:smoke] FAIL —', err.message);
  process.exitCode = 1;
});
