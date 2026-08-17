/**
 * Offline Module Types
 * Type definitions for offline support functionality
 */

import type { StorageAdapter } from '../adapters/storage/StorageAdapter.js';

/**
 * Network connection state
 */
export interface NetworkState {
  /**
   * Is connected to internet
   */
  isConnected: boolean;

  /**
   * Connection type (wifi, cellular, ethernet, etc.)
   */
  type?: string;

  /**
   * Is connection expensive (cellular data)
   */
  isExpensive?: boolean;

  /**
   * Is connection metered
   */
  isMetered?: boolean;
}

/**
 * Queued request configuration
 */
export interface QueuedRequest {
  /**
   * Unique request ID
   */
  id: string;

  /**
   * HTTP method
   */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /**
   * Request URL
   */
  url: string;

  /**
   * Request headers
   */
  headers?: Record<string, string>;

  /**
   * Request body
   */
  body?: unknown;

  /**
   * Request priority (higher = processed first)
   * @default 0
   */
  priority?: number;

  /**
   * Timestamp when request was queued
   */
  queuedAt: number;

  /**
   * Number of retry attempts
   */
  retries: number;

  /**
   * Max retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Last error message
   */
  lastError?: string;

  /**
   * Metadata for application use
   */
  metadata?: Record<string, unknown>;
}

/**
 * Sync statistics
 */
export interface SyncStats {
  /**
   * Total requests in queue
   */
  total: number;

  /**
   * Successfully synced requests
   */
  successful: number;

  /**
   * Failed requests
   */
  failed: number;

  /**
   * Requests still pending
   */
  pending: number;

  /**
   * Sync duration in milliseconds
   */
  duration: number;

  /**
   * Error messages from failed requests
   */
  errors: Array<{ requestId: string; error: string }>;
}

/**
 * Conflict resolution strategy applied to a queued mutation that replays into
 * a 409/412 (or any status in {@link OfflineConfig.conflictStatuses}).
 *
 * `'server-wins'|'client-wins'|'manual'` are the original (now-wired) members;
 * `'last-write-wins'` and `'merge'` are new. `'client-wins'` is an alias of
 * `'last-write-wins'`; `'manual'` is an alias of `'merge'` — both alias pairs
 * produce identical outcomes (Spec 5.1 §10.5).
 */
export type ConflictStrategy = 'last-write-wins' | 'server-wins' | 'client-wins' | 'merge' | 'manual';

/**
 * Context passed to {@link OfflineConfig.resolveConflict} for a single
 * conflicting replay.
 */
export interface ConflictContext {
  /** The queued (client) mutation that produced the conflict. */
  request: QueuedRequest;

  /** `request.body` — the client's mutation payload. */
  clientBody: unknown;

  /**
   * Last-known base snapshot, IF the app supplied one via
   * `request.metadata.conflictBase` at enqueue time. Optional — merge
   * callbacks without a base still work using only `clientBody`/`server`.
   */
  base?: unknown;

  /** Server's current representation, taken from the 409/412 response body. */
  server: unknown;

  /** The conflict HTTP status (member of `conflictStatuses`). */
  status: number;

  /**
   * Aborts if the resolver exceeds `conflictResolveTimeoutMs` or the
   * OfflineManager is destroyed mid-resolution.
   */
  signal: AbortSignal;
}

/**
 * The resolver's decision for a conflicting replay.
 */
export type ConflictResolution =
  | { action: 'retry'; body?: unknown; headers?: Record<string, string> }
  | { action: 'discard' }
  | { action: 'keep' };

/**
 * Offline configuration
 */
export interface OfflineConfig {
  /**
   * Enable offline support
   * @default true
   */
  enabled?: boolean;

  /**
   * Storage adapter for queue persistence
   */
  storage?: StorageAdapter;

  /**
   * Storage key for queue
   * @default 'minder_offline_queue'
   */
  storageKey?: string;

  /**
   * Max queue size
   * @default 100
   */
  maxQueueSize?: number;

  /**
   * Max retry attempts per request
   * @default 3
   */
  maxRetries?: number;

  /**
   * Initial retry delay in ms
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Auto-sync when coming online
   * @default true
   */
  autoSync?: boolean;

  /**
   * Sync only on WiFi (avoid cellular data)
   * @default false
   */
  syncOnWifiOnly?: boolean;

  /**
   * Batch size for sync operations
   * @default 5
   */
  syncBatchSize?: number;

  /**
   * Conflict resolution strategy applied to a replay that fails with a status
   * in {@link conflictStatuses}. Now actually wired into the replay pipeline
   * (Spec 5.1). Can be overridden per-mutation via
   * `request.metadata.conflictResolution` (a strategy name — see docs).
   * @default 'server-wins'
   */
  conflictResolution?: ConflictStrategy;

  /**
   * HTTP statuses that are treated as a conflict during replay, dispatched to
   * `conflictResolution`/`resolveConflict` instead of the normal retry/drop
   * path.
   * @default [409, 412]
   */
  conflictStatuses?: number[];

  /**
   * Rich async conflict resolver — preferred over the legacy `onConflict`.
   * Invoked when the effective strategy is `'merge'`/`'manual'`. Raced against
   * `conflictResolveTimeoutMs`; any throw, timeout, or malformed return value
   * fails closed to the same retry→dead-letter path as a normal replay error
   * (never a silent discard or silent accept).
   */
  resolveConflict?: (ctx: ConflictContext) => ConflictResolution | Promise<ConflictResolution>;

  /**
   * Timeout (ms) for `resolveConflict`/`onConflict` before the resolution is
   * treated as failed (fail-closed → retry→dead-letter path).
   * @default 15000
   */
  conflictResolveTimeoutMs?: number;

  /**
   * When `true`, replay switches from concurrent `syncBatchSize` batches to
   * strictly sequential processing, and a `'keep'` resolution or a replay
   * failure halts the remainder of the queue for that sync pass (causal
   * safety — prevents mutation N+1 from applying against a base that N was
   * supposed to establish). Costs throughput; default preserves today's
   * concurrent batching.
   * @default false
   */
  strictOrder?: boolean;

  /**
   * Opt-in observability hook fired when a request is dropped after
   * exhausting `maxRetries` (the existing silent-drop behavior is otherwise
   * unchanged — this is purely additive).
   */
  onDeadLetter?: (request: QueuedRequest, lastError: string) => void;

  /**
   * When set (and a `storage` adapter is configured), dropped requests are
   * also appended to this storage key as a persisted dead-letter list.
   * Optional — default is no persistence (matches today's silent-drop).
   */
  deadLetterKey?: string;

  /**
   * Callback when request is queued
   */
  onRequestQueued?: (request: QueuedRequest) => void;

  /**
   * Callback when request succeeds
   */
  onRequestSuccess?: (request: QueuedRequest, response: unknown) => void;

  /**
   * Callback when request fails
   */
  onRequestError?: (request: QueuedRequest, error: Error) => void;

  /**
   * Callback when sync starts
   */
  onSyncStart?: () => void;

  /**
   * Callback when sync completes
   */
  onSyncComplete?: (stats: SyncStats) => void;

  /**
   * Callback on network state change
   */
  onNetworkChange?: (state: NetworkState) => void;

  /**
   * Manual conflict resolver
   * @deprecated legacy shape — still honored via an adapter onto
   * `resolveConflict` (its return value becomes `{ action: 'retry', body: <return> }`).
   * Prefer `resolveConflict`. If both are configured, `resolveConflict` wins
   * and `onConflict` is ignored (with a one-time warning).
   */
  onConflict?: (request: QueuedRequest, serverData: unknown) => Promise<unknown>;
}
