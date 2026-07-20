/**
 * In-memory mock for the Auth.js provider — zero network, zero app route, zero
 * `next-auth`/`@auth/core` install. A behaviorally-parity implementation of the
 * `AuthContract` the real client adapter registers: `getSession` resolves a
 * deterministic signed-in session (`{ userId: 'authjs-mock-user', raw: {...} }`) —
 * or `null` once signed out — so an app can build its entire auth UI against
 * `useAuth()` with no Auth.js route mounted at all. Flip `providers.authjs.mock` to
 * `false` at integration time and the same hook lights up against the real REST
 * adapter (see ./src/index.ts).
 *
 * The signed-in state is module-level so demos and tests can toggle it through the
 * exported `setAuthjsMockSignedIn(...)` helper without holding the mock instance the
 * adapter registered internally.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { AuthContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** The mock's signed-in id, returned by every mock `getSession()` while signed in. */
export const MOCK_USER_ID = 'authjs-mock-user';
/** The mock's signed-in email, part of the mock session's `raw.user`. */
export const MOCK_USER_EMAIL = 'mock-user@example.com';

// Module-level so `setAuthjsMockSignedIn` reaches every mock instance (the mock is
// registered internally by the adapter; callers never hold the instance).
let mockSignedIn = true;

/**
 * Toggle the mock's signed-in state (demo/test helper). `true` → `getSession()`
 * returns the mock session; `false` → it returns `null`. Also serves as the
 * per-test reset back to a known state.
 */
export function setAuthjsMockSignedIn(signedIn: boolean): void {
  mockSignedIn = signedIn;
}

/**
 * Fresh in-memory AuthContract mock. `getSession` returns a deterministic
 * Auth.js-shaped session (`user.id`/`user.email` + an `expires` 24h in the future,
 * matching the real `toSession()` fail-closed contract) while signed in (`null`
 * otherwise); `signOut` clears the signed-in state.
 */
export function createMockAuth(): AuthContract {
  return {
    async getSession() {
      if (!mockSignedIn) return null;
      const raw = {
        user: { id: MOCK_USER_ID, email: MOCK_USER_EMAIL, name: 'Mock User' },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      return { userId: MOCK_USER_ID, raw };
    },
    async signOut() {
      mockSignedIn = false;
    },
  };
}

/**
 * Register the Auth.js auth mock as an `isMock: true` capability provider under the
 * `@minder/provider-authjs` name and return an unregister function.
 */
export function registerAuthjsMocks(): () => void {
  return registerMockProvider<AuthContract>('auth', createMockAuth(), '@minder/provider-authjs');
}
