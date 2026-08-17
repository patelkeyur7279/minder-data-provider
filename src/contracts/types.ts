/**
 * Capability Contracts
 *
 * EDGE-SAFE: no `require()`, no Node-only APIs. These are pure TypeScript interfaces —
 * implemented by provider adapters (not shipped in this package yet; see the plan) and
 * consumed by the client hooks in `src/hooks/contracts.ts`.
 */

/** Auth capability: session lookup + sign-out. */
export interface AuthContract {
  getSession(): Promise<{ userId: string; raw: unknown } | null>;
  signOut(): Promise<void>;
}

/** Payments capability: hosted checkout session creation. */
export interface PaymentsContract {
  createCheckout(input: {
    items: unknown[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
}

/** Storage capability: blob upload/removal. */
export interface StorageContract {
  upload(file: Blob | { uri: string }, path: string): Promise<{ url: string }>;
  remove(path: string): Promise<void>;
}

/** Live capability: realtime channel subscription. */
export interface LiveContract {
  /** Subscribe to `channel`; returns an unsubscribe function. */
  subscribe(channel: string, cb: (event: unknown) => void): () => void;
}
