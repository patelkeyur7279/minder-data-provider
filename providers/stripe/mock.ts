/**
 * In-memory mock for the Stripe provider — zero SDK, zero credentials, zero
 * network. A behaviorally-parity implementation of the `PaymentsContract` the
 * real client adapter registers: `createCheckout` resolves a deterministic
 * `mock://checkout/session_<n>` URL so an app can build its entire checkout UI
 * against `useCheckout()` with no Stripe account and no server route. Flip
 * `providers.stripe.mock` to `false` at integration time and the same hook lights
 * up against the real adapter (see ./src/index.ts).
 *
 * Every mock checkout is recorded (see `getMockCheckoutCalls`) so tests and demos
 * can assert on what the UI requested without any network.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { PaymentsContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** A recorded mock checkout: the inputs the UI passed + the URL handed back. */
export interface MockCheckoutCall {
  items: unknown[];
  successUrl: string;
  cancelUrl: string;
  url: string;
}

// Module-level so `getMockCheckoutCalls` reflects every mock checkout (the mock is
// registered internally by the adapter; callers never hold the instance) and the
// session counter is monotonic across the process.
const mockCheckoutCalls: MockCheckoutCall[] = [];
let checkoutCounter = 0;

/** All mock checkouts recorded so far (a copy — safe to keep/iterate). */
export function getMockCheckoutCalls(): MockCheckoutCall[] {
  return mockCheckoutCalls.slice();
}

/** Test/demo helper: clear the recorded mock checkout calls + reset the counter. */
export function __resetMockCheckoutCalls(): void {
  mockCheckoutCalls.length = 0;
  checkoutCounter = 0;
}

/**
 * Fresh in-memory PaymentsContract mock. `createCheckout` resolves a deterministic
 * `mock://checkout/session_<n>` URL (monotonic counter) and records the call.
 */
export function createMockPayments(): PaymentsContract {
  return {
    async createCheckout(input) {
      checkoutCounter += 1;
      const url = `mock://checkout/session_${checkoutCounter}`;
      mockCheckoutCalls.push({
        items: input.items,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        url,
      });
      return { url };
    },
  };
}

/**
 * Register the Stripe payments mock as an `isMock: true` capability provider
 * under the `@minder/provider-stripe` name and return an unregister function.
 */
export function registerStripeMocks(): () => void {
  return registerMockProvider<PaymentsContract>('payments', createMockPayments(), '@minder/provider-stripe');
}
