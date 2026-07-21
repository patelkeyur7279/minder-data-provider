/**
 * Provider Manifest
 *
 * The contract every provider package (Supabase, Stripe, Firebase, …) must ship in order to
 * be certified for the Minder plugin ecosystem. See `docs/providers/CERTIFICATION.md` for the
 * full certification checklist and `scripts/certify-provider.js` for the automated check.
 *
 * Relationship to `PluginSystem.ts`'s `PluginManifest`
 * ------------------------------------------------------
 * `PluginManifest` (in `./PluginSystem.ts`) is the minimal, optional metadata a *runtime*
 * plugin instance may declare (name/version/capabilities/runtime/peerDependencies). It is
 * intentionally loose because any object can register as a plugin.
 *
 * `ProviderManifest` extends that direction for the stricter case of a *published provider
 * package*: it reuses the same conceptual fields (capabilities, runtime support, peer
 * dependencies) but makes them mandatory, more granular (multiple runtimes/frameworks instead
 * of one, a client/server config split, scoped permissions with justifications, doc pointers)
 * and validated. It does not literally `extends PluginManifest` because the shapes diverge
 * (e.g. `runtime` is a single value there vs. `runtimes: ProviderRuntime[]` here) — the two
 * are siblings describing the same ecosystem at different levels of ceremony.
 */

import type { MinderCapability } from './PluginSystem';

// ---------------------------------------------------------------------------
// Field vocabularies
//
// These are the single source of truth for the enums used by both the TS types below and
// `providerManifestSchema`. `scripts/certify-provider.js` cannot import this file directly
// (it must run standalone against a provider's compiled/published output — see that file's
// header comment), so its copies of these lists are kept in sync by hand and cross-checked by
// `tests/provider-certification.test.ts`. If you change a list here, update the script too.
// ---------------------------------------------------------------------------

/** Where a provider's UI/config surface applies. Mirrors the plugin store taxonomy. */
export const PROVIDER_CATEGORIES = [
  'auth',
  'database',
  'storage',
  'payments',
  'messaging',
  'analytics',
  'ai',
  'other',
] as const;

/** JS runtimes a provider adapter is verified to run in. */
export const PROVIDER_RUNTIMES = ['web', 'node', 'edge', 'react-native'] as const;

/** Frameworks a provider ships first-class integration/examples for. */
export const PROVIDER_FRAMEWORKS = ['react', 'nextjs', 'vite', 'remix', 'react-native'] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];
export type ProviderRuntime = (typeof PROVIDER_RUNTIMES)[number];
export type ProviderFramework = (typeof PROVIDER_FRAMEWORKS)[number];

/**
 * Free-form capability tag a provider declares (e.g. "row-level-security", "presigned-upload").
 * Where a capability maps onto the plugin system's closed taxonomy, prefer reusing a
 * {@link MinderCapability} value so provider capabilities and runtime plugin capabilities line
 * up; providers may also declare capabilities outside that taxonomy since the provider surface
 * is broader than the plugin hook surface.
 */
export type ProviderCapability = MinderCapability | (string & {});

/** Regex sources shared between the TS validator and (by hand-sync) the cert script. */
export const NAME_PATTERN_SOURCE = '^@[a-z0-9-][a-z0-9-._]*\\/[a-z0-9-][a-z0-9-._]*$';
export const SEMVER_PATTERN_SOURCE =
  '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$';
/** A relative, non-URL path: no leading "/", no "://", not empty. */
export const RELATIVE_PATH_PATTERN_SOURCE = '^(?!/)(?!.*://).+$';

export const NAME_PATTERN = new RegExp(NAME_PATTERN_SOURCE);
export const SEMVER_PATTERN = new RegExp(SEMVER_PATTERN_SOURCE);
export const RELATIVE_PATH_PATTERN = new RegExp(RELATIVE_PATH_PATTERN_SOURCE);

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** Client-safe vs. server-only config keys a provider reads. Must be disjoint sets. */
export interface ProviderConfigSplit {
  /** Config keys safe to bundle/expose in client-side code (e.g. a public anon key). */
  clientSafe: string[];
  /** Config keys that must never reach a client bundle (e.g. a service-role/secret key). */
  serverOnly: string[];
}

/** A least-privilege permission scope the provider requests, with a justification. */
export interface ProviderScope {
  /** The scope/permission identifier (provider-defined, e.g. "database:read"). */
  scope: string;
  /** Why this provider needs the scope. Required — certification rejects scopes without one. */
  why: string;
}

/** Relative paths (from the provider package root) to required documentation. */
export interface ProviderDocs {
  /** Setup + teardown guide. */
  setup: string;
  /** A runnable example demonstrating the provider. */
  example: string;
  /** Threat notes + mitigations for this provider's integration surface. */
  security: string;
}

/**
 * The manifest every certified provider package must export (typically as `manifest.json` at
 * the package root, and/or as the typed `ProviderManifest` object its entry point exports).
 */
export interface ProviderManifest {
  /** Scoped npm package name, e.g. "@minder/provider-supabase". */
  name: string;
  /** Semver version string, e.g. "1.0.0" or "1.0.0-beta.0". */
  version: string;
  /** Human-readable name shown in provider pickers/docs, e.g. "Supabase". */
  displayName: string;
  /** One or more categories this provider belongs to. At least one required. */
  categories: ProviderCategory[];
  /** Capability tags this provider offers (see {@link ProviderCapability}). */
  capabilities: ProviderCapability[];
  /** Client-safe vs. server-only config key split. Sets must be disjoint. */
  config: ProviderConfigSplit;
  /** Least-privilege scopes this provider requests, each with a `why`. */
  scopes: ProviderScope[];
  /** Runtimes this provider is verified to run in. At least one required. */
  runtimes: ProviderRuntime[];
  /** Frameworks this provider ships first-class support/examples for. May be empty. */
  frameworks: ProviderFramework[];
  /** npm peer dependencies (SDK packages) this provider requires, name -> semver range. */
  peerDependencies: Record<string, string>;
  /** Relative paths to required docs. */
  docs: ProviderDocs;
  /** SPDX license identifier. Optional if a LICENSE file ships instead — see certification. */
  license?: string;
}

/**
 * A plain-object, JSON-Schema-*shaped* descriptor of {@link ProviderManifest}. Not a real
 * JSON Schema validator (no ajv — this repo takes no new dependency for it); it exists so the
 * field vocabulary (required keys, enums, patterns) is documented as data and so
 * `validateProviderManifest` has a single declarative source to walk instead of hand-rolled
 * conditionals scattered through the function body.
 */
export const providerManifestSchema = {
  $id: 'minder-data-provider/provider-manifest',
  type: 'object',
  required: [
    'name',
    'version',
    'displayName',
    'categories',
    'capabilities',
    'config',
    'scopes',
    'runtimes',
    'frameworks',
    'peerDependencies',
    'docs',
  ] as const,
  properties: {
    name: { type: 'string', pattern: NAME_PATTERN_SOURCE },
    version: { type: 'string', pattern: SEMVER_PATTERN_SOURCE },
    displayName: { type: 'string', minLength: 1 },
    categories: { type: 'array', items: { enum: PROVIDER_CATEGORIES }, minItems: 1 },
    capabilities: { type: 'array', items: { type: 'string', minLength: 1 } },
    config: {
      type: 'object',
      required: ['clientSafe', 'serverOnly'] as const,
      properties: {
        clientSafe: { type: 'array', items: { type: 'string', minLength: 1 } },
        serverOnly: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
    },
    scopes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['scope', 'why'] as const,
        properties: {
          scope: { type: 'string', minLength: 1 },
          why: { type: 'string', minLength: 1 },
        },
      },
    },
    runtimes: { type: 'array', items: { enum: PROVIDER_RUNTIMES }, minItems: 1 },
    frameworks: { type: 'array', items: { enum: PROVIDER_FRAMEWORKS } },
    peerDependencies: { type: 'object' },
    docs: {
      type: 'object',
      required: ['setup', 'example', 'security'] as const,
      properties: {
        setup: { type: 'string', pattern: RELATIVE_PATH_PATTERN_SOURCE },
        example: { type: 'string', pattern: RELATIVE_PATH_PATTERN_SOURCE },
        security: { type: 'string', pattern: RELATIVE_PATH_PATTERN_SOURCE },
      },
    },
    license: { type: 'string', minLength: 1 },
  },
} as const;

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Validate a candidate object against the {@link ProviderManifest} contract. Accumulates every
 * violation found (rather than failing fast) so authors can fix a manifest in one pass.
 */
export function validateProviderManifest(obj: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(obj)) {
    return { valid: false, errors: ['Manifest must be a plain object.'] };
  }

  // name
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push('"name" is required and must be a non-empty string.');
  } else if (!NAME_PATTERN.test(obj.name)) {
    errors.push(`"name" must match the scoped package pattern (e.g. "@scope/name"), got "${obj.name}".`);
  }

  // version
  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    errors.push('"version" is required and must be a non-empty string.');
  } else if (!SEMVER_PATTERN.test(obj.version)) {
    errors.push(`"version" must be a valid semver string, got "${obj.version}".`);
  }

  // displayName
  if (typeof obj.displayName !== 'string' || obj.displayName.trim().length === 0) {
    errors.push('"displayName" is required and must be a non-empty string.');
  }

  // categories
  if (!Array.isArray(obj.categories) || obj.categories.length === 0) {
    errors.push('"categories" is required and must be a non-empty array.');
  } else {
    for (const c of obj.categories) {
      if (!(PROVIDER_CATEGORIES as readonly string[]).includes(c as string)) {
        errors.push(`"categories" contains invalid value "${String(c)}" (expected one of: ${PROVIDER_CATEGORIES.join(', ')}).`);
      }
    }
  }

  // capabilities
  if (!isStringArray(obj.capabilities)) {
    errors.push('"capabilities" is required and must be an array of strings.');
  } else if (obj.capabilities.some((c) => c.trim().length === 0)) {
    errors.push('"capabilities" must not contain empty strings.');
  }

  // config (clientSafe / serverOnly, disjoint)
  if (!isPlainObject(obj.config)) {
    errors.push('"config" is required and must be an object with "clientSafe" and "serverOnly" arrays.');
  } else {
    const { clientSafe, serverOnly } = obj.config;
    if (!isStringArray(clientSafe)) {
      errors.push('"config.clientSafe" is required and must be an array of strings.');
    }
    if (!isStringArray(serverOnly)) {
      errors.push('"config.serverOnly" is required and must be an array of strings.');
    }
    if (isStringArray(clientSafe) && isStringArray(serverOnly)) {
      const overlap = clientSafe.filter((k) => serverOnly.includes(k));
      if (overlap.length > 0) {
        errors.push(
          `"config.clientSafe" and "config.serverOnly" must be disjoint; overlapping key(s): ${overlap.join(', ')}.`
        );
      }
    }
  }

  // scopes
  if (!Array.isArray(obj.scopes)) {
    errors.push('"scopes" is required and must be an array.');
  } else {
    obj.scopes.forEach((s, i) => {
      if (!isPlainObject(s)) {
        errors.push(`"scopes[${i}]" must be an object with "scope" and "why".`);
        return;
      }
      if (typeof s.scope !== 'string' || s.scope.trim().length === 0) {
        errors.push(`"scopes[${i}].scope" is required and must be a non-empty string.`);
      }
      if (typeof s.why !== 'string' || s.why.trim().length === 0) {
        errors.push(`"scopes[${i}].why" is required and must be a non-empty string (least-privilege justification).`);
      }
    });
  }

  // runtimes
  if (!Array.isArray(obj.runtimes) || obj.runtimes.length === 0) {
    errors.push('"runtimes" is required and must be a non-empty array.');
  } else {
    for (const r of obj.runtimes) {
      if (!(PROVIDER_RUNTIMES as readonly string[]).includes(r as string)) {
        errors.push(`"runtimes" contains invalid value "${String(r)}" (expected one of: ${PROVIDER_RUNTIMES.join(', ')}).`);
      }
    }
  }

  // frameworks (may be empty, but must be an array of valid values)
  if (!Array.isArray(obj.frameworks)) {
    errors.push('"frameworks" is required and must be an array (may be empty).');
  } else {
    for (const f of obj.frameworks) {
      if (!(PROVIDER_FRAMEWORKS as readonly string[]).includes(f as string)) {
        errors.push(`"frameworks" contains invalid value "${String(f)}" (expected one of: ${PROVIDER_FRAMEWORKS.join(', ')}).`);
      }
    }
  }

  // peerDependencies
  if (!isPlainObject(obj.peerDependencies)) {
    errors.push('"peerDependencies" is required and must be an object mapping package name -> semver range.');
  } else {
    for (const [dep, range] of Object.entries(obj.peerDependencies)) {
      if (typeof range !== 'string' || range.trim().length === 0) {
        errors.push(`"peerDependencies.${dep}" must be a non-empty semver range string.`);
      }
    }
  }

  // docs
  if (!isPlainObject(obj.docs)) {
    errors.push('"docs" is required and must be an object with "setup", "example", and "security".');
  } else {
    for (const key of ['setup', 'example', 'security'] as const) {
      const val = obj.docs[key];
      if (typeof val !== 'string' || val.length === 0) {
        errors.push(`"docs.${key}" is required and must be a non-empty relative path string.`);
      } else if (!RELATIVE_PATH_PATTERN.test(val)) {
        errors.push(`"docs.${key}" must be a relative path (no leading "/", no "://"), got "${val}".`);
      }
    }
  }

  // license (optional field here; certification also accepts a LICENSE file instead)
  if (obj.license !== undefined && (typeof obj.license !== 'string' || obj.license.trim().length === 0)) {
    errors.push('"license", if present, must be a non-empty string.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Identity helper for authoring ergonomics — gives provider authors type-checking and
 * autocomplete when writing a manifest, without doing anything at runtime.
 *
 * @example
 * export default defineProviderManifest({
 *   name: '@minder/provider-supabase',
 *   version: '1.0.0',
 *   // ...
 * });
 */
export function defineProviderManifest(manifest: ProviderManifest): ProviderManifest {
  return manifest;
}
