/**
 * @jest-environment node
 *
 * Task 3.2: `minder generate --from <openapi.json>` — OpenAPI 3.x -> minder
 * typed-routes codegen.
 *
 * Three layers, matching the codegen's own architecture (pure logic in
 * scripts/lib/openapi-codegen.js, fs/CLI wiring in src/cli/index.cjs):
 *   1. Unit tests against the pure module (naming, param convention, schema
 *      conversion, error cases) — no fs, no child process.
 *   2. Round-trip + determinism + golden-file byte-equality against the
 *      vendored tests/fixtures/openapi-petstore.json.
 *   3. A genuine `tsc --noEmit` type-check of freshly generated output, via
 *      child_process, against this repo's own real ApiRoute/HttpMethod
 *      types (see the "paths" mapping added to tsconfig.json). The
 *      committed golden file (tests/fixtures/generated-petstore.routes.ts)
 *      is ALSO listed in tsconfig.json's `include`, so `npm run type-check`
 *      catches this too — this test additionally proves it works from
 *      fresh (not-yet-committed) codegen output, without requiring a
 *      separate `npm run type-check` invocation.
 *   4. CLI-level smoke tests (child process via bin/minder.js) for the
 *      user-facing surface: success path + both error paths P6 calls out
 *      explicitly ("no args" usage error, and implicitly bad input).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const codegen = require('../scripts/lib/openapi-codegen.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cli = require('../src/cli/index.cjs');

const REPO_ROOT = path.join(__dirname, '..');
const BIN_PATH = path.join(REPO_ROOT, 'bin', 'minder.js');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'openapi-petstore.json');
const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'generated-petstore.routes.ts');

const fixtureSpec = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

function makeCtx(cwd: string) {
  let out = '';
  let err = '';
  return {
    ctx: {
      cwd,
      stdout: { write: (s: string) => { out += s; return true; } },
      stderr: { write: (s: string) => { err += s; return true; } },
    },
    getOut: () => out,
    getErr: () => err,
  };
}

// ============================================================================
// 1. Unit tests — pure module
// ============================================================================

describe('openapi-codegen: naming', () => {
  it('derives <method><PascalCasePath> when operationId is absent, translating {param} to By<Param>', () => {
    expect(codegen.deriveRouteName('get', '/health')).toBe('getHealth');
    expect(codegen.deriveRouteName('get', '/pets/{petId}')).toBe('getPetsByPetId');
    expect(codegen.deriveRouteName('get', '/pets/{petId}/vaccinations/{vaccinationId}')).toBe(
      'getPetsByPetIdVaccinationsByVaccinationId'
    );
  });

  it('sanitizes non-identifier characters and a leading digit', () => {
    expect(codegen.sanitizeIdentifier('list-pets')).toBe('list_pets');
    expect(codegen.sanitizeIdentifier('2fast')).toBe('_2fast');
  });

  it('dedupes repeated names deterministically with numeric suffixes', () => {
    const dedupe = codegen.makeDeduper();
    expect(dedupe('getPets')).toBe('getPets');
    expect(dedupe('getPets')).toBe('getPets_2');
    expect(dedupe('getPets')).toBe('getPets_3');
    expect(dedupe('other')).toBe('other');
  });
});

describe('openapi-codegen: path param convention', () => {
  it('translates OpenAPI {param} to minder\'s :param URL-template convention', () => {
    // This convention is read directly from src/core/ApiClient.ts's
    // `url.replace(':' + key, ...)` — minder interpolates ":name", never
    // "{name}".
    expect(codegen.convertPathParams('/pets/{petId}')).toBe('/pets/:petId');
    expect(codegen.convertPathParams('/pets/{petId}/vaccinations/{vaccinationId}')).toBe(
      '/pets/:petId/vaccinations/:vaccinationId'
    );
    expect(codegen.convertPathParams('/health')).toBe('/health');
  });
});

describe('openapi-codegen: base path strategy', () => {
  it('"strip" (default) ignores servers[0].url entirely', () => {
    expect(codegen.resolveBasePath({ servers: [{ url: 'https://api.example.com/v1' }] }, 'strip')).toBe('');
  });

  it('"keep" prepends the path portion of an absolute servers[0].url', () => {
    expect(codegen.resolveBasePath({ servers: [{ url: 'https://api.example.com/v1' }] }, 'keep')).toBe('/v1');
  });

  it('"keep" handles a relative servers[0].url and a bare host with no path', () => {
    expect(codegen.resolveBasePath({ servers: [{ url: '/v2' }] }, 'keep')).toBe('/v2');
    expect(codegen.resolveBasePath({ servers: [{ url: 'https://api.example.com' }] }, 'keep')).toBe('');
    expect(codegen.resolveBasePath({ servers: [] }, 'keep')).toBe('');
    expect(codegen.resolveBasePath({}, 'keep')).toBe('');
  });
});

describe('openapi-codegen: schema conversion subset', () => {
  const ctx = { schemaNameMap: new Map([['Pet', 'Pet']]) };

  it('converts primitives, arrays, objects, enums, oneOf, and $ref', () => {
    expect(codegen.jsonSchemaToTs({ type: 'string' }, ctx)).toBe('string');
    expect(codegen.jsonSchemaToTs({ type: 'integer' }, ctx)).toBe('number');
    expect(codegen.jsonSchemaToTs({ type: 'boolean' }, ctx)).toBe('boolean');
    expect(codegen.jsonSchemaToTs({ type: 'array', items: { type: 'string' } }, ctx)).toBe('Array<string>');
    expect(codegen.jsonSchemaToTs({ enum: ['a', 'b'] }, ctx)).toBe('"a" | "b"');
    expect(codegen.jsonSchemaToTs({ oneOf: [{ type: 'string' }, { type: 'integer' }] }, ctx)).toBe(
      'string | number'
    );
    expect(codegen.jsonSchemaToTs({ $ref: '#/components/schemas/Pet' }, ctx)).toBe('Pet');
    expect(
      codegen.jsonSchemaToTs(
        { type: 'object', required: ['id'], properties: { id: { type: 'integer' }, name: { type: 'string' } } },
        ctx
      )
    ).toBe('{\n  id: number;\n  name?: string;\n}');
  });

  it('lowers anything unrepresentable to `unknown` with an explanatory comment, never a wrong guess', () => {
    expect(codegen.jsonSchemaToTs({ allOf: [{ type: 'string' }] }, ctx)).toMatch(/^unknown \/\*/);
    expect(codegen.jsonSchemaToTs({ anyOf: [{ type: 'string' }] }, ctx)).toMatch(/^unknown \/\*/);
    expect(codegen.jsonSchemaToTs({ $ref: '#/components/schemas/Missing' }, ctx)).toMatch(/^unknown \/\*/);
    expect(codegen.jsonSchemaToTs({ $ref: '#/components/requestBodies/X' }, ctx)).toMatch(/^unknown \/\*/);
    expect(codegen.jsonSchemaToTs({}, ctx)).toMatch(/^unknown \/\*/);
  });
});

describe('openapi-codegen: validateSpec error cases', () => {
  it('rejects a missing "openapi" field', () => {
    expect(() => codegen.validateSpec({ paths: { '/x': {} } })).toThrow(codegen.CodegenError);
  });

  it('rejects an unsupported major version (2.0 / Swagger)', () => {
    expect(() => codegen.validateSpec({ openapi: '2.0', paths: { '/x': {} } })).toThrow(/Unsupported OpenAPI version/);
  });

  it('rejects zero paths', () => {
    expect(() => codegen.validateSpec({ openapi: '3.0.3', paths: {} })).toThrow(/zero paths|nothing to generate/i);
  });

  it('accepts OpenAPI 3.1', () => {
    expect(() =>
      codegen.validateSpec({ openapi: '3.1.0', paths: { '/x': { get: {} } } })
    ).not.toThrow();
  });
});

// ============================================================================
// 2. Round-trip + determinism + golden file
// ============================================================================

describe('openapi-codegen: round-trip against the vendored petstore fixture', () => {
  const code = codegen.generateRoutesModule(fixtureSpec, {
    sourceLabel: 'tests/fixtures/openapi-petstore.json',
    basePathStrategy: 'strip',
  });

  it('includes every fixture path+method with the correct url/method', () => {
    expect(code).toContain('listPets: { method: HttpMethod.GET, url: "/pets" }');
    expect(code).toContain('createPet: { method: HttpMethod.POST, url: "/pets" }');
    expect(code).toContain('getPet: { method: HttpMethod.GET, url: "/pets/:petId" }');
    expect(code).toContain('updatePet: { method: HttpMethod.PUT, url: "/pets/:petId" }');
    expect(code).toContain('deletePet: { method: HttpMethod.DELETE, url: "/pets/:petId" }');
    expect(code).toContain(
      'getPetVaccination: { method: HttpMethod.GET, url: "/pets/:petId/vaccinations/:vaccinationId" }'
    );
    expect(code).toContain('getPetOwner: { method: HttpMethod.GET, url: "/pets/:petId/owner" }');
  });

  it('covers both operationId-based naming (listPets) and derived naming (getHealth, no operationId)', () => {
    expect(code).toContain('listPets:');
    expect(code).toContain('getHealth: { method: HttpMethod.GET, url: "/health" }');
  });

  it('generates named interfaces for components.schemas, including a $ref\'d enum', () => {
    expect(code).toContain('export type PetStatus = "available" | "pending" | "sold";');
    expect(code).toContain('export interface Pet {');
    expect(code).toContain('status: PetStatus;');
  });

  it('generates a oneOf union response type for getPetOwner', () => {
    expect(code).toContain('export type GetPetOwnerResponse = Person | Organization;');
  });

  it('produces a RouteTypes map with body?/response? per route', () => {
    expect(code).toContain('createPet: { body: NewPet; response: Pet };');
    expect(code).toContain('deletePet: {};'); // 204 No Content, no request body
  });

  it('is deterministic: two runs on the same spec produce byte-identical output', () => {
    const again = codegen.generateRoutesModule(fixtureSpec, {
      sourceLabel: 'tests/fixtures/openapi-petstore.json',
      basePathStrategy: 'strip',
    });
    expect(again).toBe(code);
  });

  it('matches the committed golden file byte-for-byte (regenerate + commit tests/fixtures/generated-petstore.routes.ts if this fails on a deliberate codegen change)', () => {
    const golden = fs.readFileSync(GOLDEN_PATH, 'utf8');
    expect(code).toBe(golden);
  });
});

describe('openapi-codegen: --base-path-strategy keep', () => {
  it('prepends the server path to every route', () => {
    const code = codegen.generateRoutesModule(fixtureSpec, {
      sourceLabel: 'x',
      basePathStrategy: 'keep',
    });
    expect(code).toContain('url: "/v1/pets"');
    expect(code).toContain('url: "/v1/pets/:petId"');
  });
});

// ============================================================================
// 3. Generated output genuinely type-checks
// ============================================================================

describe('openapi-codegen: generated output type-checks against the real library types', () => {
  it('passes `tsc --noEmit` importing ApiRoute/HttpMethod from the actual src (mirrors what `npm run type-check` does for the committed golden file)', () => {
    const code = codegen.generateRoutesModule(fixtureSpec, {
      sourceLabel: 'tests/fixtures/openapi-petstore.json',
      basePathStrategy: 'strip',
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-codegen-typecheck-'));
    try {
      const genFile = path.join(tmpDir, 'generated.routes.ts');
      fs.writeFileSync(genFile, code, 'utf8');

      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({
          extends: path.join(REPO_ROOT, 'tsconfig.json'),
          compilerOptions: {
            outDir: path.join(tmpDir, 'out'),
            declarationDir: path.join(tmpDir, 'out'),
            noEmit: true,
            // `extends` resolves "paths" relative to REPO_ROOT fine, but
            // `types: ["node"]`'s default typeRoots search walks up from
            // THIS config file's own directory (tmpDir, outside the repo) —
            // point it at the repo's node_modules/@types explicitly so
            // @types/node still resolves from a scratch dir.
            typeRoots: [path.join(REPO_ROOT, 'node_modules', '@types')],
          },
          include: [genFile],
        }),
        'utf8'
      );

      // The repo's own tsconfig.json already carries the "minder-data-provider"
      // -> "./src/index.ts" paths mapping (added for exactly this purpose —
      // see tsconfig.json's Task 3.2 comment) plus `types: ["node"]`, which
      // resolves fine here because `extends` keeps this config's effective
      // typeRoots search rooted at the repo (cwd below is REPO_ROOT).
      execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', tsconfigPath], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 4. CLI-level smoke tests (child process via bin/minder.js)
// ============================================================================

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: { cwd: string }): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [BIN_PATH, ...args], {
      cwd: opts.cwd,
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

describe('minder generate (CLI)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-generate-cli-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates minder.routes.ts from the fixture spec', () => {
    const result = run(['generate', '--from', FIXTURE_PATH, '--out', path.join(tmpDir, 'minder.routes.ts')], {
      cwd: tmpDir,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('wrote');
    const written = fs.readFileSync(path.join(tmpDir, 'minder.routes.ts'), 'utf8');
    expect(written.length).toBeGreaterThan(0);
    expect(written).toContain('export const routes');
  });

  it('exits 1 with a helpful usage error when --from is missing', () => {
    const result = run(['generate'], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--from/);
  });

  it('exits 1 with a "JSON only" message for a non-JSON input file', () => {
    const badFile = path.join(tmpDir, 'openapi.yaml');
    fs.writeFileSync(badFile, 'openapi: 3.0.3\npaths: {}\n', 'utf8');
    const result = run(['generate', '--from', badFile], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JSON/i);
  });

  it('exits 1 for an unsupported OpenAPI major version', () => {
    const badFile = path.join(tmpDir, 'swagger.json');
    fs.writeFileSync(badFile, JSON.stringify({ swagger: '2.0', paths: { '/x': { get: {} } } }), 'utf8');
    const result = run(['generate', '--from', badFile], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unsupported OpenAPI version|missing required "openapi"/);
  });

  it('exits 1 for a spec with zero paths', () => {
    const badFile = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(badFile, JSON.stringify({ openapi: '3.0.3', paths: {} }), 'utf8');
    const result = run(['generate', '--from', badFile], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/zero paths|nothing to generate/i);
  });

  it('exits 1 for a missing input file', () => {
    const result = run(['generate', '--from', path.join(tmpDir, 'does-not-exist.json')], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not found/i);
  });

  it('rejects an unknown --base-path-strategy value', () => {
    const result = run(['generate', '--from', FIXTURE_PATH, '--base-path-strategy', 'bogus'], { cwd: tmpDir });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--base-path-strategy/);
  });
});

// ============================================================================
// In-process cmdGenerate exercise (exported for direct testing, same pattern
// as cmdDoctor/cmdInit).
// ============================================================================

describe('cmdGenerate (in-process)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minder-generate-inproc-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults --out to minder.routes.ts', () => {
    const { ctx, getOut } = makeCtx(tmpDir);
    const code = cli.cmdGenerate(['--from', FIXTURE_PATH], ctx);
    expect(code).toBe(0);
    expect(getOut()).toContain('minder.routes.ts');
    expect(fs.existsSync(path.join(tmpDir, 'minder.routes.ts'))).toBe(true);
  });
});
