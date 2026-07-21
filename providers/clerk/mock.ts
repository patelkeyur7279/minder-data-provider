/**
 * In-memory mock for the Clerk provider — zero SDK, zero credentials, zero
 * network. A behaviorally-parity implementation of the `AuthContract` the real
 * client adapter registers: `getSession` resolves a deterministic signed-in
 * `{ userId: 'clerk-mock-user', raw: {} }` (or `null` once signed out) so an app
 * can build its entire auth UI against `useAuth()` with no Clerk account and no
 * keys. Flip `providers.clerk.mock` to `false` at integration time and the same
 * hook lights up against the real adapter (see ./src/index.ts).
 *
 * The signed-in state is module-level so demos and tests can toggle it through
 * the exported `setClerkMockSignedIn(...)` helper without holding the mock
 * instance the adapter registered internally.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { AuthContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** The mock's signed-in id, returned by every mock `getSession()` while signed in. */
export const MOCK_USER_ID = 'clerk-mock-user';

// Module-level so `setClerkMockSignedIn` reaches every mock instance (the mock is
// registered internally by the adapter; callers never hold the instance).
let mockSignedIn = true;

/**
 * Toggle the mock's signed-in state (demo/test helper). `true` → `getSession()`
 * returns the mock session; `false` → it returns `null`. Also serves as the
 * per-test reset back to a known state.
 */
export function setClerkMockSignedIn(signedIn: boolean): void {
  mockSignedIn = signedIn;
}

/**
 * Fresh in-memory AuthContract mock. `getSession` returns the deterministic mock
 * session while signed in (`null` otherwise); `signOut` clears the signed-in
 * state (module-level, so it is observable via `getSession` and the toggle helper).
 */
export function createMockAuth(): AuthContract {
  return {
    async getSession() {
      return mockSignedIn ? { userId: MOCK_USER_ID, raw: {} } : null;
    },
    async signOut() {
      mockSignedIn = false;
    },
  };
}

/**
 * Register the Clerk auth mock as an `isMock: true` capability provider under the
 * `@minder/provider-clerk` name and return an unregister function.
 */
export function registerClerkMocks(): () => void {
  return registerMockProvider<AuthContract>('auth', createMockAuth(), '@minder/provider-clerk');
}
