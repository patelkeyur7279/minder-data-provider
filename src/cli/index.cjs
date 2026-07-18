'use strict';

/**
 * `minder` CLI implementation (F-05, provider-platform foundation).
 *
 * Zero dependencies, plain CommonJS, Node-only — the same style as
 * scripts/generate-env-example.js and scripts/certify-provider.js: a pure
 * `main(argv, io)` entry point plus exported subcommand functions for direct
 * unit testing, with all filesystem/process side effects gated behind
 * `require.main === module` in bin/minder.js.
 *
 * Why plain CJS instead of building against dist/: this file ships as
 * source (see package.json "files") and is required directly by
 * bin/minder.js. That keeps the CLI usable straight out of a git checkout
 * or npm install with no build step, and keeps tests simple (no dist
 * coupling, no build-before-test ordering).
 *
 * Every subcommand function takes `(argv, ctx)` where `ctx = { cwd, stdout,
 * stderr }` and returns a process exit code (never calls `process.exit`
 * itself) — that keeps them safely callable in-process from tests.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_DOC = 'docs/providers/CATALOG.md';

/**
 * Static key-source registry — where to get API keys for each provider.
 * Most are still PLANNED (nothing to install yet); Supabase has graduated to
 * `status: 'experimental'` now that `minder add supabase` (see `PROVIDERS`
 * below) actually scaffolds something. This registry is purely a
 * convenience pointer printed by `minder init`.
 */
const KEY_SOURCE_REGISTRY = [
  {
    name: 'Supabase',
    keysUrl: 'https://supabase.com/dashboard/project/_/settings/api',
    status: 'experimental — minder add supabase',
  },
  {
    name: 'Stripe',
    keysUrl: 'https://dashboard.stripe.com/apikeys',
    status: 'experimental — minder add stripe',
  },
  {
    name: 'Clerk',
    keysUrl: 'https://dashboard.clerk.com',
    status: 'experimental — minder add clerk',
  },
  {
    name: 'Firebase',
    keysUrl: 'https://console.firebase.google.com',
    status: 'experimental — minder add firebase',
  },
  {
    name: 'Razorpay',
    keysUrl: 'https://dashboard.razorpay.com/app/website-app-settings/api-keys',
    status: 'experimental — minder add razorpay',
  },
  {
    name: 'Sentry',
    keysUrl: 'https://sentry.io/settings/',
    status: 'experimental — minder add sentry',
  },
];

/**
 * Registry of providers `minder add <provider>` actually knows how to
 * scaffold. Everything not listed here falls through to the generic
 * "no certified providers" catalog message in `cmdAdd`. Entries here are
 * honestly labeled by `status` — `'experimental'` means "installable, but
 * not yet certified" (see docs/providers/CATALOG.md), never "production
 * ready".
 */
const SUPABASE_CONFIG_SNIPPET = `// Add this to your minder.config.ts "providers" object:
//
// import { secret } from 'minder-data-provider/server';
//
// providers: {
//   supabase: {
//     url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//     serviceRoleKey: secret('SUPABASE_SERVICE_ROLE_KEY'),
//     mock: true, // flip to false once you've added real Supabase keys
//   },
// }
`;

const STRIPE_CONFIG_SNIPPET = `// Add this to your minder.config.ts "providers" object:
//
// import { secret } from 'minder-data-provider/server';
//
// providers: {
//   stripe: {
//     publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
//     secretKey: secret('STRIPE_SECRET_KEY'),
//     webhookSecret: secret('STRIPE_WEBHOOK_SECRET'),
//     checkoutPath: '/api/minder/stripe/checkout',
//     mock: true, // flip to false once you've added real Stripe keys
//   },
// }
`;

// Next.js App Router route handlers scaffolded by `minder add stripe`. Server
// boundary: both import from 'minder-data-provider/providers/stripe' (the
// zero-dependency handler factories) and resolve secrets via `secret(...)`
// from 'minder-data-provider' — the secret key/webhook secret are never
// embedded as raw strings in app code.
const STRIPE_CHECKOUT_ROUTE = `import { createCheckoutHandler } from 'minder-data-provider/providers/stripe';
import { secret } from 'minder-data-provider';

const handler = createCheckoutHandler({ secretKey: secret('STRIPE_SECRET_KEY') });

export async function POST(req: Request) {
  return handler(req);
}
`;

const STRIPE_WEBHOOK_ROUTE = `import { createStripeWebhookHandler } from 'minder-data-provider/providers/stripe';
import { secret } from 'minder-data-provider';

const handler = createStripeWebhookHandler({
  webhookSecret: secret('STRIPE_WEBHOOK_SECRET'),
  onEvent: async (event) => {
    // event: { type: string, data: unknown, raw: string }
    // TODO: switch on event.type (e.g. 'checkout.session.completed') and act on event.data
  },
});

export async function POST(req: Request) {
  return handler(req);
}
`;

const CLERK_CONFIG_SNIPPET = `// Add this to your minder.config.ts "providers" object:
//
// import { secret } from 'minder-data-provider/server';
//
// providers: {
//   clerk: {
//     publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
//     secretKey: secret('CLERK_SECRET_KEY'),
//     mock: true, // flip to false once you've added real Clerk keys
//   },
// }
`;

// Next.js App Router route handler scaffolded by `minder add clerk`. Server
// boundary: imports from 'minder-data-provider/providers/clerk' (the
// zero-dependency session-verify handler factory) and resolves the secret
// key via `secret(...)` from 'minder-data-provider' — never embedded as a
// raw string in app code.
const CLERK_VERIFY_ROUTE = `import { createClerkSessionHandler } from 'minder-data-provider/providers/clerk';
import { secret } from 'minder-data-provider';

const handler = createClerkSessionHandler({ secretKey: secret('CLERK_SECRET_KEY') });

export async function POST(req: Request) {
  return handler(req);
}
`;

const FIREBASE_CONFIG_SNIPPET = `// Add this to your minder.config.ts "providers" object:
//
// providers: {
//   firebase: {
//     apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!, // apiKey is a PUBLIC identifier, not a secret
//     authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
//     projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
//     // serviceAccount is a FileRef — resolved server-only, contents never
//     // logged or returned to the client:
//     serviceAccount: { kind: 'file', source: 'path', ref: process.env.GOOGLE_APPLICATION_CREDENTIALS },
//     mock: true, // flip to false once you've added real Firebase keys
//   },
// }
`;

// Next.js App Router route handler scaffolded by `minder add firebase`. Server
// boundary: imports from 'minder-data-provider/providers/firebase' (the
// zero-dependency service-account loader) and resolves the credential file
// via a FileRef — the file's contents (private_key, raw client_email, etc.)
// are never returned by this route, only the MASKED health summary.
const FIREBASE_HEALTH_ROUTE = `import { loadServiceAccount } from 'minder-data-provider/providers/firebase';

export async function GET() {
  // GOOGLE_APPLICATION_CREDENTIALS points at the service-account JSON FILE
  // path — never commit that file, and never inline its contents here.
  const health = await loadServiceAccount({
    kind: 'file',
    source: 'path',
    ref: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  });

  // health is MASKED (projectId + masked clientEmail + hasPrivateKey only) —
  // the private_key itself is never included.
  return Response.json(health);
}
`;

const RAZORPAY_CONFIG_SNIPPET = `// Add this to your minder.config.ts "providers" object:
//
// import { secret } from 'minder-data-provider/server';
//
// providers: {
//   razorpay: {
//     keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!, // keyId is a PUBLIC identifier, not a secret
//     keySecret: secret('RAZORPAY_KEY_SECRET'),
//     webhookSecret: secret('RAZORPAY_WEBHOOK_SECRET'),
//     mock: true, // flip to false once you've added real Razorpay keys
//   },
// }
`;

// Next.js App Router route handlers scaffolded by `minder add razorpay`. Server
// boundary: both import from 'minder-data-provider/providers/razorpay' (the
// zero-dependency handler factories) and resolve secrets via `secret(...)`
// from 'minder-data-provider' — the key secret/webhook secret are never
// embedded as raw strings in app code.
const RAZORPAY_ORDER_ROUTE = `import { createOrderHandler } from 'minder-data-provider/providers/razorpay';
import { secret } from 'minder-data-provider';

const handler = createOrderHandler({
  keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  keySecret: secret('RAZORPAY_KEY_SECRET'),
});

export async function POST(req: Request) {
  return handler(req);
}
`;

const RAZORPAY_WEBHOOK_ROUTE = `import { createRazorpayWebhookHandler } from 'minder-data-provider/providers/razorpay';
import { secret } from 'minder-data-provider';

const handler = createRazorpayWebhookHandler({
  webhookSecret: secret('RAZORPAY_WEBHOOK_SECRET'),
  onEvent: async (e) => {
    // e: { body, rawBody, headers }
    // TODO: switch on e.body's event type and act on it
  },
});

export async function POST(req: Request) {
  return handler(req);
}
`;

const SENTRY_CONFIG_SNIPPET = `// Add this to your minder.config.ts "providers" object:
//
// providers: {
//   sentry: {
//     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, // DSN is PUBLIC, not a secret
//     mock: true, // flip to false once you've added a real Sentry DSN
//   },
// }
`;

const PROVIDERS = [
  {
    name: 'supabase',
    status: 'experimental',
    envVars: ['SUPABASE_SERVICE_ROLE_KEY'],
    configSnippet: SUPABASE_CONFIG_SNIPPET,
    keysUrl: 'https://supabase.com/dashboard/project/_/settings/api',
  },
  {
    name: 'stripe',
    status: 'experimental',
    envVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    configSnippet: STRIPE_CONFIG_SNIPPET,
    keysUrl: 'https://dashboard.stripe.com/apikeys',
    scaffoldFiles: [
      { path: 'app/api/minder/stripe/checkout/route.ts', content: STRIPE_CHECKOUT_ROUTE },
      { path: 'app/api/minder/stripe/webhook/route.ts', content: STRIPE_WEBHOOK_ROUTE },
    ],
  },
  {
    name: 'clerk',
    status: 'experimental',
    envVars: ['CLERK_SECRET_KEY'],
    configSnippet: CLERK_CONFIG_SNIPPET,
    keysUrl: 'https://dashboard.clerk.com',
    scaffoldFiles: [{ path: 'app/api/minder/clerk/verify/route.ts', content: CLERK_VERIFY_ROUTE }],
  },
  {
    name: 'firebase',
    status: 'experimental',
    envVars: ['GOOGLE_APPLICATION_CREDENTIALS'],
    configSnippet: FIREBASE_CONFIG_SNIPPET,
    keysUrl: 'https://console.firebase.google.com',
    scaffoldFiles: [{ path: 'app/api/minder/firebase/health/route.ts', content: FIREBASE_HEALTH_ROUTE }],
    // Firebase is the first provider whose credential is a FILE (a
    // service-account JSON), not a plain env-var string — cmdAdd prints this
    // via the generic `extraNote` field (see cmdAdd) so the file-vs-string
    // distinction isn't buried in the config snippet alone.
    extraNote:
      'Firebase uses a service-account JSON FILE — set GOOGLE_APPLICATION_CREDENTIALS to its path ' +
      '(or base64 into an env var). NEVER commit the file.',
  },
  {
    name: 'razorpay',
    status: 'experimental',
    envVars: ['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    configSnippet: RAZORPAY_CONFIG_SNIPPET,
    keysUrl: 'https://dashboard.razorpay.com/app/website-app-settings/api-keys',
    scaffoldFiles: [
      { path: 'app/api/minder/razorpay/order/route.ts', content: RAZORPAY_ORDER_ROUTE },
      { path: 'app/api/minder/razorpay/webhook/route.ts', content: RAZORPAY_WEBHOOK_ROUTE },
    ],
  },
  {
    name: 'sentry',
    status: 'experimental',
    // Sentry's DSN is a PUBLIC client value (NEXT_PUBLIC_SENTRY_DSN), not a
    // secret env var — there is nothing here for `minder doctor`/env-example
    // scaffolding to track, so this is intentionally empty.
    envVars: [],
    configSnippet: SENTRY_CONFIG_SNIPPET,
    keysUrl: 'https://sentry.io/settings/',
    // Sentry is a client observability plugin, not a server capability
    // contract — there's no server route to scaffold, so this key is
    // intentionally omitted (see cmdAdd's guard for providers without it).
    extraNote:
      'Sentry is a client observability plugin — no server route or secret key. The DSN is public. ' +
      'Call registerSentryProvider({ dsn }) in your app entry.',
  },
];

const ENV_EXAMPLE_SECTION_MARKER = '# minder providers';

const CONFIG_TEMPLATE = `/**
 * Minder configuration.
 *
 * Generated by \`minder init\`. See docs/providers/CATALOG.md for the
 * current provider catalog — nothing is certified yet, so \`providers\`
 * starts empty. Run \`minder add <provider>\` once a provider ships to
 * scaffold its config here.
 */
import { configureMinder } from 'minder-data-provider';

export default configureMinder({
  providers: {
    // Add providers here once they're certified — see
    // docs/providers/CATALOG.md for the current list and status.
  },
});
`;

const HELP_TEXT = `Usage: minder <command> [options]

Commands:
  init [--force]            Write minder.config.ts + a "${ENV_EXAMPLE_SECTION_MARKER}"
                             section in .env.example, and print where to get
                             API keys for each planned provider (none are
                             certified yet — see ${CATALOG_DOC}).
                             Idempotent: skips existing files unless --force.

  add <provider>             Scaffold a provider integration. Currently
                             supports "supabase", "stripe", "clerk",
                             "firebase", "razorpay", and "sentry" (all
                             EXPERIMENTAL — not yet certified; stripe, clerk,
                             firebase, and razorpay also scaffold Next.js App
                             Router route handlers; sentry is a client
                             plugin with no server route). Every other
                             provider name exits 1 — see ${CATALOG_DOC}.

  doctor [--config <path>]  Check that provider credentials referenced by
                             your config are present in the environment.
                             Reads an optional plain JSON config file
                             (--config path/to/file.json) or falls back to
                             scanning .env.example for variable names.
                             Prints a masked table (kind + first 4 chars +
                             '***' + present/missing) — never raw values —
                             and exits 1 if any referenced variable is
                             missing.
                             NOTE: minder.config.ts (TypeScript) is not
                             read by doctor yet — only a plain JSON
                             --config file or .env.example are supported.
                             Full TS-config loading arrives with the first
                             provider wave.

Run with no arguments (or --help / -h) to show this message.
`;

// ── shared helpers ──────────────────────────────────────────────────────────

function resolveIo(io) {
  return {
    stdout: (io && io.stdout) || process.stdout,
    stderr: (io && io.stderr) || process.stderr,
    cwd: (io && io.cwd) || process.cwd(),
  };
}

/**
 * Create files (never overwriting existing ones unless `opts.force`),
 * creating parent directories as needed. Used directly by `minder init` for
 * minder.config.ts, and is the machinery `minder add <provider>` will use
 * once provider scaffolds exist.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {{force?: boolean, cwd?: string}} [opts]
 * @returns {{written: string[], skipped: string[]}}
 */
function writeScaffold(files, opts) {
  const options = opts || {};
  const cwd = options.cwd || process.cwd();
  const force = Boolean(options.force);

  const written = [];
  const skipped = [];

  for (const file of files) {
    const target = path.resolve(cwd, file.path);
    const exists = fs.existsSync(target);

    if (exists && !force) {
      skipped.push(file.path);
      continue;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, 'utf8');
    written.push(file.path);
  }

  return { written, skipped };
}

// ── `minder init` ───────────────────────────────────────────────────────────

function buildEnvExampleSection() {
  const lines = [
    ENV_EXAMPLE_SECTION_MARKER,
    '#',
    '# Provider credentials go here once you add a provider with `minder add`.',
    '# No providers are certified yet — see docs/providers/CATALOG.md for the',
    "# current catalog and status. Get API keys from each provider's dashboard:",
  ];
  for (const entry of KEY_SOURCE_REGISTRY) {
    lines.push(`#   ${entry.name}: ${entry.keysUrl}`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

/**
 * Create-or-append a marker-delimited section in .env.example. Unlike
 * `writeScaffold` (whole-file, no-clobber), this file may already exist
 * with unrelated content (e.g. from `npm run generate:env-example`), so we
 * append rather than overwrite — and only skip when a section with this
 * exact `marker` is already present. Shared by `writeEnvExampleSection`
 * (minder init's provider key-source pointer block) and
 * `writeProviderEnvVars` (minder add's per-provider env var block) — same
 * idempotent-append / --force-replace semantics, different marker + body.
 */
function appendEnvExampleSection(cwd, marker, body, force) {
  const envPath = path.resolve(cwd, '.env.example');
  const exists = fs.existsSync(envPath);
  const current = exists ? fs.readFileSync(envPath, 'utf8') : null;
  const hasSection = current !== null && current.includes(marker);

  if (hasSection && !force) {
    return { written: false };
  }

  let base = current;
  if (base === null) {
    base = '# .env.example\n';
  } else if (hasSection) {
    // --force: strip the previous section before appending a fresh copy.
    const idx = base.indexOf(marker);
    base = base.slice(0, idx).replace(/\s+$/, '') + '\n';
  }

  const next = (base.endsWith('\n') ? base : base + '\n') + body;
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, next, 'utf8');
  return { written: true };
}

function writeEnvExampleSection(cwd, force) {
  return appendEnvExampleSection(cwd, ENV_EXAMPLE_SECTION_MARKER, buildEnvExampleSection(), force);
}

/**
 * Build the per-provider ".env.example" section for `minder add <provider>`
 * — a distinct marker from `ENV_EXAMPLE_SECTION_MARKER` so it can coexist
 * with (and doesn't get clobbered by) `minder init`'s section, and so
 * `minder add`-ing a second provider later doesn't strip this one. Emits
 * real, uncommented `NAME=` lines (not just comments) so `minder doctor`'s
 * .env.example fallback scan picks them up.
 */
function buildProviderEnvSection(provider) {
  const marker = `# minder provider: ${provider.name}`;
  const lines = [
    marker,
    '#',
    `# ${provider.name} — status: ${provider.status} (not yet certified). See ${CATALOG_DOC}.`,
  ];
  for (const envVar of provider.envVars) {
    lines.push(`${envVar}=`);
  }
  lines.push('');
  return { marker, body: lines.join('\n') + '\n' };
}

function writeProviderEnvVars(cwd, provider, force) {
  const { marker, body } = buildProviderEnvSection(provider);
  return appendEnvExampleSection(cwd, marker, body, force);
}

function printKeySourceTable(stdout) {
  stdout.write('\nKey sources (see docs/providers/CATALOG.md for full status):\n');
  const nameWidth = KEY_SOURCE_REGISTRY.reduce((w, e) => Math.max(w, e.name.length), 'Provider'.length);
  const statusWidth = KEY_SOURCE_REGISTRY.reduce(
    (w, e) => Math.max(w, (e.status || 'planned').length),
    'Status'.length
  );
  stdout.write(`  ${'Provider'.padEnd(nameWidth)}  ${'Status'.padEnd(statusWidth)}  Keys URL\n`);
  for (const entry of KEY_SOURCE_REGISTRY) {
    const status = entry.status || 'planned';
    stdout.write(`  ${entry.name.padEnd(nameWidth)}  ${status.padEnd(statusWidth)}  ${entry.keysUrl}\n`);
  }
  stdout.write('\n');
}

function cmdInit(argv, ctx) {
  const { cwd, stdout } = ctx;
  const force = argv.includes('--force');

  const configResult = writeScaffold([{ path: 'minder.config.ts', content: CONFIG_TEMPLATE }], { force, cwd });
  const envResult = writeEnvExampleSection(cwd, force);

  const configWritten = configResult.written.length > 0;
  const envWritten = envResult.written;

  if (!configWritten && !envWritten) {
    stdout.write('minder.config.ts and .env.example already exist — use --force to overwrite.\n');
    printKeySourceTable(stdout);
    return 0;
  }

  const wrote = [];
  if (configWritten) {
    wrote.push('minder.config.ts');
  } else {
    stdout.write('minder.config.ts already exists — use --force to overwrite.\n');
  }

  if (envWritten) {
    wrote.push('.env.example');
  } else {
    stdout.write(`.env.example already has a "${ENV_EXAMPLE_SECTION_MARKER}" section — use --force to overwrite.\n`);
  }

  if (wrote.length > 0) {
    stdout.write(`Wrote: ${wrote.join(', ')}\n`);
  }

  printKeySourceTable(stdout);
  return 0;
}

// ── `minder add` ────────────────────────────────────────────────────────────

/**
 * Scaffold a registered provider (currently Supabase, Stripe, Clerk, and
 * Firebase — see `PROVIDERS`). Unknown provider names (everything not yet in
 * `PROVIDERS`, i.e. everything still `status: 'planned'` in
 * `KEY_SOURCE_REGISTRY`) fall through to the same "no certified providers"
 * catalog message as before — that message is deliberately unchanged so it
 * still reads correctly for the providers it still applies to.
 *
 * For a registered provider this does NOT write minder.config.ts (the user
 * pastes the printed snippet in themselves) — it writes `.env.example`
 * entries for the provider's env vars, and, when the provider entry declares
 * `scaffoldFiles` (route handlers etc. — Supabase has none, Stripe, Clerk,
 * and Firebase do), it also writes those files via `writeScaffold` (no-clobber
 * unless --force, same as `writeScaffold`'s general contract). It prints the
 * config snippet, any scaffolded file paths, an explicit "not yet certified"
 * notice, and — when the provider entry declares one — a generic `extraNote`
 * (currently only Firebase, whose credential is a service-account FILE
 * rather than a plain secret string) so nobody mistakes "installable" for
 * "production ready".
 */
function cmdAdd(argv, ctx) {
  const { cwd, stdout, stderr } = ctx;
  const name = argv[0];
  const force = argv.includes('--force');

  const provider = PROVIDERS.find((p) => p.name === name);
  if (!provider) {
    stderr.write(`No certified providers are available yet — see ${CATALOG_DOC}\n`);
    return 1;
  }

  // Providers with no env vars (e.g. Sentry — its DSN is a public client
  // value, not a secret) get no .env.example section at all: an empty
  // `envVars` array would otherwise still produce a marker + comment block
  // with zero `NAME=` lines, which is just noise.
  if (provider.envVars && provider.envVars.length > 0) {
    writeProviderEnvVars(cwd, provider, force);
  }

  let scaffoldResult = null;
  if (provider.scaffoldFiles && provider.scaffoldFiles.length > 0) {
    scaffoldResult = writeScaffold(provider.scaffoldFiles, { cwd, force });
  }

  stdout.write(`\n${provider.configSnippet}\n`);

  if (scaffoldResult) {
    if (scaffoldResult.written.length > 0) {
      stdout.write('Scaffolded route files:\n');
      for (const file of scaffoldResult.written) {
        stdout.write(`  ${file}\n`);
      }
    }
    if (scaffoldResult.skipped.length > 0) {
      stdout.write('Skipped (already exist — use --force to overwrite):\n');
      for (const file of scaffoldResult.skipped) {
        stdout.write(`  ${file}\n`);
      }
    }
    stdout.write('\n');
  }

  stdout.write(`status: EXPERIMENTAL — not yet certified; flip mock:false when you add real keys\n`);
  stdout.write(`Get your ${provider.name} keys: ${provider.keysUrl}\n`);

  // Generic hook for providers with a note that doesn't fit the config
  // snippet or scaffold-files sections — currently only Firebase (its
  // credential is a service-account FILE, not a plain secret string).
  if (provider.extraNote) {
    stdout.write(`\nNote: ${provider.extraNote}\n`);
  }

  return 0;
}

// ── `minder doctor` ─────────────────────────────────────────────────────────

/**
 * At most the first 4 characters of `name`, plus a fixed mask suffix.
 * Mirrors `maskLabel()` in src/security/credentials.ts exactly — duplicated
 * here (rather than imported) because that module is TS/ESM and this CLI is
 * plain CJS. Keep the two in sync if either changes.
 */
function maskLabel(name) {
  return `${String(name).slice(0, 4)}***`;
}

/**
 * Recognize the plain-JSON credential shapes doctor's --config file may use.
 * Mirrors `isCredentialInput()` in src/security/credentials.ts, minus the
 * `SecretRef` class branch (a JSON file cannot carry a live SecretRef
 * instance) — its `env`-kind equivalent here is a plain
 * `{ kind: 'env', name: string }` object instead.
 */
function isCredentialLike(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v.kind === 'env') return typeof v.name === 'string' && v.name.length > 0;
  if (v.kind === 'serverConfig') return typeof v.key === 'string' && v.key.length > 0;
  if (v.kind === 'file') {
    return (v.source === 'path' || v.source === 'envJson') && typeof v.ref === 'string' && v.ref.length > 0;
  }
  return false;
}

/**
 * Describe a credential-like value WITHOUT resolving it — mirrors
 * `describeCredential()` in src/security/credentials.ts: masked label +
 * presence boolean only, never the value itself. `envVar` (not part of the
 * upstream shape) names the environment variable this entry's presence was
 * checked against, if any — `doctor`'s exit-code logic uses it to name
 * exactly which var is missing without ever touching its value.
 */
function describeCredentialLike(v) {
  if (v.kind === 'env') {
    return { kind: 'env', label: maskLabel(v.name), present: process.env[v.name] != null, envVar: v.name };
  }
  if (v.kind === 'serverConfig') {
    // Presence is unknowable without the app's own server config object —
    // conservatively reported as not present, same as describeCredential().
    return { kind: 'serverConfig', label: maskLabel(v.key), present: false, envVar: null };
  }
  // v.kind === 'file'
  if (v.source === 'envJson') {
    return { kind: 'file', label: maskLabel(v.ref), present: process.env[v.ref] != null, envVar: v.ref };
  }
  // source === 'path': not an env var — check the filesystem instead.
  return { kind: 'file', label: maskLabel(v.ref), present: fs.existsSync(v.ref), envVar: null };
}

function collectFromJsonConfig(configObj) {
  const rows = [];
  const providers = configObj && typeof configObj === 'object' ? configObj.providers : null;
  if (!providers || typeof providers !== 'object') return rows;

  const walk = (value, pathParts) => {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return;

    if (isCredentialLike(value)) {
      rows.push({ path: pathParts.join('.'), ...describeCredentialLike(value) });
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      walk(child, [...pathParts, key]);
    }
  };

  for (const [providerName, providerConfig] of Object.entries(providers)) {
    walk(providerConfig, [providerName]);
  }

  return rows;
}

/** Fallback source: variable names mentioned in .env.example, checked against process.env. */
function collectFromEnvExample(cwd) {
  const envExamplePath = path.resolve(cwd, '.env.example');
  if (!fs.existsSync(envExamplePath)) return null;

  const content = fs.readFileSync(envExamplePath, 'utf8');
  const names = new Set();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(trimmed);
    if (match) names.add(match[1]);
  }

  return Array.from(names).map((name) => ({
    path: name,
    kind: 'env',
    label: maskLabel(name),
    present: process.env[name] != null,
    envVar: name,
  }));
}

function renderDoctorTable(stdout, rows) {
  stdout.write('\nProvider credential check:\n');
  if (rows.length === 0) {
    stdout.write('  (nothing to check)\n\n');
    return;
  }
  for (const row of rows) {
    const status = row.present ? 'present' : 'MISSING';
    stdout.write(`  ${row.kind.padEnd(12)} ${row.label.padEnd(10)} ${status.padEnd(8)} (${row.path})\n`);
  }
  stdout.write('\n');
}

function cmdDoctor(argv, ctx) {
  const { cwd, stdout, stderr } = ctx;
  const configFlagIdx = argv.indexOf('--config');
  const configPath = configFlagIdx !== -1 ? argv[configFlagIdx + 1] : null;

  if (configFlagIdx !== -1 && !configPath) {
    stderr.write('minder doctor: --config requires a path argument.\n');
    return 1;
  }

  let rows;
  let source;

  if (configPath) {
    const resolved = path.resolve(cwd, configPath);
    if (!fs.existsSync(resolved)) {
      stderr.write(`minder doctor: config file not found: ${configPath}\n`);
      return 1;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch {
      stderr.write(`minder doctor: config file is not valid JSON: ${configPath}\n`);
      return 1;
    }

    rows = collectFromJsonConfig(parsed);
    source = configPath;
  } else {
    const fromEnvExample = collectFromEnvExample(cwd);
    if (fromEnvExample === null) {
      stdout.write(
        'minder doctor: no --config given and no .env.example found — nothing to check.\n' +
          '(Note: minder.config.ts is not read by doctor yet — pass a plain JSON --config file instead.)\n'
      );
      return 0;
    }
    rows = fromEnvExample;
    source = '.env.example';
  }

  stdout.write(`minder doctor: checking provider credentials (source: ${source})\n`);
  renderDoctorTable(stdout, rows);

  const missing = rows.filter((row) => !row.present && row.envVar);
  if (missing.length > 0) {
    stderr.write(`minder doctor: missing environment variable(s): ${missing.map((row) => row.envVar).join(', ')}\n`);
    return 1;
  }

  stdout.write('minder doctor: all referenced credentials are present.\n');
  return 0;
}

// ── `minder --help` / no args ───────────────────────────────────────────────

function cmdHelp(ctx) {
  ctx.stdout.write(HELP_TEXT);
  return 0;
}

// ── dispatcher ───────────────────────────────────────────────────────────────

/**
 * CLI entry point. Never calls `process.exit` — returns the exit code so
 * callers (bin/minder.js, tests) decide what to do with it.
 *
 * @param {string[]} argv - command + args, e.g. ['init', '--force']
 * @param {{cwd?: string, stdout?: {write: Function}, stderr?: {write: Function}}} [io]
 * @returns {number} exit code
 */
function main(argv, io) {
  const ctx = resolveIo(io);
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    return cmdHelp(ctx);
  }

  switch (command) {
    case 'init':
      return cmdInit(rest, ctx);
    case 'add':
      return cmdAdd(rest, ctx);
    case 'doctor':
      return cmdDoctor(rest, ctx);
    default:
      ctx.stderr.write(`minder: unknown command "${command}"\n\n`);
      cmdHelp(ctx);
      return 1;
  }
}

if (require.main === module) {
  const exitCode = main(process.argv.slice(2));
  process.exit(exitCode);
}

module.exports = {
  main,
  cmdInit,
  cmdAdd,
  cmdDoctor,
  cmdHelp,
  writeScaffold,
  KEY_SOURCE_REGISTRY,
  PROVIDERS,
  CONFIG_TEMPLATE,
  ENV_EXAMPLE_SECTION_MARKER,
  maskLabel,
  isCredentialLike,
  describeCredentialLike,
  collectFromJsonConfig,
  collectFromEnvExample,
  CATALOG_DOC,
};
