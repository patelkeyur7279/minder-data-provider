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
    // G-07: the generated config template used to claim "nothing is
    // certified yet" — false since all six roadmap providers are CERTIFIED.
    // It now defers to the catalog + `minder add` instead.
    expect(config).not.toContain('nothing is certified yet');
    expect(config).toContain('minder add');

    const envExample = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
    expect(envExample).toContain('# minder providers');
    // G-07: same staleness in the .env.example header — it used to open
    // with "No providers are certified yet". Flipped to the catalog pointer.
    expect(envExample).not.toContain('No providers are certified yet');
    expect(envExample).toContain('docs/providers/CATALOG.md');

    // Key-source table: every registry entry's name + keysUrl on stdout.
    for (const entry of cli.KEY_SOURCE_REGISTRY) {
      expect(result.stdout).toContain(entry.name);
      expect(result.stdout).toContain(entry.keysUrl);
    }
    // G-07: cmdAdd's certification claim is derived from
    // scripts/generate-catalog.js's CERTIFIED list, and KEY_SOURCE_REGISTRY's
    // status strings were corrected to match reality — all six roadmap
    // providers are now 'certified' (none are 'experimental' or 'planned'
    // any more). Flipped from the old 'experimental'-everywhere assertion.
    expect(cli.KEY_SOURCE_REGISTRY.every((e: { status?: string }) => (e.status || '').startsWith('certified'))).toBe(
      true
    );
    expect(result.stdout.toLowerCase()).toContain('certified');
    expect(result.stdout.toLowerCase()).not.toContain('experimental');
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
  it('exits 1, names the unknown provider, and lists the registered providers + catalog', () => {
    // 'mailgun' is not (and has never been) a registered provider — see
    // PROVIDERS. Unlike 'stripe', 'clerk', 'firebase', 'razorpay', and
    // 'sentry' (all registered below), it has no PROVIDERS entry.
    const result = run(['add', 'mailgun'], { cwd: tmpDir });

    expect(result.status).toBe(1);
    const combined = result.stdout + result.stderr;
    // G-07: flipped from 'No certified providers are available yet' — that
    // claim became false once the six roadmap providers were certified. The
    // error now names the unknown provider and lists what IS registered
    // (derived from PROVIDERS, so the list can't go stale either).
    expect(combined).toContain('Unknown provider "mailgun"');
    for (const p of cli.PROVIDERS as Array<{ name: string }>) {
      expect(combined).toContain(p.name);
    }
    expect(combined).not.toContain('No certified providers are available yet');
    expect(combined).toContain('docs/providers/CATALOG.md');
  });

  it('unknown provider name still exits 1 (unaffected by the supabase registration)', () => {
    const result = run(['add', 'not-a-real-provider'], { cwd: tmpDir });

    expect(result.status).toBe(1);
    const combined = result.stdout + result.stderr;
    // G-07: flipped from 'No certified providers are available yet' — see
    // the mailgun test above for the full rationale.
    expect(combined).toContain('Unknown provider "not-a-real-provider"');
    expect(combined).not.toContain('No certified providers are available yet');
    expect(combined).toContain('docs/providers/CATALOG.md');
  });

  it('add with no provider name exits 1 with a missing-name error, not "undefined"', () => {
    const result = run(['add'], { cwd: tmpDir });

    expect(result.status).toBe(1);
    const combined = result.stdout + result.stderr;
    // G-07: with the unknown-provider message now interpolating the typed
    // name, a bare `minder add` must get its own message instead of the
    // nonsensical `Unknown provider "undefined"`.
    expect(combined).toContain('missing provider name');
    expect(combined).not.toContain('undefined');
    expect(combined).toContain('supabase');
    expect(combined).toContain('sentry');
    expect(combined).toContain('docs/providers/CATALOG.md');
  });

  it('add supabase scaffolds the certified config snippet and env var, exit 0', () => {
    const supabase = cli.PROVIDERS.find((p: { name: string }) => p.name === 'supabase');
    expect(supabase).toBeDefined();

    const result = run(['add', 'supabase'], { cwd: tmpDir });

    expect(result.status).toBe(0);

    // .env.example gains the provider's env var(s).
    const envExamplePath = path.join(tmpDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).toContain('SUPABASE_SERVICE_ROLE_KEY');

    // stdout carries the config snippet, the CERTIFIED notice + catalog
    // pointer, the mock-mode tip, and the keys URL.
    // G-07: supabase is in scripts/generate-catalog.js's CERTIFIED list, so
    // cmdAdd must print CERTIFIED, never the old "EXPERIMENTAL — not yet
    // certified" claim it printed for every provider regardless of status.
    expect(result.stdout).toContain(supabase.configSnippet.trim());
    expect(result.stdout).toContain('status: CERTIFIED');
    expect(result.stdout).toContain(cli.CATALOG_DOC);
    expect(result.stdout).not.toContain('not yet certified');
    expect(result.stdout).toContain('flip mock:false when you add real keys');
    expect(result.stdout).toContain(supabase.keysUrl);
  });

  const stripeCheckoutRoute = 'app/api/minder/stripe/checkout/route.ts';
  const stripeWebhookRoute = 'app/api/minder/stripe/webhook/route.ts';

  it('add stripe scaffolds real route files, env vars, and the certified notice, exit 0', () => {
    const stripe = cli.PROVIDERS.find((p: { name: string }) => p.name === 'stripe');
    expect(stripe).toBeDefined();

    const result = run(['add', 'stripe'], { cwd: tmpDir });

    expect(result.status).toBe(0);

    // Both route files are written with the expected import lines.
    const checkoutPath = path.join(tmpDir, stripeCheckoutRoute);
    const webhookPath = path.join(tmpDir, stripeWebhookRoute);
    expect(fs.existsSync(checkoutPath)).toBe(true);
    expect(fs.existsSync(webhookPath)).toBe(true);

    const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
    expect(checkoutContent).toContain(
      "import { createCheckoutHandler } from 'minder-data-provider/providers/stripe';"
    );
    expect(checkoutContent).toContain("import { secret } from 'minder-data-provider';");
    expect(checkoutContent).toContain('export async function POST(req: Request)');

    const webhookContent = fs.readFileSync(webhookPath, 'utf8');
    expect(webhookContent).toContain(
      "import { createStripeWebhookHandler } from 'minder-data-provider/providers/stripe';"
    );
    expect(webhookContent).toContain("import { secret } from 'minder-data-provider';");
    expect(webhookContent).toContain('export async function POST(req: Request)');

    // .env.example gains both env vars.
    const envExamplePath = path.join(tmpDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).toContain('STRIPE_SECRET_KEY');
    expect(envExample).toContain('STRIPE_WEBHOOK_SECRET');

    // stdout carries the config snippet, both scaffolded file paths, the
    // CERTIFIED notice + catalog pointer, and the keys URL.
    // G-07: stripe is CERTIFIED — flipped from the old blanket EXPERIMENTAL
    // assertion (see the supabase test above for the full rationale).
    expect(result.stdout).toContain(stripe.configSnippet.trim());
    expect(result.stdout).toContain(stripeCheckoutRoute);
    expect(result.stdout).toContain(stripeWebhookRoute);
    expect(result.stdout).toContain('status: CERTIFIED');
    expect(result.stdout).toContain(cli.CATALOG_DOC);
    expect(result.stdout).not.toContain('not yet certified');
    expect(result.stdout).toContain(stripe.keysUrl);
  });

  it('re-running add stripe without --force skips the existing route files', () => {
    const first = run(['add', 'stripe'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const checkoutPath = path.join(tmpDir, stripeCheckoutRoute);
    const webhookPath = path.join(tmpDir, stripeWebhookRoute);
    const checkoutBefore = fs.readFileSync(checkoutPath, 'utf8');
    const webhookBefore = fs.readFileSync(webhookPath, 'utf8');

    const second = run(['add', 'stripe'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Skipped');
    expect(second.stdout).toContain(stripeCheckoutRoute);
    expect(second.stdout).toContain(stripeWebhookRoute);

    expect(fs.readFileSync(checkoutPath, 'utf8')).toBe(checkoutBefore);
    expect(fs.readFileSync(webhookPath, 'utf8')).toBe(webhookBefore);
  });

  it('add stripe --force overwrites existing route files', () => {
    const first = run(['add', 'stripe'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const checkoutPath = path.join(tmpDir, stripeCheckoutRoute);
    const webhookPath = path.join(tmpDir, stripeWebhookRoute);

    // Corrupt both files to prove --force actually rewrites them.
    fs.writeFileSync(checkoutPath, '// corrupted\n', 'utf8');
    fs.writeFileSync(webhookPath, '// corrupted\n', 'utf8');

    const forced = run(['add', 'stripe', '--force'], { cwd: tmpDir });
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain('Scaffolded route files');

    const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
    const webhookContent = fs.readFileSync(webhookPath, 'utf8');
    expect(checkoutContent).not.toContain('// corrupted');
    expect(webhookContent).not.toContain('// corrupted');
    expect(checkoutContent).toContain('createCheckoutHandler');
    expect(webhookContent).toContain('createStripeWebhookHandler');
  });

  const clerkVerifyRoute = 'app/api/minder/clerk/verify/route.ts';

  it('add clerk scaffolds the verify route file, env var, and the certified notice, exit 0', () => {
    const clerk = cli.PROVIDERS.find((p: { name: string }) => p.name === 'clerk');
    expect(clerk).toBeDefined();

    const result = run(['add', 'clerk'], { cwd: tmpDir });

    expect(result.status).toBe(0);

    // The verify route file is written with the expected import lines.
    const verifyPath = path.join(tmpDir, clerkVerifyRoute);
    expect(fs.existsSync(verifyPath)).toBe(true);

    const verifyContent = fs.readFileSync(verifyPath, 'utf8');
    expect(verifyContent).toContain(
      "import { createClerkSessionHandler } from 'minder-data-provider/providers/clerk';"
    );
    expect(verifyContent).toContain("import { secret } from 'minder-data-provider';");
    expect(verifyContent).toContain('export async function POST(req: Request)');

    // .env.example gains the provider's env var.
    const envExamplePath = path.join(tmpDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).toContain('CLERK_SECRET_KEY');

    // stdout carries the config snippet, the scaffolded file path, the
    // CERTIFIED notice + catalog pointer, and the keys URL.
    // G-07: clerk is CERTIFIED — flipped from the old blanket EXPERIMENTAL
    // assertion (see the supabase test above for the full rationale).
    expect(result.stdout).toContain(clerk.configSnippet.trim());
    expect(result.stdout).toContain(clerkVerifyRoute);
    expect(result.stdout).toContain('status: CERTIFIED');
    expect(result.stdout).toContain(cli.CATALOG_DOC);
    expect(result.stdout).not.toContain('not yet certified');
    expect(result.stdout).toContain(clerk.keysUrl);
  });

  it('re-running add clerk without --force skips the existing route file', () => {
    const first = run(['add', 'clerk'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const verifyPath = path.join(tmpDir, clerkVerifyRoute);
    const verifyBefore = fs.readFileSync(verifyPath, 'utf8');

    const second = run(['add', 'clerk'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Skipped');
    expect(second.stdout).toContain(clerkVerifyRoute);

    expect(fs.readFileSync(verifyPath, 'utf8')).toBe(verifyBefore);
  });

  it('add clerk --force overwrites the existing route file', () => {
    const first = run(['add', 'clerk'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const verifyPath = path.join(tmpDir, clerkVerifyRoute);

    // Corrupt the file to prove --force actually rewrites it.
    fs.writeFileSync(verifyPath, '// corrupted\n', 'utf8');

    const forced = run(['add', 'clerk', '--force'], { cwd: tmpDir });
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain('Scaffolded route files');

    const verifyContent = fs.readFileSync(verifyPath, 'utf8');
    expect(verifyContent).not.toContain('// corrupted');
    expect(verifyContent).toContain('createClerkSessionHandler');
  });

  const firebaseHealthRoute = 'app/api/minder/firebase/health/route.ts';

  it('add firebase scaffolds the health route file, env var, extra note, and the certified notice, exit 0', () => {
    const firebase = cli.PROVIDERS.find((p: { name: string }) => p.name === 'firebase');
    expect(firebase).toBeDefined();

    const result = run(['add', 'firebase'], { cwd: tmpDir });

    expect(result.status).toBe(0);

    // The health route file is written with the expected import lines.
    const healthPath = path.join(tmpDir, firebaseHealthRoute);
    expect(fs.existsSync(healthPath)).toBe(true);

    const healthContent = fs.readFileSync(healthPath, 'utf8');
    expect(healthContent).toContain(
      "import { loadServiceAccount } from 'minder-data-provider/providers/firebase';"
    );
    expect(healthContent).toContain('export async function GET()');
    expect(healthContent).toContain('GOOGLE_APPLICATION_CREDENTIALS');

    // .env.example gains the provider's env var.
    const envExamplePath = path.join(tmpDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).toContain('GOOGLE_APPLICATION_CREDENTIALS');

    // stdout carries the config snippet, the scaffolded file path, the
    // credential-FILE extra note, the CERTIFIED notice + catalog pointer,
    // and the keys URL.
    // G-07: firebase is CERTIFIED — flipped from the old blanket
    // EXPERIMENTAL assertion (see the supabase test above for rationale).
    expect(result.stdout).toContain(firebase.configSnippet.trim());
    expect(result.stdout).toContain(firebaseHealthRoute);
    expect(result.stdout).toContain(
      'Firebase uses a service-account JSON FILE — set GOOGLE_APPLICATION_CREDENTIALS to its path'
    );
    expect(result.stdout).toContain('NEVER commit the file');
    expect(result.stdout).toContain('status: CERTIFIED');
    expect(result.stdout).toContain(cli.CATALOG_DOC);
    expect(result.stdout).not.toContain('not yet certified');
    expect(result.stdout).toContain(firebase.keysUrl);
  });

  it('re-running add firebase without --force skips the existing route file', () => {
    const first = run(['add', 'firebase'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const healthPath = path.join(tmpDir, firebaseHealthRoute);
    const healthBefore = fs.readFileSync(healthPath, 'utf8');

    const second = run(['add', 'firebase'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Skipped');
    expect(second.stdout).toContain(firebaseHealthRoute);

    expect(fs.readFileSync(healthPath, 'utf8')).toBe(healthBefore);
  });

  it('add firebase --force overwrites the existing route file', () => {
    const first = run(['add', 'firebase'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const healthPath = path.join(tmpDir, firebaseHealthRoute);

    // Corrupt the file to prove --force actually rewrites it.
    fs.writeFileSync(healthPath, '// corrupted\n', 'utf8');

    const forced = run(['add', 'firebase', '--force'], { cwd: tmpDir });
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain('Scaffolded route files');

    const healthContent = fs.readFileSync(healthPath, 'utf8');
    expect(healthContent).not.toContain('// corrupted');
    expect(healthContent).toContain('loadServiceAccount');
  });

  const razorpayOrderRoute = 'app/api/minder/razorpay/order/route.ts';
  const razorpayWebhookRoute = 'app/api/minder/razorpay/webhook/route.ts';

  it('add razorpay scaffolds both route files, both env vars, and the certified notice, exit 0', () => {
    const razorpay = cli.PROVIDERS.find((p: { name: string }) => p.name === 'razorpay');
    expect(razorpay).toBeDefined();

    const result = run(['add', 'razorpay'], { cwd: tmpDir });

    expect(result.status).toBe(0);

    // Both route files are written with the expected import lines.
    const orderPath = path.join(tmpDir, razorpayOrderRoute);
    const webhookPath = path.join(tmpDir, razorpayWebhookRoute);
    expect(fs.existsSync(orderPath)).toBe(true);
    expect(fs.existsSync(webhookPath)).toBe(true);

    const orderContent = fs.readFileSync(orderPath, 'utf8');
    expect(orderContent).toContain(
      "import { createOrderHandler } from 'minder-data-provider/providers/razorpay';"
    );
    expect(orderContent).toContain("import { secret } from 'minder-data-provider';");
    expect(orderContent).toContain('export async function POST(req: Request)');

    const webhookContent = fs.readFileSync(webhookPath, 'utf8');
    expect(webhookContent).toContain(
      "import { createRazorpayWebhookHandler } from 'minder-data-provider/providers/razorpay';"
    );
    expect(webhookContent).toContain("import { secret } from 'minder-data-provider';");
    expect(webhookContent).toContain('export async function POST(req: Request)');

    // .env.example gains both env vars.
    const envExamplePath = path.join(tmpDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).toContain('RAZORPAY_KEY_SECRET');
    expect(envExample).toContain('RAZORPAY_WEBHOOK_SECRET');

    // stdout carries the config snippet, both scaffolded file paths, the
    // CERTIFIED notice + catalog pointer, and the keys URL.
    // G-07: razorpay is CERTIFIED — flipped from the old blanket
    // EXPERIMENTAL assertion (see the supabase test above for rationale).
    expect(result.stdout).toContain(razorpay.configSnippet.trim());
    expect(result.stdout).toContain(razorpayOrderRoute);
    expect(result.stdout).toContain(razorpayWebhookRoute);
    expect(result.stdout).toContain('status: CERTIFIED');
    expect(result.stdout).toContain(cli.CATALOG_DOC);
    expect(result.stdout).not.toContain('not yet certified');
    expect(result.stdout).toContain(razorpay.keysUrl);
  });

  it('re-running add razorpay without --force skips the existing route files', () => {
    const first = run(['add', 'razorpay'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const orderPath = path.join(tmpDir, razorpayOrderRoute);
    const webhookPath = path.join(tmpDir, razorpayWebhookRoute);
    const orderBefore = fs.readFileSync(orderPath, 'utf8');
    const webhookBefore = fs.readFileSync(webhookPath, 'utf8');

    const second = run(['add', 'razorpay'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Skipped');
    expect(second.stdout).toContain(razorpayOrderRoute);
    expect(second.stdout).toContain(razorpayWebhookRoute);

    expect(fs.readFileSync(orderPath, 'utf8')).toBe(orderBefore);
    expect(fs.readFileSync(webhookPath, 'utf8')).toBe(webhookBefore);
  });

  it('add razorpay --force overwrites existing route files', () => {
    const first = run(['add', 'razorpay'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const orderPath = path.join(tmpDir, razorpayOrderRoute);
    const webhookPath = path.join(tmpDir, razorpayWebhookRoute);

    // Corrupt both files to prove --force actually rewrites them.
    fs.writeFileSync(orderPath, '// corrupted\n', 'utf8');
    fs.writeFileSync(webhookPath, '// corrupted\n', 'utf8');

    const forced = run(['add', 'razorpay', '--force'], { cwd: tmpDir });
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain('Scaffolded route files');

    const orderContent = fs.readFileSync(orderPath, 'utf8');
    const webhookContent = fs.readFileSync(webhookPath, 'utf8');
    expect(orderContent).not.toContain('// corrupted');
    expect(webhookContent).not.toContain('// corrupted');
    expect(orderContent).toContain('createOrderHandler');
    expect(webhookContent).toContain('createRazorpayWebhookHandler');
  });

  it('add sentry scaffolds no route files, writes no env section, and prints the extra note, exit 0', () => {
    const sentry = cli.PROVIDERS.find((p: { name: string }) => p.name === 'sentry');
    expect(sentry).toBeDefined();
    expect(sentry.envVars).toEqual([]);
    expect(sentry.scaffoldFiles).toBeUndefined();

    const result = run(['add', 'sentry'], { cwd: tmpDir });

    expect(result.status).toBe(0);

    // No server route directory is created for a client-only plugin.
    expect(fs.existsSync(path.join(tmpDir, 'app', 'api', 'minder', 'sentry'))).toBe(false);

    // envVars is empty, so cmdAdd must not write a ".env.example" section for
    // sentry at all (no marker, no empty comment block).
    const envExamplePath = path.join(tmpDir, '.env.example');
    if (fs.existsSync(envExamplePath)) {
      const envExample = fs.readFileSync(envExamplePath, 'utf8');
      expect(envExample).not.toContain('# minder provider: sentry');
    }

    // stdout carries the config snippet, the extra note, the CERTIFIED
    // notice + catalog pointer, and the keys URL — even with no env
    // vars/scaffold files to report.
    // G-07: sentry is CERTIFIED — flipped from the old blanket EXPERIMENTAL
    // assertion (see the supabase test above for the full rationale).
    expect(result.stdout).toContain(sentry.configSnippet.trim());
    expect(result.stdout).toContain('Sentry is a client observability plugin');
    expect(result.stdout).toContain('registerSentryProvider({ dsn })');
    expect(result.stdout).toContain('status: CERTIFIED');
    expect(result.stdout).toContain(cli.CATALOG_DOC);
    expect(result.stdout).not.toContain('not yet certified');
    expect(result.stdout).toContain(sentry.keysUrl);
  });

  it('re-running add sentry without --force is still a clean no-op success (nothing to skip)', () => {
    const first = run(['add', 'sentry'], { cwd: tmpDir });
    expect(first.status).toBe(0);

    const second = run(['add', 'sentry'], { cwd: tmpDir });
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('Sentry is a client observability plugin');
  });
});

// G-07: `minder add <provider>` used to print a hardcoded "EXPERIMENTAL —
// not yet certified" status for every provider, including the six that had
// since graduated to CERTIFIED in scripts/generate-catalog.js's CERTIFIED
// list — directly contradicting the catalog. The fix makes cmdAdd derive
// its certification claim from that single source of truth instead of a
// hand-maintained (and easily stale) label. These tests cover the lookup
// helper directly, independent of the full `minder add` child-process run.
describe('certification lookup (unit) — G-07', () => {
  it('every PROVIDERS entry is certified, and its status field says so', () => {
    for (const provider of cli.PROVIDERS as Array<{ name: string; status: string }>) {
      expect(cli.isCertifiedProvider(provider.name)).toBe(true);
      // PROVIDERS[].status is a human-maintained label, not what cmdAdd
      // actually prints (that's isCertifiedProvider) — but it must still
      // say the truth, or it's the exact staleness this ticket fixed.
      expect(provider.status).toBe('certified');
    }
  });

  it('an unknown/unregistered provider name is not certified', () => {
    expect(cli.isCertifiedProvider('mailgun')).toBe(false);
    expect(cli.isCertifiedProvider('not-a-real-provider')).toBe(false);
    expect(cli.isCertifiedProvider('')).toBe(false);
  });

  it('derives from scripts/generate-catalog.js CERTIFIED — not a hardcoded duplicate', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CERTIFIED } = require('../scripts/generate-catalog.js');
    const names = ['supabase', 'stripe', 'clerk', 'firebase', 'razorpay', 'sentry', 'mailgun', 'unknown-future'];
    for (const name of names) {
      expect(cli.isCertifiedProvider(name)).toBe(CERTIFIED.includes(`@minder/provider-${name}`));
    }
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

describe('minder doctor — environment checks (J-03)', () => {
  it('checkEnvironment flags a missing @tanstack/react-query peer with a fix', () => {
    // tmpDir has no node_modules → the peer check fails.
    const checks = cli.checkEnvironment(tmpDir) as Array<{
      label: string;
      ok: boolean;
      fix: string;
    }>;
    const rq = checks.find((c) => c.label.includes('react-query'));
    expect(rq).toBeDefined();
    expect(rq!.ok).toBe(false);
    expect(rq!.fix).toContain('npm install @tanstack/react-query');
  });

  it('checkEnvironment passes the peer check when it is installed', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '@tanstack', 'react-query'), {
      recursive: true,
    });
    const checks = cli.checkEnvironment(tmpDir) as Array<{ label: string; ok: boolean }>;
    expect(checks.find((c) => c.label.includes('react-query'))!.ok).toBe(true);
  });

  it('checkEnvironment detects a minder config file', () => {
    expect(
      (cli.checkEnvironment(tmpDir) as Array<{ label: string; ok: boolean }>).find((c) =>
        c.label.includes('config')
      )!.ok
    ).toBe(false);
    fs.writeFileSync(path.join(tmpDir, 'minder.config.ts'), 'export default {};');
    expect(
      (cli.checkEnvironment(tmpDir) as Array<{ label: string; ok: boolean }>).find((c) =>
        c.label.includes('config')
      )!.ok
    ).toBe(true);
  });

  it('doctor prints the environment section (with fixes for what is missing)', () => {
    const r = run(['doctor'], { cwd: tmpDir });
    expect(r.stdout).toContain('minder doctor: environment');
    expect(r.stdout).toContain('@tanstack/react-query installed');
    // tmpDir is bare → the peer is missing → its fix is shown.
    expect(r.stdout).toContain('npm install @tanstack/react-query');
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

  it('describes the six providers as certified, with no stale uncertified claims', () => {
    const help = run(['--help'], { cwd: tmpDir });
    expect(help.status).toBe(0);

    // G-07: --help's add blurb hardcoded "(all EXPERIMENTAL — not yet
    // certified ...)" and its init blurb said "none are certified yet" —
    // both false since the six roadmap providers were certified, and both
    // directly contradicting the CERTIFIED status `minder add` itself now
    // prints. Flipped to assert the accurate claim.
    expect(help.stdout).toContain('CERTIFIED');
    expect(help.stdout).toContain(cli.CATALOG_DOC);
    expect(help.stdout.toUpperCase()).not.toContain('EXPERIMENTAL');
    expect(help.stdout).not.toContain('not yet certified');
    expect(help.stdout).not.toContain('none are certified yet');
  });
});

describe('npm pack --dry-run ships the CLI', () => {
  it('includes bin/minder.js and src/cli/index.cjs', () => {
    const output = execSync('npm pack --dry-run --json', { cwd: REPO_ROOT, encoding: 'utf8' });
    const parsed = JSON.parse(output);
    const files: string[] = parsed[0].files.map((f: { path: string }) => f.path);

    expect(files).toContain('bin/minder.js');
    expect(files).toContain('src/cli/index.cjs');
    // G-07: cmdAdd now `require()`s scripts/generate-catalog.js at runtime
    // (the single source of truth for certification status) — it must ship
    // in the published package too, or `minder add` throws MODULE_NOT_FOUND
    // for anyone who installed via npm instead of a git checkout.
    expect(files).toContain('scripts/generate-catalog.js');
  });
});

describe('minder doctor — peer version compatibility (M2 version UX)', () => {
  it('minVersionFromRange picks the lowest concrete version in a range', () => {
    expect(cli.minVersionFromRange('^18.0.0 || ^19.0.0')).toBe('18.0.0');
    expect(cli.minVersionFromRange('^5.90.6')).toBe('5.90.6');
    expect(cli.minVersionFromRange('>=20.0.0')).toBe('20.0.0');
    expect(cli.minVersionFromRange('workspace:*')).toBeNull();
  });

  it('versionGte compares major.minor.patch correctly', () => {
    expect(cli.versionGte('19.0.0', '18.0.0')).toBe(true);
    expect(cli.versionGte('5.90.6', '5.90.6')).toBe(true);
    expect(cli.versionGte('5.5.0', '5.90.6')).toBe(false);
    expect(cli.versionGte('5.90.5', '5.90.6')).toBe(false);
    expect(cli.versionGte('18.3.1', '18.0.0')).toBe(true);
    // Unparseable -> don't cry wolf.
    expect(cli.versionGte('next', '18.0.0')).toBe(true);
  });

  it('minderPeerMinimums reads real minimums from minder package.json', () => {
    const mins = cli.minderPeerMinimums();
    const rq = mins.find((m: { name: string }) => m.name === '@tanstack/react-query');
    const react = mins.find((m: { name: string }) => m.name === 'react');
    expect(rq).toBeTruthy();
    expect(cli.versionGte('5.90.6', rq.min)).toBe(true);
    expect(react.min).toBe('18.0.0');
    // provider SDKs must be optional so absent ones aren't flagged
    const stripe = mins.find((m: { name: string }) => m.name === 'stripe');
    expect(stripe?.optional).toBe(true);
  });

  it('checkPeerVersions flags an outdated required peer with a fix, skips absent optionals', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-ver-'));
    const stub = (pkg: string, version: string) => {
      const d = path.join(dir, 'node_modules', ...pkg.split('/'));
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: pkg, version }));
    };
    stub('react', '17.0.2'); // too old
    stub('react-dom', '19.0.0'); // ok
    stub('@tanstack/react-query', '5.5.0'); // too old
    stub('@tanstack/query-core', '5.90.6'); // ok
    try {
      const checks = cli.checkPeerVersions(dir);
      const byName = (n: string) => checks.find((c: { label: string }) => c.label.startsWith(n));
      expect(byName('react ').ok).toBe(false);
      expect(byName('react ').fix).toBe('npm install react@^18.0.0');
      expect(byName('react-dom').ok).toBe(true);
      expect(byName('@tanstack/react-query ').ok).toBe(false);
      expect(byName('@tanstack/react-query ').fix).toBe('npm install @tanstack/react-query@^5.90.6');
      // stripe (optional) is not installed -> must NOT appear
      expect(checks.some((c: { label: string }) => c.label.includes('stripe'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
