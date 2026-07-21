/**
 * In-memory mock for the Cognito provider — zero SDK, zero pool, zero network. A
 * behaviorally-parity implementation of the `AuthContract` the real client
 * adapter registers: `getSession` resolves a deterministic signed-in
 * `{ userId: 'cognito-mock-user', raw: { sub, 'cognito:username', email, exp, ... idToken } }`
 * (or `null` once signed out) so an app can build its entire auth UI against
 * `useAuth()` with no Cognito user pool and no keys. Flip
 * `providers.cognito.mock` to `false` at integration time and the same hook
 * lights up against the real adapter (see ./src/index.ts).
 *
 * The mock's `raw.idToken` is a STRUCTURALLY-VALID fake JWT (three base64url
 * segments — header.payload.signature) built from the same Cognito-shaped
 * claims returned in `raw`, so tests/tools that expect "a JWT-shaped string"
 * (e.g. decoding it to inspect claims) work against the mock exactly like they
 * would against a real Cognito ID token. The signature segment is NOT
 * cryptographically valid — it is a fixed placeholder — this is a mock, never
 * meant to pass real verification.
 *
 * The signed-in state is module-level so demos and tests can toggle it through
 * the exported `setCognitoMockSignedIn(...)` helper without holding the mock
 * instance the adapter registered internally.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs (uses the web-standard `btoa`,
 * available as a global in Node >=20, browsers, and edge runtimes) — pure
 * web-standard JS.
 */
import type { AuthContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** The mock's signed-in id, returned by every mock `getSession()` while signed in. */
export const MOCK_USER_ID = 'cognito-mock-user';
/** The mock's `cognito:username` claim. */
export const MOCK_USERNAME = 'cognito-mock-user';
/** The mock's `email` claim. */
export const MOCK_EMAIL = 'mock-user@example.com';
/** The mock's `iss` claim (a plausible, non-resolvable Cognito issuer URL). */
export const MOCK_ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_MOCKPOOL';
/** The mock's `aud` / `client_id` claim. */
export const MOCK_CLIENT_ID = 'mock-app-client-id';

// Module-level so `setCognitoMockSignedIn` reaches every mock instance (the mock
// is registered internally by the adapter; callers never hold the instance).
let mockSignedIn = true;

/**
 * Toggle the mock's signed-in state (demo/test helper). `true` -> `getSession()`
 * returns the mock session; `false` -> it returns `null`. Also serves as the
 * per-test reset back to a known state.
 */
export function setCognitoMockSignedIn(signedIn: boolean): void {
  mockSignedIn = signedIn;
}

/** base64url-encode a UTF-8 string using the web-standard `btoa`. */
function toBase64Url(input: string): string {
  // btoa operates on a "binary string" (one UTF-16 code unit per byte); encodeURIComponent
  // + unescape is the standard shim for encoding arbitrary UTF-8 text through it.
  const binary = unescape(encodeURIComponent(input));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build a structurally-valid (but not cryptographically valid) fake JWT: three
 * base64url segments (header.payload.signature) carrying the given claims as
 * the payload. Mirrors the shape of a real Cognito ID token closely enough for
 * mock-mode tooling that decodes JWTs to inspect claims.
 */
export function createFakeIdToken(claims: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'mock-kid' };
  const headerSeg = toBase64Url(JSON.stringify(header));
  const payloadSeg = toBase64Url(JSON.stringify(claims));
  const signatureSeg = toBase64Url('mock-signature-not-cryptographically-valid');
  return `${headerSeg}.${payloadSeg}.${signatureSeg}`;
}

/**
 * Fresh in-memory AuthContract mock. `getSession` returns a deterministic
 * Cognito-ID-token-claims-shaped session (`sub`, `cognito:username`, `email`,
 * and an `exp` 24h in the future, matching the real `toSession()` fail-closed
 * contract) while signed in (`null` otherwise); `signOut` clears the signed-in
 * state.
 */
export function createMockAuth(): AuthContract {
  return {
    async getSession() {
      if (!mockSignedIn) return null;
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        sub: MOCK_USER_ID,
        'cognito:username': MOCK_USERNAME,
        email: MOCK_EMAIL,
        email_verified: true,
        token_use: 'id',
        iss: MOCK_ISSUER,
        aud: MOCK_CLIENT_ID,
        iat: now,
        exp: now + 24 * 60 * 60,
      };
      const idToken = createFakeIdToken(claims);
      return { userId: MOCK_USER_ID, raw: { ...claims, idToken } };
    },
    async signOut() {
      mockSignedIn = false;
    },
  };
}

/**
 * Register the Cognito auth mock as an `isMock: true` capability provider
 * under the `@minder/provider-cognito` name and return an unregister function.
 */
export function registerCognitoMocks(): () => void {
  return registerMockProvider<AuthContract>('auth', createMockAuth(), '@minder/provider-cognito');
}
