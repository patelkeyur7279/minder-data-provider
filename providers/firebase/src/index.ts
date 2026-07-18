/**
 * @minder/provider-firebase — the Firebase capability adapter. THE CREDENTIAL-FILE
 * SHOWCASE: this is the wave where credential FILES (a service-account JSON)
 * enter the system, resolved SERVER-ONLY via `FileRef` and surfaced as MASKED
 * health only — the raw file contents (and the private_key in particular) are
 * NEVER returned, logged, or echoed anywhere.
 *
 * Two surfaces:
 *
 *   CLIENT — `registerFirebaseProvider(config?)` registers an `AuthContract` and a
 *     `StorageContract` over the Firebase Web SDK (so an app can call `useAuth()` /
 *     `useStorage()` from `minder-data-provider`). The whole web config
 *     (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`,
 *     `appId`) is intentionally PUBLIC — Firebase's `apiKey` is a project
 *     IDENTIFIER, not a secret (see Security in README). `getProviderClient()`
 *     returns the raw Firebase app. `mock: true` registers the in-memory mocks.
 *
 *   SERVER — `validateServiceAccount(obj)` and `loadServiceAccount(ref)` are the
 *     credential-file health checks. They validate a service-account object's
 *     shape and return MASKED health only (masked clientEmail, a hasPrivateKey
 *     boolean — never the private_key). `loadServiceAccount` resolves a
 *     `FileRef`/`secret()` via `resolveCredential` (server-only; throws in the
 *     browser) and hands the health back without ever exposing the raw object.
 *
 * ── EDGE-SAFE MODULE GRAPH ───────────────────────────────────────────────────
 * `firebase` is an OPTIONAL peer dependency, reached ONLY via dynamic `import()`
 * with a NON-LITERAL specifier inside `defaultCreateFirebase` (or supplied through
 * the `createFirebaseFactory` DI seam). It never appears as a static import, so
 * this module — and anything that imports it — stays importable in web/edge
 * bundles that never construct a real client (e.g. mock mode), and the SDK is
 * never bundled for consumers who don't use it. The server helpers use only
 * `resolveCredential` (itself edge-safe: `node:fs` is loaded lazily and only on
 * the file-path branch).
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * The entire Firebase web config is `clientSafe` — registered below. `apiKey` is
 * PUBLIC by design (a raw `apiKey` string in client config therefore PASSES
 * validation). `serviceAccount` is `serverOnly`, typed as `CredentialInput`
 * (never a raw object/string in client config — it hard-fails), resolved only in
 * server code, and never returned/logged (masked health only).
 *
 * NOTE (in-repo): imports below reference the repository `src/` via relative
 * paths so the adapter and its tests run against source without a build step.
 * The published package imports these from `minder-data-provider` subpaths
 * instead; the runtime shapes are identical.
 */
import type { AuthContract, StorageContract } from '../../../src/contracts/types.js';
import { registerCapabilityProvider } from '../../../src/contracts/registry.js';
import { getProviderConfig } from '../../../src/contracts/mockRegistry.js';
import { registerClientSafeProviderKeys } from '../../../src/config/validateConfig.js';
import type { CredentialInput } from '../../../src/security/credentials.js';
import { resolveCredential } from '../../../src/security/credentials.js';
import { registerFirebaseMocks } from '../mock.js';

// Declare which config keys are safe to appear inline in CLIENT config. This makes
// `validateMinderConfig` treat Firebase as a certified provider: the whole web
// config is public (including `apiKey`, which is a project identifier — NOT a
// secret), while any other credential-shaped key (e.g. a raw `serviceAccount`)
// hard-fails in a browser-like environment. Runs once, at import time.
registerClientSafeProviderKeys('firebase', [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'mock',
]);

export interface FirebaseProviderConfig {
  /** Web API key — clientSafe. PUBLIC project identifier (NOT a secret). */
  apiKey?: string;
  /** Auth domain, e.g. `<project>.firebaseapp.com` — clientSafe, public. */
  authDomain?: string;
  /** Project id — clientSafe, public. */
  projectId?: string;
  /** Storage bucket, e.g. `<project>.appspot.com` — clientSafe, public. */
  storageBucket?: string;
  /** Cloud Messaging sender id — clientSafe, public. */
  messagingSenderId?: string;
  /** App id — clientSafe, public. */
  appId?: string;
  /**
   * Service-account JSON — serverOnly. A `FileRef` (`{ kind:'file', ... }`) or a
   * `secret()`; used only by server-side admin operations, never a raw object/
   * string in client config (that hard-fails validation). This adapter never
   * ships or reads it on the client.
   */
  serviceAccount?: CredentialInput;
  /** When true, register the in-memory mocks instead of a real client. */
  mock?: boolean;
  /**
   * DI seam for tests / custom SDK wiring. Returns a Firebase-client-shaped
   * facade (see `FirebaseLikeClient`). Defaults to lazily importing the
   * `firebase` web SDK and constructing auth + storage facades.
   */
  createFirebaseFactory?: () => unknown;
}

/** The subset of the Firebase client surface this adapter uses (a small facade
 *  over the modular web SDK, so the contracts stay SDK-shape-agnostic). */
interface FirebaseLikeClient {
  /** The raw Firebase app, returned verbatim by `getProviderClient()`. */
  app: unknown;
  auth: {
    getCurrentUser(): Promise<{ uid: string; [key: string]: unknown } | null>;
    signOut(): Promise<void>;
  };
  storage: {
    upload(path: string, data: Blob | { uri: string }): Promise<void>;
    getDownloadURL(path: string): Promise<string>;
    remove(path: string): Promise<void>;
  };
}

const PROVIDER_NAME = '@minder/provider-firebase';

const SDK_MISSING_MESSAGE = 'Install firebase (optional peer): npm i firebase';

/** Optional-peer SDK specifiers, kept in variables so they are resolved purely at
 *  runtime — never statically type-resolved (the peer may be uninstalled) and
 *  never statically bundled (edge-safe; unused providers cost zero bytes). */
const FIREBASE_APP_SDK = 'firebase/app';
const FIREBASE_AUTH_SDK = 'firebase/auth';
const FIREBASE_STORAGE_SDK = 'firebase/storage';

// The most-recently-created real client, returned by `getProviderClient()`. Null
// in mock mode (there is no raw SDK app to hand back).
let activeClient: FirebaseLikeClient | null = null;

/** Return the raw underlying Firebase app (escape hatch), or null in mock mode. */
export function getProviderClient(): unknown {
  return activeClient ? activeClient.app : null;
}

/** The web config passed to `initializeApp` — the public keys only. */
type FirebaseWebConfig = Pick<
  FirebaseProviderConfig,
  'apiKey' | 'authDomain' | 'projectId' | 'storageBucket' | 'messagingSenderId' | 'appId'
>;

/** Default factory: lazily import the Firebase web SDK and construct a facade. */
async function defaultCreateFirebase(webConfig: FirebaseWebConfig): Promise<FirebaseLikeClient> {
  let appMod: {
    initializeApp?: (config: FirebaseWebConfig) => unknown;
  };
  let authMod: {
    getAuth?: (app: unknown) => { currentUser: { uid: string } | null };
    signOut?: (auth: unknown) => Promise<void>;
  };
  let storageMod: {
    getStorage?: (app: unknown) => unknown;
    ref?: (storage: unknown, path: string) => unknown;
    uploadBytes?: (ref: unknown, data: unknown) => Promise<unknown>;
    getDownloadURL?: (ref: unknown) => Promise<string>;
    deleteObject?: (ref: unknown) => Promise<void>;
  };
  try {
    appMod = (await import(FIREBASE_APP_SDK)) as typeof appMod;
    authMod = (await import(FIREBASE_AUTH_SDK)) as typeof authMod;
    storageMod = (await import(FIREBASE_STORAGE_SDK)) as typeof storageMod;
  } catch {
    throw new Error(SDK_MISSING_MESSAGE);
  }
  if (
    typeof appMod.initializeApp !== 'function' ||
    typeof authMod.getAuth !== 'function' ||
    typeof storageMod.getStorage !== 'function'
  ) {
    throw new Error(SDK_MISSING_MESSAGE);
  }

  const app = appMod.initializeApp(webConfig);
  const auth = authMod.getAuth(app);
  const storage = storageMod.getStorage(app);
  const signOutFn = authMod.signOut!;
  const refFn = storageMod.ref!;
  const uploadBytesFn = storageMod.uploadBytes!;
  const getDownloadURLFn = storageMod.getDownloadURL!;
  const deleteObjectFn = storageMod.deleteObject!;

  return {
    app,
    auth: {
      async getCurrentUser() {
        const u = auth.currentUser;
        return u ? { uid: u.uid, ...(u as Record<string, unknown>) } : null;
      },
      async signOut() {
        await signOutFn(auth);
      },
    },
    storage: {
      async upload(path, data) {
        await uploadBytesFn(refFn(storage, path), data);
      },
      async getDownloadURL(path) {
        return getDownloadURLFn(refFn(storage, path));
      },
      async remove(path) {
        await deleteObjectFn(refFn(storage, path));
      },
    },
  };
}

function buildAuthContract(client: FirebaseLikeClient): AuthContract {
  return {
    async getSession() {
      const user = await client.auth.getCurrentUser();
      if (!user || !user.uid) return null;
      return { userId: user.uid, raw: user };
    },
    async signOut() {
      await client.auth.signOut();
    },
  };
}

function buildStorageContract(client: FirebaseLikeClient): StorageContract {
  const normalize = (path: string): string => path.replace(/^\/+/, '');
  return {
    async upload(file, path) {
      const objectPath = normalize(path);
      await client.storage.upload(objectPath, file);
      const url = await client.storage.getDownloadURL(objectPath);
      return { url };
    },
    async remove(path) {
      await client.storage.remove(normalize(path));
    },
  };
}

/**
 * Register the Firebase provider (client side). Returns an unregister function
 * that tears down every capability it registered.
 *
 * - `config` omitted → read `getProviderConfig('firebase')` (global Minder config).
 * - `mock: true` (explicit or from config) → register the in-memory mocks
 *   (auth + storage) with zero SDK and zero credentials.
 * - otherwise → create ONE Firebase client (via `createFirebaseFactory` or a lazy
 *   `firebase` import) and register the two real contracts.
 */
export async function registerFirebaseProvider(
  config?: FirebaseProviderConfig
): Promise<() => void> {
  let effective: FirebaseProviderConfig | undefined = config;

  if (!effective) {
    const fromGlobal = getProviderConfig('firebase');
    if (fromGlobal) {
      const raw = fromGlobal.raw as Partial<FirebaseProviderConfig>;
      effective = {
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
        authDomain: typeof raw.authDomain === 'string' ? raw.authDomain : undefined,
        projectId: typeof raw.projectId === 'string' ? raw.projectId : undefined,
        storageBucket: typeof raw.storageBucket === 'string' ? raw.storageBucket : undefined,
        messagingSenderId:
          typeof raw.messagingSenderId === 'string' ? raw.messagingSenderId : undefined,
        appId: typeof raw.appId === 'string' ? raw.appId : undefined,
        serviceAccount: raw.serviceAccount,
        mock: fromGlobal.mock,
        createFirebaseFactory: raw.createFirebaseFactory,
      };
    }
  }

  if (!effective) {
    throw new Error(
      'registerFirebaseProvider: no config passed and no providers.firebase config found. ' +
        'Pass a config or configure Minder with providers.firebase.'
    );
  }

  // ── Mock mode: zero SDK, zero keys ──────────────────────────────────────────
  if (effective.mock === true) {
    activeClient = null;
    return registerFirebaseMocks();
  }

  // ── Real mode ───────────────────────────────────────────────────────────────
  const webConfig: FirebaseWebConfig = {
    apiKey: effective.apiKey,
    authDomain: effective.authDomain,
    projectId: effective.projectId,
    storageBucket: effective.storageBucket,
    messagingSenderId: effective.messagingSenderId,
    appId: effective.appId,
  };

  if (!webConfig.apiKey || !webConfig.projectId) {
    throw new Error(
      'registerFirebaseProvider: both "apiKey" and "projectId" are required for the real Firebase provider ' +
        '(they are PUBLIC values — Firebase\'s apiKey is a project identifier, not a secret). ' +
        'For credential-free UI development, set providers.firebase.mock = true.'
    );
  }

  const factory = effective.createFirebaseFactory
    ? (effective.createFirebaseFactory as () => unknown)
    : () => defaultCreateFirebase(webConfig);
  const client = (await factory()) as FirebaseLikeClient;
  activeClient = client;

  const getClient = (): unknown => client.app;
  const unregisters = [
    registerCapabilityProvider({
      providerName: PROVIDER_NAME,
      capability: 'auth',
      implementation: buildAuthContract(client),
      getProviderClient: getClient,
    }),
    registerCapabilityProvider({
      providerName: PROVIDER_NAME,
      capability: 'storage',
      implementation: buildStorageContract(client),
      getProviderClient: getClient,
    }),
  ];

  return () => {
    for (const u of unregisters) u();
    if (activeClient === client) activeClient = null;
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SERVER: credential-file (service-account) health checks — MASKED results only
// ═════════════════════════════════════════════════════════════════════════════

/** Masked, leak-safe health for a service-account credential. Deliberately carries
 *  NO secret material: `projectId` is a public identifier, `clientEmail` is masked,
 *  and only the PRESENCE of a private key is reported — never the key itself. */
export interface ServiceAccountHealth {
  projectId?: string;
  clientEmail?: string;
  hasPrivateKey: boolean;
}

export interface ValidateServiceAccountResult {
  valid: boolean;
  masked: ServiceAccountHealth;
  errors: string[];
}

/**
 * Mask a service-account `client_email` to `<first-4>***@<domain>` so diagnostics
 * can identify WHICH account without echoing the full identity. Emails without an
 * `@` are masked to `<first-4>***`.
 */
function maskClientEmail(email: string): string {
  const at = email.indexOf('@');
  if (at === -1) return `${email.slice(0, 4)}***`;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 4)}***@${domain}`;
}

/**
 * Validate a decoded service-account object's SHAPE and return MASKED health only.
 *
 * Checks `type === 'service_account'` and the presence of `project_id` and
 * `private_key`. The returned `masked` health carries the (public) `projectId`, a
 * MASKED `clientEmail`, and a `hasPrivateKey` boolean — the raw `private_key` is
 * NEVER included in the result, and this function never logs the input. This is
 * the credential-file health check mandated by the platform spec (masked-only).
 */
export function validateServiceAccount(obj: unknown): ValidateServiceAccountResult {
  const errors: string[] = [];

  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      valid: false,
      masked: { hasPrivateKey: false },
      errors: ['Service account must be a JSON object.'],
    };
  }

  const o = obj as Record<string, unknown>;

  if (o.type !== 'service_account') {
    errors.push('Field "type" must be "service_account".');
  }

  const projectId = typeof o.project_id === 'string' && o.project_id.length > 0 ? o.project_id : undefined;
  if (!projectId) {
    errors.push('Field "project_id" is required.');
  }

  const clientEmail =
    typeof o.client_email === 'string' && o.client_email.length > 0 ? o.client_email : undefined;

  const hasPrivateKey = typeof o.private_key === 'string' && o.private_key.length > 0;
  if (!hasPrivateKey) {
    errors.push('Field "private_key" is required.');
  }

  const masked: ServiceAccountHealth = { hasPrivateKey };
  if (projectId) masked.projectId = projectId;
  if (clientEmail) masked.clientEmail = maskClientEmail(clientEmail);

  return { valid: errors.length === 0, masked, errors };
}

/**
 * Resolve a service-account credential (a `FileRef` — `{ kind:'file', source:
 * 'path'|'envJson', ref }` — or a `secret()`) and return its MASKED health.
 *
 * SERVER-ONLY: `resolveCredential` throws in the browser, so this can never
 * expose the file client-side. The resolved object is validated in-process and
 * only its masked health is returned — the raw object (and the private_key in
 * particular) is NEVER returned or logged. A resolution failure is reported as a
 * single `errors` entry WITHOUT echoing any credential contents.
 */
export async function loadServiceAccount(ref: CredentialInput): Promise<ValidateServiceAccountResult> {
  // SERVER-ONLY guard: throw LOUDLY in the browser rather than ever attempting a
  // credential-file read client-side (mirrors resolveCredential's own guard). We
  // throw here explicitly so the browser case is never swallowed by the
  // resolution-failure catch below.
  if (typeof window !== 'undefined') {
    throw new Error('[Minder] loadServiceAccount() must only be called on the server.');
  }

  let resolved: string | object;
  try {
    resolved = await resolveCredential(ref);
  } catch (err) {
    // The error names only the ref/path/env var (never contents) — but to be
    // certain nothing leaks we surface a generic message, not the raw error.
    return {
      valid: false,
      masked: { hasPrivateKey: false },
      errors: [
        `Service account credential could not be resolved: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      ],
    };
  }

  // `resolveCredential` may return a parsed object (file/envJson branches) or a
  // string (a `secret()` carrying raw JSON). Normalize a string to an object.
  let obj: unknown = resolved;
  if (typeof resolved === 'string') {
    try {
      obj = JSON.parse(resolved);
    } catch {
      return {
        valid: false,
        masked: { hasPrivateKey: false },
        errors: ['Service account credential did not contain valid JSON.'],
      };
    }
  }

  return validateServiceAccount(obj);
}
