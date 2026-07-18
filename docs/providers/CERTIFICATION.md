# Provider certification

This document defines what a provider package (a Supabase, Stripe, Firebase, … adapter for
Minder) must ship to be certified, and how to check it automatically.

It is the concrete, file-level implementation of the "Provider certification checklist" in
[`docs/product/RISKS_AND_THREAT_MODEL.md`](../product/RISKS_AND_THREAT_MODEL.md) (the "gate for
'Confirmed' status" charter requirement). That charter checklist is stated in terms of
capabilities a provider must have; the 10 points below are what `scripts/certify-provider.js`
can actually check by reading a provider's package directory on disk.

## The manifest

Every certified provider ships a `manifest.json` at its package root, shaped like the
`ProviderManifest` TypeScript interface exported from
[`src/plugins/manifest.ts`](../../src/plugins/manifest.ts):

```ts
import { defineProviderManifest } from 'minder-data-provider/plugins';

export default defineProviderManifest({
  name: '@minder/provider-supabase',
  version: '1.0.0',
  displayName: 'Supabase',
  categories: ['database', 'auth'],
  capabilities: ['auth-provider', 'storage', 'realtime-subscriptions'],
  config: {
    clientSafe: ['url', 'anonKey'],
    serverOnly: ['serviceRoleKey'],
  },
  scopes: [
    { scope: 'database:read', why: 'Fetch rows on behalf of the signed-in user.' },
  ],
  runtimes: ['web', 'node', 'edge'],
  frameworks: ['react', 'nextjs', 'vite'],
  peerDependencies: { '@supabase/supabase-js': '^2.45.0' },
  docs: {
    setup: './README.md',
    example: './example.ts',
    security: './README.md',
  },
  license: 'MIT',
});
```

`defineProviderManifest` is a type-only identity helper — it exists purely for editor
autocomplete/type-checking while authoring the manifest, it does nothing at runtime.

`validateProviderManifest(manifest)` (also exported from `src/plugins/manifest.ts`) checks that
shape and returns `{ valid: boolean; errors: string[] }`, accumulating every violation instead of
stopping at the first one. `providerManifestSchema` is a plain-object, JSON-Schema-*shaped*
description of the same rules (no `ajv` — this repo takes no new dependency for it); it exists so
the field vocabulary is documented as data rather than buried in conditionals.

## The 10 certification checks

`node scripts/certify-provider.js <provider-dir>` runs these checks against a provider package
directory and prints a ✅/❌ table. It exits `0` only if all 10 pass.

| # | Check | Charter point it satisfies |
| - | ----- | --------------------------- |
| 1 | `manifest.json` exists and validates against the schema above | (3) client/server split enforced by manifest; (9) version compatibility policy (semver) |
| 2 | `README.md` exists with `## Setup`, `## Security`, and `## Credentials` sections | (2) credential inventory documented; (5) setup + teardown guide; (6) threat notes + mitigations |
| 3 | `manifest.config.clientSafe` and `manifest.config.serverOnly` are disjoint sets | (3) client vs server capability split enforced by manifest |
| 4 | A file exists at the path in `manifest.docs.example` | (10) runnable example app |
| 5 | A `mock.ts` / `mock.js` file exists somewhere in the provider directory | (7) mock + contract tests |
| 6 | A `LICENSE` file exists, or `manifest.license` is set | packaging hygiene — required for a package to be redistributable |
| 7 | Every entry in `manifest.scopes` has a non-empty `why` | (4) least-privilege scopes documented |
| 8 | `manifest.runtimes` is a non-empty array | (1) framework/runtime support declared |
| 9 | Every non-relative SDK import found under the provider's `src/` is declared in `manifest.peerDependencies` (best-effort grep — it cannot see dynamic `import()`  built from a variable, conditional requires, etc.) | (1) framework/runtime support declared; (9) version compatibility policy |
| 10 | A test file exists (`*.test.ts(x)`, `*.spec.ts(x)`, or anything under `__tests__/`) | (7) mock + contract tests |

Point 8 of the charter checklist ("error/retry/rate-limit behavior defined") is intentionally
**not** a standalone automated check here — it's a design property of the adapter's request
handling, not something reliably detectable by static inspection of a directory. Provider
reviewers should confirm it by reading the adapter's source and the `## Security` section of its
README (which is required by check 2).

## Running it

```sh
node scripts/certify-provider.js path/to/provider-package
# or, from within this repo:
npm run certify:provider -- path/to/provider-package
```

Example output:

```
Provider certification: provider-supabase

  1. ✅ manifest.json exists and validates against the provider manifest schema
  2. ✅ README.md exists with required sections (## Setup, ## Security, ## Credentials)
  3. ✅ config.clientSafe and config.serverOnly are disjoint sets
  ...

Result: 10/10 checks passed.
```

The script exits `1` if any check fails (and prints the reasons under each ❌ line), and exits
`2` on usage errors (no directory given, or the directory doesn't exist) — distinct from a
failed certification so CI can tell "you ran it wrong" apart from "the provider isn't ready".

### Why the script doesn't import `src/plugins/manifest.ts`

`scripts/certify-provider.js` ships inside the published `minder-data-provider` npm package (see
`package.json`'s `files` list) so a third-party provider author can run it against their own
package without cloning this repo or installing extra tooling. At that point there is no
compiled build of `src/plugins/manifest.ts` available to `require()`, and pulling in a TypeScript
loader as a runtime dependency of the script would defeat the "zero dependencies" goal. Instead,
the script carries its own standalone copy of the schema rules (enums, name/semver/path
patterns). The two copies are kept in sync by hand — see the header comments in both files — and
cross-checked by `tests/provider-certification.test.ts`, which exercises the TypeScript validator
directly (unit tests) and the script via `child_process` (end-to-end against the fixtures below),
so drift between them shows up as a test failure.

## Fixtures

`tests/fixtures/providers/` holds two reference providers used by the test suite:

- **`good-provider/`** — a minimal but structurally complete fixture (modeled loosely on a
  Supabase adapter) that passes all 10 checks.
- **`bad-provider/`** — deliberately fails all 10 checks at once (unscoped name, non-semver
  version, empty `displayName`/`categories`, overlapping `clientSafe`/`serverOnly` keys, a scope
  missing `why`, empty `runtimes`, an unknown `frameworks` value, an absolute `docs.security`
  path, a `docs.example` pointing at a file that doesn't exist, no mock file, no LICENSE, no test
  file, and an `src/index.ts` that imports `stripe` without declaring it as a peer dependency).

Run the script against either fixture directly to see the checklist in action:

```sh
node scripts/certify-provider.js tests/fixtures/providers/good-provider
node scripts/certify-provider.js tests/fixtures/providers/bad-provider
```
