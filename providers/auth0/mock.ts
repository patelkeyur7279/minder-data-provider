/**
 * In-memory mock for the Auth0 provider — zero SDK, zero keys, zero network. A
 * behaviorally-parity implementation of the `AuthContract` the real client
 * adapter registers: `getSession` resolves a deterministic signed-in
 * `{ userId: 'auth0-mock-user', raw: { sub: 'auth0-mock-user', ... } }` (or `null`
 * once signed out) so an app can build its entire auth UI against `useAuth()`
 * with no Auth0 tenant and no keys. Flip `providers.auth0.mock` to `false` at
 * integration time and the same hook lights up against the real adapter (see
 * ./src/index.ts).
 *
 * The signed-in state is module-level so demos and tests can toggle it through
 * the exported `setAuth0MockSignedIn(...)` helper without holding the mock
 * instance the adapter registered internally.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { AuthContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** The mock's signed-in id, returned by every mock `getSession()` while signed in. */
export const MOCK_USER_ID = 'auth0-mock-user';

// Module-level so `setAuth0MockSignedIn` reaches every mock instance (the mock is
// registered internally by the adapter; callers never hold the instance).
let mockSignedIn = true;

/**
 * Toggle the mock's signed-in state (demo/test helper). `true` → `getSession()`
 * returns the mock session; `false` → it returns `null`. Also serves as the
 * per-test reset back to a known state.
 */
export function setAuth0MockSignedIn(signedIn: boolean): void {
  mockSignedIn = signedIn;
}

/**
 * Fresh in-memory AuthContract mock. `getSession` returns a deterministic
 * Auth0-ID-token-claims-shaped session (`sub` + an `exp` 24h in the future,
 * matching the real `toSession()` fail-closed contract) while signed in (`null`
 * otherwise); `signOut` clears the signed-in state.
 */
export function createMockAuth(): AuthContract {
  return {
    async getSession() {
      if (!mockSignedIn) return null;
      const raw = {
        sub: MOCK_USER_ID,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };
      return { userId: MOCK_USER_ID, raw };
    },
    async signOut() {
      mockSignedIn = false;
    },
  };
}

/**
 * Register the Auth0 auth mock as an `isMock: true` capability provider under the
 * `@minder/provider-auth0` name and return an unregister function.
 */
export function registerAuth0Mocks(): () => void {
  return registerMockProvider<AuthContract>('auth', createMockAuth(), '@minder/provider-auth0');
}
