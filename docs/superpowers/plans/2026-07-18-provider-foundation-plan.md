# Provider Platform Foundation (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-platform foundation from the approved spec (docs/superpowers/specs/2026-07-18-provider-platform-design.md): typed credential model, edge-safe web-standard server handler core, capability-contract hooks, mock-mode plumbing, `minder` CLI skeleton, and the provider catalog generator — no provider adapters yet.

**Architecture:** Everything extends existing foundations — `SecretRef`/`resolveSecret` (src/security/secrets.ts, src/server.ts), `validateMinderConfig` serverOnly enforcement (src/config/validateConfig.ts), `ProviderManifest` + certification (src/plugins/manifest.ts), and the M1-05 testing harness. New surfaces: `src/security/credentials.ts`, `src/server/` (handler core; `src/server.ts` becomes the barrel), `src/contracts/`, `src/cli/` + `bin/minder.js`, `scripts/generate-catalog.js`.

**Tech Stack:** TypeScript, Jest 29 + ts-jest, tsup (splitting on), WebCrypto (`crypto.subtle`) for HMAC — no new runtime dependencies.

## Global Constraints (from spec — every task inherits)

- Server handler core is **edge-safe**: no `require()`, no Node-only APIs (`Buffer`, `fs`, `path`) in `src/server/**` or `src/contracts/**`; WebCrypto only. (CLI and scripts are Node — exempt.)
- No secret in client bundles/logs/errors/snapshots; masked output only; raw resolution only server-side via `resolveSecret`.
- Test credentials are generated at runtime — never scanner-matching literals (lesson: commit 4a4f84c).
- No provider SDK dependencies in core. No provider adapters in this plan.
- Backward compatible: no existing export changes; only additions.
- `react-hooks/rules-of-hooks` is an eslint ERROR — all new hooks must be unconditional.
- Every wave passes the full gate before commit: `npx jest --coverage` (exit 0), `npm run type-check`, `npm run lint:check` (0 errors), `npm run build`, dist-entry guard.

## Waves (by file-conflict analysis; orchestrator integrates + commits per task)

| Wave | Task | Model | Files (exclusive lock) |
|---|---|---|---|
| 1 | F-01 credential model | sonnet | src/security/credentials.ts (new), src/config/validateConfig.ts, tests |
| 1 | F-02 server handler core + webhook verify + Node mount | **opus** | src/server/ (new dir), src/server.ts (barrel conversion), tests |
| 1 | F-03 capability contracts + registry + hooks | sonnet | src/contracts/ (new), src/hooks/contracts.ts (new), tests |
| 1 | F-06 catalog generator | haiku | scripts/generate-catalog.js (new), docs/providers/CATALOG.md (generated), tests |
| 2 | F-04 mock-mode plumbing | sonnet | src/contracts/mockRegistry.ts (new), src/config/validateConfig.ts (mock flag), tests |
| 2 | F-05 minder CLI skeleton (init/add/doctor) | sonnet | bin/minder.js (new), src/cli/ (new), package.json (bin + files), tests |
| 2 | F-07 edge-safety regression guard | haiku | tests/edge-safety.test.ts (new) |

Sequencing: F-04 needs F-03's registry; F-05 needs F-01 (`describeCredential`) and F-02 (route templates); F-07 needs F-02's files to exist. Wave 2 file sets are disjoint from each other.

## Interfaces (the cross-task contract — exact names/types)

**F-01 produces** (`src/security/credentials.ts`):
```ts
export type CredentialInput =
  | SecretRef                                        // env-backed: secret('NAME')
  | { kind: 'serverConfig'; key: string }            // resolved from app's server config object
  | { kind: 'file'; source: 'path' | 'envJson'; ref: string };  // FileRef (Firebase wave activates)
export function isCredentialInput(v: unknown): v is CredentialInput;
/** SERVER-ONLY. Throws in browser. FileRef: reads/parses without logging contents. */
export function resolveCredential(c: CredentialInput, serverConfig?: Record<string, unknown>): Promise<string | object>;
/** Safe anywhere: masked description, e.g. { kind:'env', name:'STRIPE_***', present:true } — never values. */
export function describeCredential(c: CredentialInput): { kind: string; label: string; present: boolean };
```
Also: `validateMinderConfig` learns that any `providers.*` key holding a raw string where a `CredentialInput` is expected (heuristic: key matches SUSPICIOUS_KEY) in a browser env hard-fails naming the key + "wrap with secret()" fix — extends, does not replace, the existing serverOnly walker.

**F-02 produces** (`src/server/handlers.ts`, `src/server/webhooks.ts`, `src/server/nodeMount.ts`; `src/server.ts` re-exports all + keeps existing exports):
```ts
export interface MinderHandlerContext { serverConfig?: Record<string, unknown>; }
export type MinderHandler = (req: Request, ctx?: MinderHandlerContext) => Promise<Response>;
export interface WebhookVerifyOptions {
  secret: CredentialInput;
  signatureHeader: string;              // e.g. 'stripe-signature'
  algorithm: 'hmac-sha256';
  timestampToleranceSec?: number;       // default 300; 0 disables
  payloadFormat?: (body: string, timestamp?: string) => string; // default `${timestamp}.${body}` when timestamp present, else body
}
export function createWebhookHandler(opts: WebhookVerifyOptions & {
  onEvent: (event: { body: unknown; rawBody: string; headers: Headers }) => Promise<Response | void>;
}): MinderHandler;                       // 401 on bad signature (constant-time compare via crypto.subtle.verify), 400 on malformed, onEvent result or 200 otherwise
export function toNodeHandler(h: MinderHandler): (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void;  // lives in nodeMount.ts, type-only http import
```

**F-03 produces** (`src/contracts/index.ts` + per-capability files):
```ts
export type Capability = 'auth' | 'payments' | 'storage' | 'live';
export interface CapabilityProvider<T = unknown> { providerName: string; capability: Capability; implementation: T; getProviderClient(): unknown; }
export function registerCapabilityProvider(p: CapabilityProvider): () => void;  // returns unregister
export function getCapabilityProvider<T>(c: Capability): CapabilityProvider<T> | null;
// Contract shapes (interfaces only, implemented by future adapters):
export interface AuthContract { getSession(): Promise<{ userId: string; raw: unknown } | null>; signOut(): Promise<void>; }
export interface PaymentsContract { createCheckout(input: { items: unknown[]; successUrl: string; cancelUrl: string }): Promise<{ url: string }>; }
export interface StorageContract { upload(file: Blob | { uri: string }, path: string): Promise<{ url: string }>; remove(path: string): Promise<void>; }
export interface LiveContract { subscribe(channel: string, cb: (event: unknown) => void): () => void; }
```
Hooks (`src/hooks/contracts.ts`, exported from index + /web + /nextjs): `useAuth()`, `useCheckout()`, `useStorage()`, `useLive(channel, cb)` — unconditional hook order; when no provider registered they return `{ ready: false, error: MinderError('NO_PROVIDER_FOR_CAPABILITY', … names the capability and points to the catalog) }` rather than throwing during render.

**F-04 produces:** `registerMockProvider(capability, mockImpl)` + config recognition: `providers: { <name>: { mock: true } }` validated (boolean) and surfaced via `getProviderConfig(name)` helper; mocks built with M1-05's `createMockProvider` where a manifest exists.

**F-05 produces:** `bin/minder.js` (#!/usr/bin/env node, requires dist/cli or src via tsx fallback in dev) with subcommands: `init` (writes minder.config.ts template + .env.example entries, prints per-provider key-source deep-links table from a static registry), `add <provider>` (until adapters exist: prints "no certified providers yet — see docs/providers/CATALOG.md" and exits 1, but the template-writing machinery `writeScaffold(files: {path, content}[])` is implemented + tested), `doctor` (runs validateMinderConfig + describeCredential over providers config; masked table output; exit 1 on errors). package.json gains `"bin": {"minder": "./bin/minder.js"}` and files entry.

**F-06 produces:** `scripts/generate-catalog.js` scanning provider manifest.json files (tests/fixtures/providers/* now; providers/* later) + a `PLANNED` list constant → regenerates docs/providers/CATALOG.md with Certified/Community/Planned tables incl. per-provider runtimes/frameworks (mobile honesty). Idempotent; `npm run generate:catalog`.

**F-07 produces:** `tests/edge-safety.test.ts` — esbuild-bundles `src/server/handlers.ts` + `src/server/webhooks.ts` + `src/contracts/index.ts` with `platform: 'neutral'` (via esbuild CLI child process, per tests/dist-entry-exports.test.ts pattern) and asserts success with zero references to `require(`, `Buffer.`, `fs.`, `process.` (except `process.env` guarded reads) in the output; nodeMount.ts is exempt.

## Per-task TDD protocol (every task)

1. Write the failing tests listed in its acceptance criteria first; run to confirm failure.
2. Implement minimally; run the new tests to green.
3. Run the FULL gate (see Global Constraints). Report counts.
4. Orchestrator reviews diff scope → commits per task → updates BACKLOG.yaml (F-tasks added under M2-00 Foundation) + STATUS.md per wave.

## Acceptance criteria (orchestrator validates)

- **F-01**: resolveCredential throws in jsdom/browser env; EnvSecret resolves via existing resolveSecret; serverConfig kind reads the provided object; FileRef envJson decodes + parses, path reads file (Node only, dynamic import of fs INSIDE the function so the module stays edge-importable), contents never appear in any thrown error message (test asserts error text excludes payload); describeCredential masks (test: label contains at most first 4 chars + '***'); validateMinderConfig browser hard-fail names exact key.
- **F-02**: HMAC-SHA256 verification via crypto.subtle (test vector: known key/body/signature computed in-test with Node webcrypto); tampered body → 401; stale timestamp beyond tolerance → 401; tolerance 0 disables check; malformed → 400; onEvent Response passthrough; constant-time (uses crypto.subtle.verify, not string ===; asserted by code inspection test via source regex — no `=== signature` in webhooks.ts); toNodeHandler round-trips method/headers/body/status against a real http.Server on an ephemeral port; src/server.ts still exports resolveSecret etc. (regression).
- **F-03**: registry register/get/unregister; duplicate capability registration replaces with console.warn once; hooks return ready:false + NO_PROVIDER error without provider, live values with a registered fake; hook-order regression (rerender with/without provider — no hook-count crash); exports reachable from index + /web + /nextjs entries.
- **F-04**: mock:true config validates; registerMockProvider wires a capability provider flagged `isMock: true`; describeCredential/doctor output marks mock providers; a full useAuth flow works against a mock with zero credentials configured.
- **F-05**: CLI runs via child_process in tests: `minder init` creates files idempotently (second run no-clobber without --force); `minder add stripe` exits 1 with catalog pointer; `minder doctor` masked output contains no configured env values (expectNoSecretLeak-style scan of stdout); bin field present; `npm pack --dry-run` includes bin/ + dist/cli.
- **F-06**: catalog regenerates deterministically from fixtures; good-provider appears as Community (not Certified — certification requires our badge list constant); PLANNED entries (supabase, stripe, clerk, firebase, razorpay, sentry) rendered with "not yet available" wording; no overclaim strings ("all SDKs" forbidden — test greps the generated file).
- **F-07**: guard passes on current tree; seeded violation (a temp fixture importing fs into a copy of handlers) fails the bundle assertion — proves the guard discriminates.

## Verification checklist (before claiming the plan complete)

- [ ] All 7 tasks committed with per-task evidence in BACKLOG.yaml
- [ ] Full gate green (record exact counts) including the new edge-safety + dist-entry guards
- [ ] `npm pack --dry-run` reviewed (CLI + new entries ship; no stray files)
- [ ] Code review pass over the credential + webhook surfaces (security-sensitive)
- [ ] CHANGELOG entries + spec/plan cross-links
- [ ] No npm publish/release/tag/deploy performed
