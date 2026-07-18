/**
 * Deliberately imports an SDK ("stripe") that is NOT declared in manifest.json's
 * peerDependencies (which is empty), so scripts/certify-provider.js's point-9 check fails.
 */
import Stripe from 'stripe';

export function createBrokenProvider(secretKey: string) {
  return new Stripe(secretKey);
}
