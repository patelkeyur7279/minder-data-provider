/**
 * In-memory mock for the Razorpay provider — zero SDK, zero credentials, zero
 * network. A behaviorally-parity implementation of the `PaymentsContract` the
 * real client adapter registers: `createCheckout` resolves a deterministic
 * `mock://razorpay/order/order_mock_<n>` URL so an app can build its entire
 * checkout UI against `useCheckout()` with no Razorpay account and no server
 * route. Flip `providers.razorpay.mock` to `false` at integration time and the
 * same hook lights up against the real adapter (see ./src/index.ts).
 *
 * Every mock order is recorded (see `getMockOrderCalls`) so tests and demos can
 * assert on what the UI requested without any network.
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs — pure web-standard JS.
 */
import type { PaymentsContract } from '../../src/contracts/types.js';
import { registerMockProvider } from '../../src/contracts/mockRegistry.js';

/** A recorded mock order: the inputs the UI passed + the URL handed back. */
export interface MockOrderCall {
  items: unknown[];
  successUrl: string;
  cancelUrl: string;
  url: string;
}

// Module-level so `getMockOrderCalls` reflects every mock order (the mock is
// registered internally by the adapter; callers never hold the instance) and the
// order counter is monotonic across the process.
const mockOrderCalls: MockOrderCall[] = [];
let orderCounter = 0;

/** All mock orders recorded so far (a copy — safe to keep/iterate). */
export function getMockOrderCalls(): MockOrderCall[] {
  return mockOrderCalls.slice();
}

/** Test/demo helper: clear the recorded mock order calls + reset the counter. */
export function __resetMockOrderCalls(): void {
  mockOrderCalls.length = 0;
  orderCounter = 0;
}

/**
 * Fresh in-memory PaymentsContract mock. `createCheckout` resolves a
 * deterministic `mock://razorpay/order/order_mock_<n>` URL (monotonic counter)
 * and records the call.
 */
export function createMockPayments(): PaymentsContract {
  return {
    async createCheckout(input) {
      orderCounter += 1;
      const url = `mock://razorpay/order/order_mock_${orderCounter}`;
      mockOrderCalls.push({
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
 * Register the Razorpay payments mock as an `isMock: true` capability provider
 * under the `@minder/provider-razorpay` name and return an unregister function.
 */
export function registerRazorpayMocks(): () => void {
  return registerMockProvider<PaymentsContract>('payments', createMockPayments(), '@minder/provider-razorpay');
}
