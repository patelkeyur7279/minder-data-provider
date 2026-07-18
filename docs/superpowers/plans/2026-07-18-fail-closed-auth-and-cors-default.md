# Fail-Closed Auth + Safe CORS Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AuthManager.isAuthenticated()` fail closed on corrupt JWTs and replace the shipped wildcard-CORS-with-credentials default with a safe, configurable factory.

**Architecture:** Add an `isJwtShaped()` helper to the single JWT utility so the auth manager can distinguish opaque tokens (presence-based auth, unchanged) from JWT-shaped-but-corrupt tokens (now rejected). Convert `corsMiddleware.ts` from a hardcoded singleton into `createCorsMiddleware(options)` that refuses `credentials: true` + `origin: '*'` (the same rule `CorsManager.validateConfig()` already enforces), keeping a backward-compatible default export.

**Tech Stack:** TypeScript, Jest 29 + ts-jest (jsdom), `cors` package.

## Global Constraints

- This is the v2.2.0 beta line; behavior changes are allowed but MUST be listed in `CHANGELOG.md` under `2.2.0-beta.1` (Unreleased) with migration notes.
- `src/utils/jwt.ts` is the single source of truth for JWT handling — no new JWT parsing anywhere else.
- `parseJWT` must remain never-throwing.
- Do not remove the `export default corsMiddleware` — `src/core/ProxyManager.ts:74-81` loads it via `require.resolve('./corsMiddleware')`.
- Preserve the existing DebugManager logging pattern in `isAuthenticated()` (guarded by `this.debugManager && this.enableLogs`).
- Existing tests that assert the OLD fail-open behavior must be UPDATED (not deleted): `tests/bug5-jwt-parsing.test.ts`, `tests/auth-manager.test.ts:146-158`. Check `tests/security.test.ts:350-370` — if it asserts opaque-token validity it stays as-is.
- Signature verification is explicitly OUT OF SCOPE (client library cannot hold secrets); the deliverable is documenting that limitation, not implementing verification.

---

### Task 1: `isJwtShaped()` helper in the JWT utility

**Files:**
- Modify: `src/utils/jwt.ts` (append after `parseJWT`)
- Test: `tests/jwt.test.ts` (append new describe block)

**Interfaces:**
- Produces: `isJwtShaped(token: string | null | undefined): boolean` — true iff token is a string with exactly 3 dot-separated segments and a non-empty header+payload. Task 2 consumes it.

- [x] **Step 1: Write the failing test** — append to `tests/jwt.test.ts`:

```ts
describe('isJwtShaped', () => {
  it('recognizes 3-segment JWT-shaped tokens (even if payload is garbage)', () => {
    expect(isJwtShaped(token({ sub: '1' }))).toBe(true);
    expect(isJwtShaped('aaa.@@@garbage@@@.ccc')).toBe(true);
  });

  it('rejects opaque and malformed shapes', () => {
    for (const t of ['', 'opaque-session-id-12345', 'a.b', 'a.b.c.d', '..', 'a..c', null, undefined]) {
      expect(isJwtShaped(t as any)).toBe(false);
    }
  });
});
```

and add `isJwtShaped` to the import at the top of the file.

- [x] **Step 2: Run test to verify it fails** — `npx jest tests/jwt.test.ts -t isJwtShaped` → FAIL (`isJwtShaped` is not exported).

- [x] **Step 3: Minimal implementation** — append to `src/utils/jwt.ts`:

```ts
/**
 * True iff the token has the structural shape of a JWT (three dot-separated
 * segments with non-empty header and payload). Says nothing about validity —
 * use it to decide whether JWT semantics (expiry checks) apply at all, vs.
 * an opaque bearer token that cannot be inspected client-side.
 */
export function isJwtShaped(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && !!parts[0] && !!parts[1];
}
```

- [x] **Step 4: Run test to verify it passes** — `npx jest tests/jwt.test.ts` → all PASS.

- [x] **Step 5: Commit** — `git add src/utils/jwt.ts tests/jwt.test.ts && git commit -m "feat: add isJwtShaped() to the shared JWT utility"`

### Task 2: Fail-closed `isAuthenticated()`

**Files:**
- Modify: `src/core/AuthManager.ts:160-209` (replace method body), `src/core/AuthManager.ts:2` (import)
- Modify: `tests/bug5-jwt-parsing.test.ts` (flip expectations for JWT-shaped corrupt tokens)
- Modify: `tests/auth-manager.test.ts:146-158` (flip "Falls back to treating as valid" cases)
- Test: `tests/auth-fail-closed.test.ts` (new)

**Interfaces:**
- Consumes: `isJwtShaped` from Task 1.
- Produces: `isAuthenticated(): boolean` with the behavior table below (Task 3+docs rely on it):

| Token | Old | New |
|---|---|---|
| none | false | false |
| opaque (not JWT-shaped) | true | true (unchanged) |
| JWT, future `exp` | true | true |
| JWT, past `exp` | false | false |
| JWT, no `exp` | true | true |
| JWT-shaped, undecodable payload | **true** | **false** |
| JWT, non-numeric `exp` | **true** | **false** |

- [x] **Step 1: Write the failing test** — create `tests/auth-fail-closed.test.ts`:

```ts
/**
 * @jest-environment jsdom
 *
 * Security hardening: isAuthenticated() fails CLOSED on JWT-shaped tokens it
 * cannot decode, instead of treating them as valid. Opaque (non-JWT) bearer
 * tokens keep presence-based semantics — they cannot be inspected client-side.
 */
import { describe, it, expect } from '@jest/globals';
import { AuthManager } from '../src/core/AuthManager';
import { StorageType } from '../src/constants/enums';

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (payload: object) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;

const managerWith = (token: string) => {
  const m = new AuthManager({ tokenKey: 'accessToken', storage: StorageType.MEMORY });
  m.setToken(token);
  return m;
};

describe('isAuthenticated() fail-closed hardening', () => {
  it('rejects a JWT-shaped token with an undecodable payload', () => {
    expect(managerWith('aaa.@@@not-base64@@@.ccc').isAuthenticated()).toBe(false);
  });

  it('rejects a JWT-shaped token whose payload is not JSON', () => {
    const notJson = Buffer.from('this is not json').toString('base64url');
    expect(managerWith(`aaa.${notJson}.ccc`).isAuthenticated()).toBe(false);
  });

  it('rejects a JWT with a non-numeric exp claim', () => {
    expect(managerWith(jwt({ exp: 'tomorrow' })).isAuthenticated()).toBe(false);
  });

  it('still accepts an opaque non-JWT token (presence-based)', () => {
    expect(managerWith('opaque-session-id-12345').isAuthenticated()).toBe(true);
  });

  it('still accepts a valid JWT with future exp and one with no exp', () => {
    expect(managerWith(jwt({ exp: Date.now() / 1000 + 3600 })).isAuthenticated()).toBe(true);
    expect(managerWith(jwt({ sub: 'no-exp' })).isAuthenticated()).toBe(true);
  });

  it('still rejects an expired JWT and exp=0', () => {
    expect(managerWith(jwt({ exp: Date.now() / 1000 - 3600 })).isAuthenticated()).toBe(false);
    expect(managerWith(jwt({ exp: 0 })).isAuthenticated()).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails** — `npx jest tests/auth-fail-closed.test.ts` → the three "rejects" cases FAIL (currently return true).

- [x] **Step 3: Implementation** — in `src/core/AuthManager.ts` change line 2 to `import { parseJWT as decodeJwt, isJwtShaped } from '../utils/jwt.js';` and replace the `isAuthenticated()` body (lines 160-209) with:

```ts
  /**
   * Client-side authentication check. IMPORTANT: this only inspects token
   * presence and (for JWTs) the `exp` claim — it does NOT verify the JWT
   * signature (a client bundle cannot hold signing secrets). Server-side
   * consumers (./server, ./nextjs, ./node entries) MUST verify signatures
   * themselves (e.g. with `jose`/`jsonwebtoken`) before trusting a request.
   *
   * Fails closed: a JWT-shaped token whose payload cannot be decoded, or
   * whose `exp` claim is present but non-numeric, is treated as NOT
   * authenticated. Opaque (non-JWT) tokens keep presence-based semantics.
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.AUTH, '❌ AUTH CHECK: No token', {});
      }
      return false;
    }

    // Opaque bearer token: nothing to inspect client-side, presence-based.
    if (!isJwtShaped(token)) {
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.AUTH, '✅ AUTH CHECK: Non-JWT token', {});
      }
      return true;
    }

    const payload = decodeJwt(token);
    if (!payload) {
      // JWT-shaped but undecodable: fail closed.
      if (this.debugManager && this.enableLogs) {
        this.debugManager.log(DebugLogType.AUTH, '❌ AUTH CHECK: Corrupt JWT rejected', {});
      }
      return false;
    }

    const now = Date.now() / 1000;
    const isValid =
      payload.exp === undefined
        ? true // No expiration claim: token doesn't expire client-side.
        : typeof payload.exp === 'number'
          ? payload.exp > now
          : false; // Malformed exp claim: fail closed.

    if (this.debugManager && this.enableLogs) {
      const emoji = isValid ? '✅' : '⏰';
      const status = isValid ? 'VALID' : 'EXPIRED';
      this.debugManager.log(DebugLogType.AUTH, `${emoji} AUTH CHECK: ${status}`, {
        exp: payload.exp,
        expType: typeof payload.exp,
        now,
        isValid,
      });
    }

    return isValid;
  }
```

(The old `try/catch` goes away: `parseJWT` never throws by contract.)

- [x] **Step 4: Update the tests that encoded fail-open** —
  - `tests/auth-manager.test.ts:146-158`: the two `// Falls back to treating as valid` cases. Inspect each token: if it is JWT-shaped (3 segments) flip the expectation to `false` and rename the `it` to say "fails closed"; if it is not JWT-shaped, keep `true`.
  - `tests/bug5-jwt-parsing.test.ts`: keep every `.not.toThrow()` assertion (that bug stays fixed); for assertions on the *return value* of JWT-shaped corrupt tokens, flip `true` → `false` and update the comment from "treat as valid" to "fail closed". Non-JWT-shaped cases keep `true`.
  - `tests/security.test.ts:350-370`: read the two cases; only change them if they use a JWT-shaped corrupt token (expected: they cover opaque/expired and need no change).

- [x] **Step 5: Run the full auth test set** — `npx jest tests/auth-fail-closed.test.ts tests/bug5-jwt-parsing.test.ts tests/auth-manager.test.ts tests/security.test.ts tests/jwt.test.ts` → all PASS.

- [x] **Step 6: Commit** — `git commit -am "fix!: isAuthenticated() fails closed on corrupt JWT-shaped tokens"`

### Task 3: Safe CORS middleware factory

**Files:**
- Modify: `src/core/corsMiddleware.ts` (full rewrite below)
- Test: `tests/cors-middleware-default.test.ts` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createCorsMiddleware(options?: CorsMiddlewareOptions): (req, res) => Promise<unknown>`; default export unchanged in shape (a `(req, res) => Promise` function) so `ProxyManager`'s `require()` keeps working.

- [x] **Step 1: Write the failing test** — create `tests/cors-middleware-default.test.ts`:

```ts
/**
 * The default CORS middleware must never ship the wildcard-origin +
 * credentials combination (the same rule CorsManager.validateConfig enforces).
 */
import corsMiddleware, { createCorsMiddleware } from '../src/core/corsMiddleware';
import { EventEmitter } from 'events';

// Minimal req/res doubles for the `cors` package.
const makeReqRes = (origin = 'https://evil.example') => {
  const req: any = { method: 'GET', headers: { origin } };
  const res: any = new EventEmitter();
  res.headers = {} as Record<string, string>;
  res.setHeader = (k: string, v: string) => { res.headers[k.toLowerCase()] = v; };
  res.getHeader = (k: string) => res.headers[k.toLowerCase()];
  res.statusCode = 200;
  res.end = () => undefined;
  return { req, res };
};

describe('corsMiddleware safe default', () => {
  it('default middleware does NOT send Access-Control-Allow-Credentials', async () => {
    const { req, res } = makeReqRes();
    await corsMiddleware(req, res);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('createCorsMiddleware throws on credentials + wildcard origin', () => {
    expect(() => createCorsMiddleware({ origin: '*', credentials: true }))
      .toThrow(/credentials.*wildcard|wildcard.*credentials/i);
  });

  it('createCorsMiddleware allows credentials with an explicit origin allowlist', async () => {
    const mw = createCorsMiddleware({
      origin: ['https://app.example.com'],
      credentials: true,
    });
    const { req, res } = makeReqRes('https://app.example.com');
    await mw(req, res);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });
});
```

- [x] **Step 2: Run test to verify it fails** — `npx jest tests/cors-middleware-default.test.ts` → FAIL (no named export; default sends credentials header).

- [x] **Step 3: Implementation** — replace `src/core/corsMiddleware.ts` with:

```ts
import Cors from 'cors';

export interface CorsMiddlewareOptions {
  /** Allowed origin(s). Default `'*'` (public API, no credentials). */
  origin?: string | RegExp | Array<string | RegExp>;
  methods?: string[];
  allowedHeaders?: string[];
  /**
   * Send `Access-Control-Allow-Credentials`. Requires an explicit `origin`
   * allowlist — combining it with the wildcard is the canonical unsafe CORS
   * configuration and is rejected (mirrors CorsManager.validateConfig()).
   */
  credentials?: boolean;
}

export function createCorsMiddleware(options: CorsMiddlewareOptions = {}) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    credentials = false,
  } = options;

  if (credentials && origin === '*') {
    throw new Error(
      '[minder-data-provider] Refusing to create CORS middleware with credentials enabled ' +
        'and a wildcard origin. Pass an explicit origin allowlist when using credentials.'
    );
  }

  const cors = Cors({ methods, origin, allowedHeaders, credentials });

  return (req: any, res: any) =>
    new Promise((resolve, reject) => {
      cors(req, res, (result) => {
        if (result instanceof Error) {
          return reject(result);
        }
        return resolve(result);
      });
    });
}

/**
 * Backward-compatible default: wildcard origin WITHOUT credentials.
 * (Before 2.2.0-beta.1 this default was `origin: '*'` + `credentials: true` —
 * the unsafe combination the library's own CorsManager flags.)
 */
const corsMiddleware = createCorsMiddleware();

export default corsMiddleware;
```

- [x] **Step 4: Run tests** — `npx jest tests/cors-middleware-default.test.ts tests/cors-handling.test.ts tests/cors-hardening.test.ts tests/generic-proxy.test.ts tests/auto-proxy.test.tsx` → all PASS (proxy tests confirm ProxyManager still works).

- [x] **Step 5: Commit** — `git commit -am "fix!: default CORS middleware no longer combines wildcard origin with credentials"`

### Task 4: Changelog, migration notes, and docs

**Files:**
- Modify: `CHANGELOG.md` (new `[2.2.0-beta.1] - Unreleased` section at top)
- Modify: `README.md` (security note in the auth section)
- Modify: `docs/superpowers/plans/2026-07-18-fail-closed-auth-and-cors-default.md` (tick checkboxes)

- [x] **Step 1: CHANGELOG entry** — add above the `2.2.0-beta.0` entry:

```markdown
## [2.2.0-beta.1] - Unreleased

### Changed (security — behavior changes)

- **`AuthManager.isAuthenticated()` now fails closed.** A JWT-shaped token
  (three dot-separated segments) whose payload cannot be decoded, or whose
  `exp` claim is non-numeric, is now treated as **not** authenticated
  (previously: treated as valid). Opaque non-JWT tokens are unchanged
  (presence-based). **Migration:** if your app intentionally stores
  JWT-shaped-but-not-JWT strings as tokens, either store them without dots or
  gate on `getToken() !== null` instead of `isAuthenticated()`. Note that
  `isAuthenticated()` has never verified JWT signatures — server-side code
  must verify tokens itself.
- **Default CORS middleware no longer sends credentials with a wildcard
  origin.** The internal proxy's CORS default changes from
  `origin: '*', credentials: true` (invalid per the CORS spec and flagged by
  our own `CorsManager.validateConfig()`) to `origin: '*', credentials: false`.
  **Migration:** if you need credentialed cross-origin requests through the
  proxy, use the new `createCorsMiddleware({ origin: ['https://app.example.com'], credentials: true })`.

### Added

- `createCorsMiddleware(options)` factory (rejects credentials + wildcard).
- `isJwtShaped(token)` exported from the JWT utility.
```

- [x] **Step 2: README security note** — in the authentication section, add a short "Security model" paragraph: client-side `isAuthenticated()` = presence + expiry only, no signature verification; corrupt JWTs rejected as of 2.2.0-beta.1; link to CHANGELOG migration notes.

- [x] **Step 3: Full verification** — `npm run lint:check && npm run type-check && npx jest && npm run build` → all green. Record actual output.

- [x] **Step 4: Commit** — `git commit -am "docs: changelog + migration notes for fail-closed auth and CORS default"`

## Verification checklist (before claiming done)

- [x] All 4 tasks committed on `fix/fail-closed-auth-and-cors-default`
- [x] Full jest suite passes — 86 suites passed / 1 suite skipped; 1592 tests passed, 31 skipped (pre-existing skips), 0 failures
- [x] `npm run type-check` clean
- [x] `npm run lint:check` clean (pre-existing warnings only, 0 errors)
- [x] `npm run build` succeeds
- [x] Code review requested (or simulated via /code-review)
- [x] CHANGELOG + migration notes present
