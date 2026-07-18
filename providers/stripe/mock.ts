/**
 * In-memory mock for the Stripe provider — zero SDK, zero credentials, zero
 * network. A behaviorally-parity implementation of the `PaymentsContract` the
 * real client adapter registers: `createCheckout` returns a deterministic
 * `mock://stripe/checkout/<id>` URL so an app can build its entire checkout UI
 * against `useCheckout()` with no Stripe account and no server route. Flip
 * `providers.stripe.mock` to `false` at integration time and the same hook lights
 * up against the real adapter (see ./src/index.ts).
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { PaymentsContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/**
 * Fresh in-memory PaymentsContract mock. `createCheckout` returns a deterministic
 * `mock://stripe/checkout/<id>` URL, where `<id>` is a per-instance counter so a
 * given instance produces the same sequence of ids across runs.
 */
export function createMockPayments(): PaymentsContract {
  let counter = 0;
  return {
    async createCheckout() {
      counter += 1;
      const id = `cs_mock_${counter}`;
      return { url: `mock://stripe/checkout/${id}` };
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
