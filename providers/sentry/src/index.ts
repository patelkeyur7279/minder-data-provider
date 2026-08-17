/**
 * @minder/provider-sentry — the Sentry observability adapter. DIFFERENT SHAPE
 * from the capability-contract providers (Stripe, Supabase, Firebase, Clerk):
 * Sentry is error tracking, so it registers a `MinderPlugin` on the existing
 * plugin bus (`src/plugins/PluginSystem.ts` — `onError`/`onRequest`/`onResponse`
 * observability hooks) instead of a `PaymentsContract`/`AuthContract`/etc.
 * There is NO `src/contracts` involvement here — only the plugin bus's PUBLIC
 * API (`pluginManager`, `MinderPlugin`, `PluginError`, …).
 *
 * `registerSentryProvider(config?)` builds a plugin whose `onError` forwards
 * MDP errors (fired by `ApiClient`/`MinderClient` on request failure — see
 * `src/core/ApiClient.ts#emitPluginError`) to `Sentry.captureException`, and
 * whose `onRequest`/`onResponse` optionally leave breadcrumbs. Three delivery
 * modes, chosen per call:
 *
 *   1. `mock: true`          → forwards to the in-memory sink in ./mock.ts
 *                               (zero SDK, zero DSN, zero network).
 *   2. `createSentryFactory` → a DI seam: forwards to whatever
 *                               `{ captureException, captureMessage? }` object
 *                               the factory returns (tests / custom transports).
 *   3. otherwise              → lazily imports the optional peer
 *                               `@sentry/browser`, calls `Sentry.init({ dsn })`
 *                               once, and forwards to `Sentry.captureException`.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * `@sentry/browser` is reached ONLY via a dynamic `import()` behind a variable
 * specifier (never a static import) — this module has no static SDK dependency
 * and stays importable in web/edge bundles that never touch Sentry.
 *
 * ── SDK-MISSING BEHAVIOR (design decision) ───────────────────────────────────
 * Unlike Stripe's `getProviderClient()` (which THROWS a "npm i stripe" message
 * because a missing SDK there means a payment literally cannot be created),
 * a missing `@sentry/browser` here DEGRADES GRACEFULLY: `onError` logs one
 * `console.warn` with the install hint and returns, instead of throwing. An
 * observability plugin failing to install must never be able to break the
 * primary request pipeline it's observing — an app whose errors silently stop
 * reaching Sentry is a worse failure mode than one whose errors also crash the
 * error handler itself. `getProviderClient()` mirrors this: it resolves to
 * `null` (not a rejected promise) when the SDK is unavailable.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * `dsn` is PUBLIC BY DESIGN — like a Firebase `apiKey` or Stripe's
 * `publishableKey`. A Sentry DSN identifies which project to send events to;
 * it grants no read access to existing data and is meant to ship in client
 * bundles (Sentry's own SDKs read it straight out of browser config). It is
 * registered `clientSafe` below and there is no `serverOnly` credential for
 * this provider — server-side Sentry usage reads the same DSN.
 *
 * NO OVER-FORWARDING: the plugin bus's `PluginError.request` can carry request
 * headers (e.g. `Authorization`) and body payloads — internal MDP transport
 * detail that must never leave the process just because an error happened.
 * `toReportableError()` below deliberately narrows what reaches Sentry to
 * `message` / `code` / `stack` only; `request` is NEVER read or forwarded.
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package imports these from `minder-data-provider` subpaths
 * instead; the runtime shapes are identical.
 */
import { pluginManager } from '../../../src/plugins/PluginSystem.js';
import type { MinderPlugin, PluginError, PluginRequest, PluginResponse } from '../../../src/plugins/PluginSystem.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { createSentryMockClient } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. `dsn`
// is public by design (see header comment) and `mock` is a plain boolean flag
// — neither is a real credential. Runs once, at import time.
registerClientSafeProviderKeys('sentry', ['dsn', 'mock']);

/** The shape a "Sentry-like" client must expose — the real SDK, the in-memory
 *  mock sink, and any `createSentryFactory` DI object all satisfy this. */
export interface SentryLikeClient {
  captureException: (e: unknown) => void;
  captureMessage?: (m: string) => void;
}

export interface SentryProviderConfig {
  /** DSN — clientSafe, PUBLIC by design (see header comment). */
  dsn?: string;
  /** When true, forward to the in-memory mock sink (./mock.ts) instead of the SDK. */
  mock?: boolean;
  /** DI seam: supply a custom (or fake, for tests) Sentry-like client instead
   *  of lazily importing `@sentry/browser`. Takes precedence over `dsn`. */
  createSentryFactory?: () => SentryLikeClient;
  /** Forward onRequest/onResponse as Sentry breadcrumbs (real SDK only; safe
   *  fields only — never headers/body). Defaults to true. */
  breadcrumbs?: boolean;
}

const PROVIDER_NAME = '@minder/provider-sentry';
const PROVIDER_VERSION = '0.1.0';

/** The optional-peer SDK specifier, kept in a variable so it is resolved
 *  purely at runtime — never statically type-resolved (the peer may be
 *  uninstalled) and never statically bundled (edge-safe). */
const SENTRY_SDK = '@sentry/browser';

const SDK_MISSING_MESSAGE =
  '[Minder] @minder/provider-sentry: @sentry/browser is not installed — errors are being ' +
  'logged locally instead of forwarded to Sentry. Install the optional peer to restore ' +
  'forwarding: npm i @sentry/browser';

// Minimal shape of the `@sentry/browser` module surface this adapter uses.
interface SentrySdkModule {
  init?: (options: { dsn?: string }) => void;
  captureException: (e: unknown) => void;
  captureMessage?: (m: string) => void;
  addBreadcrumb?: (breadcrumb: Record<string, unknown>) => void;
}

// Module-level cache so `Sentry.init()` runs at most once per DSN, and so
// repeated onError/onRequest/onResponse calls reuse the same loaded module
// instead of re-importing it. `undefined` = not attempted yet; `null` = the
// import was attempted and failed (SDK missing).
let cachedSdkModule: SentrySdkModule | null | undefined;
let cachedSdkDsn: string | undefined;
let sdkMissingWarned = false;

/** Lazily import `@sentry/browser`, `init()` it once per DSN, and cache the
 *  module. Returns `null` (never throws) if the SDK is not installed. */
async function loadRealSentrySdk(dsn: string | undefined): Promise<SentrySdkModule | null> {
  if (cachedSdkModule !== undefined && cachedSdkDsn === dsn) {
    return cachedSdkModule;
  }

  let mod: SentrySdkModule;
  try {
    mod = (await import(SENTRY_SDK)) as unknown as SentrySdkModule;
  } catch {
    if (!sdkMissingWarned) {
      sdkMissingWarned = true;
      console.warn(SDK_MISSING_MESSAGE);
    }
    cachedSdkModule = null;
    cachedSdkDsn = dsn;
    return null;
  }

  if (typeof mod.init === 'function') {
    mod.init({ dsn });
  }
  cachedSdkModule = mod;
  cachedSdkDsn = dsn;
  return mod;
}

/** Test-only: forget the cached real-SDK module + missing-SDK warning state,
 *  so tests can exercise the "SDK missing" and "SDK present" paths in isolation. */
export function __resetSentrySdkCache(): void {
  cachedSdkModule = undefined;
  cachedSdkDsn = undefined;
  sdkMissingWarned = false;
}

/**
 * Resolve the effective Sentry-like client for `config`: the mock sink
 * (`mock: true`), the DI factory (`createSentryFactory`), or the real SDK —
 * in that precedence order. Returns `null` (never throws) when the real SDK
 * is requested but not installed (graceful degrade — see header comment).
 */
async function resolveSentryClient(config: SentryProviderConfig): Promise<SentryLikeClient | null> {
  if (config.mock === true) {
    return createSentryMockClient();
  }
  if (typeof config.createSentryFactory === 'function') {
    return config.createSentryFactory();
  }
  const mod = await loadRealSentrySdk(config.dsn);
  if (!mod) return null;
  return {
    captureException: (e) => mod.captureException(e),
    captureMessage: mod.captureMessage ? (m) => mod.captureMessage?.(m) : undefined,
  };
}

/**
 * Narrow a plugin-bus `PluginError` down to what is safe to hand to Sentry:
 * `message`, `code`, and `stack` ONLY. `error.request` (method/url/headers/
 * body/timestamp — potentially carrying auth headers or request bodies) is
 * NEVER read here. See the "NO OVER-FORWARDING" note in the header comment.
 */
function toReportableError(error: PluginError): Error {
  const err = new Error(typeof error.message === 'string' && error.message.length > 0 ? error.message : 'MDP request error');
  if (typeof error.code === 'string' && error.code.length > 0) {
    (err as Error & { code?: string }).code = error.code;
  }
  if (typeof error.stack === 'string' && error.stack.length > 0) {
    err.stack = error.stack;
  }
  return err;
}

/** Build a safe (headers/body-free) breadcrumb payload from a plugin request. */
function requestBreadcrumb(request: PluginRequest): Record<string, unknown> {
  return {
    category: 'http',
    type: 'http',
    data: { method: request.method, url: request.url },
    timestamp: request.timestamp / 1000,
  };
}

/** Build a safe (headers/body-free) breadcrumb payload from a plugin response. */
function responseBreadcrumb(response: PluginResponse): Record<string, unknown> {
  return {
    category: 'http',
    type: 'http',
    data: { status: response.status, duration: response.duration },
    timestamp: response.timestamp / 1000,
  };
}

/** Best-effort breadcrumb: only the real SDK exposes `addBreadcrumb`; mock
 *  sink and DI factories are not required to. Never throws. */
async function addBreadcrumbIfSupported(config: SentryProviderConfig, breadcrumb: Record<string, unknown>): Promise<void> {
  if (config.breadcrumbs === false) return;
  if (config.mock === true || typeof config.createSentryFactory === 'function') return;
  try {
    const mod = await loadRealSentrySdk(config.dsn);
    mod?.addBreadcrumb?.(breadcrumb);
  } catch {
    // Breadcrumbs are best-effort observability — never let this throw.
  }
}

/** Build the `MinderPlugin` that forwards plugin-bus events to Sentry. */
function buildSentryPlugin(config: SentryProviderConfig): MinderPlugin {
  return {
    name: PROVIDER_NAME,
    version: PROVIDER_VERSION,
    manifest: {
      name: PROVIDER_NAME,
      version: PROVIDER_VERSION,
      capabilities: ['crash-reporting'],
      runtime: 'isomorphic',
      peerDependencies: [SENTRY_SDK],
    },

    onError: async (error: PluginError) => {
      const client = await resolveSentryClient(config);
      if (!client) return; // SDK missing — already warned once, degrade gracefully.
      try {
        client.captureException(toReportableError(error));
      } catch (err) {
        console.warn(
          '[Minder] @minder/provider-sentry: captureException threw.',
          err instanceof Error ? err.message : String(err)
        );
      }
    },

    onRequest: (request: PluginRequest) => {
      void addBreadcrumbIfSupported(config, requestBreadcrumb(request));
    },

    onResponse: (response: PluginResponse) => {
      void addBreadcrumbIfSupported(config, responseBreadcrumb(response));
    },
  };
}

/**
 * Server-only-in-spirit but callable anywhere: return the resolved
 * Sentry-like client (the real SDK's exports, the mock sink, or the DI
 * factory's object) for the most recently registered provider. Resolves to
 * `null` when the real SDK is requested but not installed.
 */
export async function getProviderClient(): Promise<SentryLikeClient | null> {
  if (!activeConfig) {
    throw new Error(
      '[Minder] Sentry getProviderClient(): no provider registered — call registerSentryProvider() first.'
    );
  }
  return resolveSentryClient(activeConfig);
}

// The most-recently-registered config, used only by the `getProviderClient()`
// escape hatch.
let activeConfig: SentryProviderConfig | undefined;

/**
 * Register the Sentry provider as a `MinderPlugin` on the global
 * `pluginManager` (`src/plugins/PluginSystem.ts`). NOT a capability contract —
 * `src/contracts` is never touched.
 *
 * - `config` omitted → read `getProviderConfig('sentry')` (global Minder config).
 * - `mock: true` → `onError` forwards to the in-memory sink (./mock.ts).
 * - `createSentryFactory` → `onError` forwards to that DI object.
 * - otherwise → `onError` lazily loads `@sentry/browser`, calls `Sentry.init({dsn})`
 *   once, and forwards to `Sentry.captureException`.
 *
 * Returns an `unregister()` that removes the plugin from `pluginManager`.
 */
export function registerSentryProvider(config?: SentryProviderConfig): () => void {
  let effective: SentryProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('sentry');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<SentryProviderConfig>;
      effective = {
        dsn: typeof raw.dsn === 'string' ? raw.dsn : undefined,
        createSentryFactory: raw.createSentryFactory,
        breadcrumbs: raw.breadcrumbs,
        mock: fromGlobal.mock,
      };
    }
  }

  effective = effective ?? {};
  activeConfig = effective;

  const plugin = buildSentryPlugin(effective);
  pluginManager.register(plugin);

  return () => {
    pluginManager.unregister(plugin.name);
  };
}
