'use strict';

/**
 * OpenAPI 3.x -> minder typed-routes codegen (Task 3.2).
 *
 * Zero dependencies, plain CommonJS — same style as scripts/generate-catalog.js
 * and src/cli/index.cjs (which requires this module). Pure functions only: no
 * `fs`/`process` access here — reading the input spec file and writing the
 * generated `.ts` output are the CLI wire-up's job (src/cli/index.cjs's
 * `cmdGenerate`), so this module stays trivially unit-testable and reusable.
 *
 * Scope (documented, not aspirational — P11/master §7 "keep it simple"):
 *   - OpenAPI 3.0.x and 3.1.x JSON documents only. YAML is explicitly out of
 *     scope (see cmdGenerate's "JSON only" error) — no YAML parser dependency
 *     is added (P3/P11: no new deps).
 *   - JSON Schema subset: object/array/string/number/integer/boolean/enum
 *     (string or number members)/oneOf-as-union/$ref (resolved only against
 *     this document's own `components.schemas`). allOf/anyOf/not,
 *     `additionalProperties` schemas, and any $ref outside
 *     `#/components/schemas/<name>` are NOT representable — they lower to
 *     `unknown` with an explanatory comment rather than guessing.
 *   - Path parameters (`{id}`) become minder's own `:id` URL-template
 *     convention — see src/core/ApiClient.ts's `url.replace(':' + key, ...)`
 *     — NOT the OpenAPI `{id}` braces, which minder's ApiClient never
 *     interpolates.
 */

// ============================================================================
// ERRORS
// ============================================================================

class CodegenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CodegenError';
  }
}

// ============================================================================
// SPEC VALIDATION
// ============================================================================

const SUPPORTED_OPENAPI_MAJOR = 3;

/**
 * Throws `CodegenError` with a precise, actionable message when `spec` isn't
 * a usable OpenAPI 3.x document. Never touches the filesystem — `spec` is
 * already-parsed JSON by this point (JSON-vs-YAML detection happens one
 * level up, in cmdGenerate, before this is even called).
 */
function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new CodegenError('Invalid OpenAPI document: expected a JSON object at the top level.');
  }
  if (typeof spec.openapi !== 'string' || spec.openapi.length === 0) {
    throw new CodegenError(
      'Invalid OpenAPI document: missing required "openapi" field (e.g. "3.0.3" or "3.1.0").'
    );
  }
  const major = parseInt(spec.openapi.split('.')[0], 10);
  if (major !== SUPPORTED_OPENAPI_MAJOR) {
    throw new CodegenError(
      `Unsupported OpenAPI version "${spec.openapi}" — minder generate supports OpenAPI 3.x ` +
        '(3.0 and 3.1) only.'
    );
  }
  const paths = spec.paths;
  if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) {
    throw new CodegenError('Invalid OpenAPI document: "paths" is empty — nothing to generate.');
  }
}

// ============================================================================
// IDENTIFIER / NAMING HELPERS
// ============================================================================

/** Operation methods minder's codegen recognizes, in a fixed canonical order (deterministic regardless of source key order within a path item). */
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];

/** Replace anything not a valid TS identifier char with "_"; guarantee a legal leading character. Case-preserving. */
function sanitizeIdentifier(raw) {
  let s = String(raw).replace(/[^A-Za-z0-9_$]/g, '_');
  if (/^[0-9]/.test(s)) s = '_' + s;
  if (s.length === 0) s = '_';
  return s;
}

/** PascalCase a single raw path/word segment ("pet-owners" / "pet_owners" / "petOwners" -> "PetOwners"). */
function toPascalCase(segment) {
  return String(segment)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Derive a route name from `<method><PascalCasePath>` when an operation has
 * no `operationId` — e.g. `GET /pets` -> `getPets`, `GET /pets/{petId}` ->
 * `getPetsByPetId`. Each literal path segment is PascalCased; each `{param}`
 * segment becomes `By<PascalCaseParam>`. Documented in README/API_REFERENCE.
 */
function deriveRouteName(method, rawPath) {
  const segments = rawPath.split('/').filter(Boolean);
  const parts = segments.map((seg) => {
    const m = /^\{(.+)\}$/.exec(seg);
    if (m) return 'By' + toPascalCase(m[1]);
    return toPascalCase(seg);
  });
  const pathPart = parts.join('') || 'Root';
  return sanitizeIdentifier(method + pathPart);
}

/** Stateful deduper: first occurrence of a name passes through; later collisions get `_2`, `_3`, ... suffixes, in encounter order (deterministic for a given spec). */
function makeDeduper() {
  const seen = new Map();
  return function dedupe(name) {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  };
}

// ============================================================================
// BASE PATH RESOLUTION (--base-path-strategy)
// ============================================================================

/**
 * `strip` (default): ignore `servers[0].url` entirely — every generated
 * route URL is the raw OpenAPI path only. This is the right default when the
 * consuming app's own `apiBaseUrl` (minder config) already points at the
 * full API root, including any version prefix.
 *
 * `keep`: prepend the *path portion* of `servers[0].url` (e.g.
 * "https://api.example.com/v1" -> "/v1") to every route, for specs whose
 * server URL carries a prefix (commonly an API version) that the consuming
 * app's `apiBaseUrl` does NOT already include.
 */
function resolveBasePath(spec, strategy) {
  if (strategy !== 'keep') return '';
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  const first = servers.length > 0 ? servers[0] : null;
  const rawUrl = first && typeof first.url === 'string' ? first.url : '';
  if (!rawUrl) return '';

  let pathname;
  try {
    // Absolute server URL (e.g. "https://api.example.com/v1").
    pathname = new URL(rawUrl).pathname;
  } catch {
    // Relative server URL (e.g. "/v1") — already a path.
    pathname = rawUrl;
  }
  pathname = pathname.replace(/\/+$/, '');
  return pathname === '' || pathname === '/' ? '' : pathname;
}

/** OpenAPI `{param}` -> minder's `:param` URL-template convention (src/core/ApiClient.ts). */
function convertPathParams(rawPath) {
  return rawPath.replace(/\{([^}]+)\}/g, ':$1');
}

// ============================================================================
// JSON SCHEMA (subset) -> TS
// ============================================================================

/** `#/components/schemas/<Name>` -> `<Name>`, or null for anything else (out of scope). */
function schemaRefName(ref) {
  const m = /^#\/components\/schemas\/([^/]+)$/.exec(String(ref));
  return m ? m[1] : null;
}

function propKeyLiteral(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderObjectType(schema, ctx) {
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const keys = Object.keys(props);
  if (keys.length === 0) {
    // No declared properties (e.g. a free-form `additionalProperties` bag) —
    // representable, but not worth a dedicated interface.
    return 'Record<string, unknown>';
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const lines = keys.map((key) => {
    const propType = jsonSchemaToTs(props[key], ctx);
    const optional = required.has(key) ? '' : '?';
    return `  ${propKeyLiteral(key)}${optional}: ${propType};`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

function baseTypeFor(typeName, schema, ctx) {
  switch (typeName) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${jsonSchemaToTs(schema.items || {}, ctx)}>`;
    case 'object':
      return renderObjectType(schema, ctx);
    default:
      return null;
  }
}

/**
 * Convert a JSON Schema node to a TS type expression. Handles the documented
 * subset (object/array/string/number/integer/boolean/enum/oneOf/$ref);
 * anything else lowers to `unknown /* codegen: ... *\/` with a reason rather
 * than silently producing a wrong type.
 */
function jsonSchemaToTs(schema, ctx) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return 'unknown /* codegen: schema node missing or malformed */';
  }

  if (typeof schema.$ref === 'string') {
    const refName = schemaRefName(schema.$ref);
    const mapped = refName ? ctx.schemaNameMap.get(refName) : undefined;
    return mapped || `unknown /* codegen: unresolved $ref "${schema.$ref}" */`;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (schema.enum.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
    }
    return 'unknown /* codegen: enum with non-string/number member(s) not supported */';
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf.map((s) => jsonSchemaToTs(s, ctx)).join(' | ');
  }

  if (Array.isArray(schema.allOf)) {
    return 'unknown /* codegen: allOf composition not supported */';
  }
  if (Array.isArray(schema.anyOf)) {
    return 'unknown /* codegen: anyOf composition not supported (use oneOf) */';
  }

  if (Array.isArray(schema.type)) {
    // OpenAPI 3.1 / JSON Schema 2020-12 nullable-via-array form, e.g.
    // `"type": ["string", "null"]`.
    const parts = schema.type.map(
      (t) => baseTypeFor(t, schema, ctx) || `unknown /* codegen: unsupported type "${t}" */`
    );
    return parts.join(' | ');
  }

  if (typeof schema.type === 'string') {
    const base = baseTypeFor(schema.type, schema, ctx);
    if (base !== null) return base;
    return `unknown /* codegen: unsupported schema type "${schema.type}" */`;
  }

  // No `type` keyword but `properties` present — OpenAPI/JSON Schema treats
  // this as an implicit object.
  if (schema.properties && typeof schema.properties === 'object') {
    return renderObjectType(schema, ctx);
  }

  return 'unknown /* codegen: unsupported/unspecified schema shape */';
}

/** `export interface Name { ... }` for object shapes, `export type Name = ...;` otherwise. */
function emitNamedSchema(name, schema, ctx) {
  const tsType = jsonSchemaToTs(schema, ctx);
  if (tsType.startsWith('{') && tsType.endsWith('}')) {
    return `export interface ${name} ${tsType}\n`;
  }
  return `export type ${name} = ${tsType};\n`;
}

// ============================================================================
// OPERATION BODY / RESPONSE SCHEMA RESOLUTION
// ============================================================================

function resolveJsonContentSchema(contentObj) {
  if (!contentObj || typeof contentObj !== 'object') return null;
  const json = contentObj['application/json'];
  if (!json || typeof json !== 'object' || !json.schema) return null;
  return json.schema;
}

function resolveRequestBodySchema(operation) {
  const rb = operation.requestBody;
  if (!rb || typeof rb !== 'object') return null;
  if (typeof rb.$ref === 'string') return { $ref: rb.$ref }; // components.requestBodies — out of scope, resolves to unknown
  return resolveJsonContentSchema(rb.content);
}

/** First 2xx response (lowest numeric code, deterministic), falling back to "default". */
function resolveResponseSchema(operation) {
  const responses = operation.responses && typeof operation.responses === 'object' ? operation.responses : {};
  const codes = Object.keys(responses)
    .filter((c) => /^2\d\d$/.test(c))
    .sort();
  const code = codes.length > 0 ? codes[0] : responses.default ? 'default' : null;
  if (!code) return null;
  const response = responses[code];
  if (!response || typeof response !== 'object') return null;
  if (typeof response.$ref === 'string') return { $ref: response.$ref }; // components.responses — out of scope
  return resolveJsonContentSchema(response.content);
}

/**
 * Resolve a body/response schema to a TS type NAME usable inside `RouteTypes`
 * — reusing the matching `components.schemas` interface for a direct $ref, or
 * synthesizing (and registering, via `emit`) a new named type for an inline
 * schema. `suggestedName` (e.g. "listPetsBody") is PascalCased and deduped
 * against every other top-level type name in the file.
 */
function namedTypeFor(schema, suggestedName, ctx, typeDeduper, emit) {
  if (typeof schema.$ref === 'string') {
    const refName = schemaRefName(schema.$ref);
    const mapped = refName ? ctx.schemaNameMap.get(refName) : undefined;
    if (mapped) return mapped;
    // Unresolved ref: still synthesize a named `unknown` type so RouteTypes
    // stays uniform (every field is a plain identifier, never an inline
    // expression), and the reason is visible right next to the export.
  }
  const pascal = suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1);
  const finalName = typeDeduper(sanitizeIdentifier(pascal));
  emit(emitNamedSchema(finalName, schema, ctx));
  return finalName;
}

// ============================================================================
// FILE ASSEMBLY
// ============================================================================

const FILE_HEADER = `/**
 * AUTO-GENERATED by \`minder generate\` — DO NOT EDIT BY HAND.
 * Regenerate with: minder generate --from <openapi.json> --out <this file>
 *
 * Source: SOURCE_LABEL_PLACEHOLDER
 *
 * Path parameters use minder's ":name" URL-template convention (see
 * src/core/ApiClient.ts) — NOT the OpenAPI "{name}" braces.
 */
`;

/**
 * Generate the full `.ts` module text for a validated OpenAPI 3.x document.
 * Deterministic: the same `spec` + `opts` always produce byte-identical
 * output (no wall-clock timestamp is embedded — see FILE_HEADER).
 *
 * @param {object} spec - already-parsed OpenAPI JSON document
 * @param {{ sourceLabel: string, basePathStrategy?: 'strip'|'keep' }} opts
 * @returns {string} generated TypeScript source
 */
function generateRoutesModule(spec, opts) {
  validateSpec(spec);
  const options = opts || {};
  const sourceLabel = options.sourceLabel || '(unknown)';
  const basePathStrategy = options.basePathStrategy === 'keep' ? 'keep' : 'strip';

  const basePath = resolveBasePath(spec, basePathStrategy);
  const componentsSchemas =
    spec.components && typeof spec.components.schemas === 'object' ? spec.components.schemas : {};

  const typeDeduper = makeDeduper();
  const schemaNameMap = new Map();
  // Reserve + dedupe every components.schemas name FIRST, in document order,
  // before anything is rendered — so $ref resolution and inline-synthesized
  // names never depend on which order operations happen to be visited in.
  for (const rawName of Object.keys(componentsSchemas)) {
    schemaNameMap.set(rawName, typeDeduper(sanitizeIdentifier(rawName)));
  }

  const ctx = { schemaNameMap };
  const typeBlocks = [];
  for (const [rawName, schemaDef] of Object.entries(componentsSchemas)) {
    typeBlocks.push(emitNamedSchema(schemaNameMap.get(rawName), schemaDef, ctx));
  }

  const routeDeduper = makeDeduper();
  const routeEntries = []; // { name, method, url }
  const routeTypeRows = []; // { name, bodyType, responseType }

  for (const [rawPath, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;

      const baseName =
        typeof operation.operationId === 'string' && operation.operationId.length > 0
          ? sanitizeIdentifier(operation.operationId)
          : deriveRouteName(method, rawPath);
      const name = routeDeduper(baseName);

      const url = basePath + convertPathParams(rawPath);
      routeEntries.push({ name, method: method.toUpperCase(), url });

      const bodySchema = resolveRequestBodySchema(operation);
      const responseSchema = resolveResponseSchema(operation);
      const bodyType = bodySchema
        ? namedTypeFor(bodySchema, `${name}Body`, ctx, typeDeduper, (code) => typeBlocks.push(code))
        : null;
      const responseType = responseSchema
        ? namedTypeFor(responseSchema, `${name}Response`, ctx, typeDeduper, (code) => typeBlocks.push(code))
        : null;
      routeTypeRows.push({ name, bodyType, responseType });
    }
  }

  const routesBlock = [
    "import type { ApiRoute } from 'minder-data-provider';",
    "import { HttpMethod } from 'minder-data-provider';",
    '',
    'export const routes = {',
    ...routeEntries.map(
      (r) => `  ${propKeyLiteral(r.name)}: { method: HttpMethod.${r.method}, url: ${JSON.stringify(r.url)} },`
    ),
    '} as const satisfies Record<string, ApiRoute>;',
    '',
  ].join('\n');

  const routeTypesBlock = [
    'export interface RouteTypes {',
    ...routeTypeRows.map((r) => {
      const fields = [];
      if (r.bodyType) fields.push(`body: ${r.bodyType}`);
      if (r.responseType) fields.push(`response: ${r.responseType}`);
      const body = fields.length > 0 ? `{ ${fields.join('; ')} }` : '{}';
      return `  ${propKeyLiteral(r.name)}: ${body};`;
    }),
    '}',
    '',
  ].join('\n');

  const header = FILE_HEADER.replace('SOURCE_LABEL_PLACEHOLDER', sourceLabel);

  return [header, routesBlock, typeBlocks.join('\n'), routeTypesBlock].join('\n');
}

module.exports = {
  CodegenError,
  SUPPORTED_OPENAPI_MAJOR,
  validateSpec,
  generateRoutesModule,
  // exported for direct unit testing
  sanitizeIdentifier,
  toPascalCase,
  deriveRouteName,
  makeDeduper,
  resolveBasePath,
  convertPathParams,
  jsonSchemaToTs,
  METHODS,
};
