/**
 * OfflineManager - Offline Support for Mobile Platforms
 * 
 * Provides offline capabilities including:
 * - Request queue management
 * - Background sync when online
 * - Network state detection
 * - Automatic retry with exponential backoff
 * - Conflict resolution strategies
 * - Persistent storage integration
 * 
 * @module OfflineManager
 */

import { Logger, LogLevel } from '../../utils/Logger.js';
import type { StorageAdapter } from '../adapters/storage/StorageAdapter.js';
import { MinderOfflineError, MinderNetworkError, MinderValidationError, MinderConflictError } from '../../errors/index.js';
import type {
  NetworkState,
  QueuedRequest,
  SyncStats,
  OfflineConfig,
  ConflictStrategy,
  ConflictContext,
  ConflictResolution,
} from './types.js';
import { isReplayErrorSentinel, type ReplayErrorSentinel } from './replaySentinel.js';
// Late-cycle-safe: the plugins layer imports only from utils (Logger), never
// from platform, so this static import forms no circular dependency. Verified
// via `grep -rn platform src/plugins` (no hits). Emitting through the global
// plugin manager keeps OfflineManager decoupled from any core wiring.
//
// fix-a-app-router-crash-offline-parity (BLOCKER 1): `peekPluginManager()`
// reads the shared manager WITHOUT constructing one when absent — both call
// sites below already guard on `.size > 0`, so "no manager yet" and "zero
// plugins" are the same answer, and neither needs to touch the `PluginManager`
// class reference that a real `next build` + Route Handler/Server Component
// reproduction showed can be unavailable under Next.js App Router's webpack.
// See the fuller root-cause note in ../../plugins/PluginSystem.ts and
// ../../core/minder.ts. Standalone minder() now drives this manager
// server-side (offline auto-queue parity), so it must not carry the same
// undefined-binding crash risk.
import { peekPluginManager } from '../../plugins/PluginSystem.js';

const logger = /*#__PURE__*/ new Logger('OfflineManager', { level: LogLevel.WARN });

/**
 * Sentinel returned by {@link OfflineManager.executeRequest} (via
 * {@link OfflineManager.resolveConflictAndApply}) for a `'keep'` conflict
 * resolution: the request stays queued, is NOT retried, and does not count as
 * a failure. Module-private — never surfaces outside this file.
 */
const KEEP_MARKER = Symbol('minder-offline-keep');

/**
 * Point-in-time snapshot of OfflineManager state, delivered to subscribers
 * via {@link OfflineManager.subscribe}.
 */
export interface OfflineManagerSnapshot {
  /**
   * Is currently online
   */
  isOnline: boolean;

  /**
   * Is currently syncing
   */
  isSyncing: boolean;

  /**
   * Current network state
   */
  networkState: NetworkState;

  /**
   * Queued requests
   */
  queue: QueuedRequest[];

  /**
   * Queue size
   */
  queueSize: number;
}

/**
 * Listener invoked whenever OfflineManager state transitions
 * (network changes, sync start/complete, queue add/remove/clear).
 */
export type OfflineManagerListener = (snapshot: OfflineManagerSnapshot) => void;

/**
 * OfflineManager - Manages offline request queue and sync
 */
export class OfflineManager {
  private config: Required<
    Omit<OfflineConfig, 'storage' | 'onConflict' | 'resolveConflict' | 'onDeadLetter' | 'deadLetterKey'>
  > & {
    storage?: StorageAdapter;
    onConflict?: (request: QueuedRequest, serverData: any) => Promise<any>;
    resolveConflict?: (ctx: ConflictContext) => ConflictResolution | Promise<ConflictResolution>;
    onDeadLetter?: (request: QueuedRequest, lastError: string) => void;
    deadLetterKey?: string;
  };
  private queue: QueuedRequest[] = [];
  private networkState: NetworkState = { isConnected: true };
  private isSyncing = false;
  private syncPromise: Promise<SyncStats> | null = null;
  private netInfoUnsubscribe?: () => void;
  private listeners = new Set<OfflineManagerListener>();
  private initPromise: Promise<void> | null = null;
  private requestExecutor?: (request: QueuedRequest) => Promise<unknown>;
  /** Aborted by {@link destroy} so any in-flight conflict resolution rejects. */
  private destroyController = new AbortController();
  /** One-time warn guard (§10.3) — never re-warns for the life of the instance. */
  private warnedBothResolversConfigured = false;

  constructor(config: OfflineConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      storage: config.storage,
      storageKey: config.storageKey ?? 'minder_offline_queue',
      maxQueueSize: config.maxQueueSize ?? 100,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      autoSync: config.autoSync ?? true,
      syncOnWifiOnly: config.syncOnWifiOnly ?? false,
      syncBatchSize: config.syncBatchSize ?? 5,
      conflictResolution: config.conflictResolution ?? 'server-wins',
      conflictStatuses: config.conflictStatuses ?? [409, 412],
      conflictResolveTimeoutMs: config.conflictResolveTimeoutMs ?? 15000,
      strictOrder: config.strictOrder ?? false,
      onRequestQueued: config.onRequestQueued ?? (() => {}),
      onRequestSuccess: config.onRequestSuccess ?? (() => {}),
      onRequestError: config.onRequestError ?? (() => {}),
      onSyncStart: config.onSyncStart ?? (() => {}),
      onSyncComplete: config.onSyncComplete ?? (() => {}),
      onNetworkChange: config.onNetworkChange ?? (() => {}),
      onConflict: config.onConflict,
      resolveConflict: config.resolveConflict,
      onDeadLetter: config.onDeadLetter,
      deadLetterKey: config.deadLetterKey,
    };
  }

  /**
   * Inject the transport used to replay a queued request during {@link sync}.
   *
   * This is the unified-manager equivalent of the old core manager's
   * `setProcessQueueCallback`: {@link ApiClient} hooks its own axios instance in
   * here so replayed requests carry auth/CSRF/CORS/interceptors exactly like a
   * live call, instead of the bare `fetch` fallback (which would drop all of
   * that). The executor should resolve with the response payload and reject on
   * failure (axios rejects on non-2xx), which drives onRequestSuccess /
   * onRequestError and the retry accounting in {@link handleRequestError}.
   *
   * When no executor is set, {@link executeRequest} falls back to a plain
   * `fetch` (React Native / standalone-without-ApiClient scenarios).
   */
  setRequestExecutor(executor: (request: QueuedRequest) => Promise<unknown>): void {
    this.requestExecutor = executor;
  }

  /**
   * Initialize offline manager. Idempotent: concurrent or repeated calls return
   * the same in-flight promise so listeners are only ever set up once (the config
   * pipeline kicks this off; callers/tests may also await it safely).
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // Load queue from storage
    await this.loadQueue();

    // Setup network listener with fallbacks
    await this.setupNetworkListener();

    // Initial network state check
    const state = await this.checkNetworkState();
    this.updateNetworkState(state);

    // Log initialization status
    if (this.netInfoUnsubscribe) {
      logger.debug('Offline manager initialized with network detection');
    } else {
      logger.warn('Offline manager initialized without reliable network detection - offline features may be limited');
      console.warn(`
⚠️  Minder Offline Support: Limited Network Detection

Offline request queuing will work, but automatic sync when reconnecting may be unreliable.
For better offline support:

React Native: Install @react-native-community/netinfo
Expo: NetInfo is built-in, check your setup
Web: Using basic online/offline detection
      `.trim());
    }
  }

  /**
   * Setup network state listener (React Native/Expo with fallback)
   */
  private async setupNetworkListener(): Promise<void> {
    try {
      // Try to dynamically load NetInfo (optional peer dependency)
      const loadNetInfo = new Function('return import("@react-native-community/netinfo")');
      const NetInfo = await loadNetInfo().then((m: any) => m.default);

      this.netInfoUnsubscribe = NetInfo.addEventListener((state: any) => {
        const networkState: NetworkState = {
          isConnected: state.isConnected ?? false,
          type: state.type,
          isExpensive: state.details?.isConnectionExpensive,
          isMetered: state.details?.isConnectionMetered,
        };

        this.updateNetworkState(networkState);
      });
      
      logger.debug('NetInfo listener setup successfully');
    } catch (error) {
      // NetInfo not available, setup fallback network detection
      logger.warn('NetInfo not available, using fallback network detection');
      this.setupFallbackNetworkListener();
    }
  }

  /**
   * Setup fallback network detection for when NetInfo is not available
   */
  private setupFallbackNetworkListener(): void {
    // Use navigator.onLine for basic online/offline detection
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      const updateOnlineStatus = () => {
        const isOnline = navigator.onLine;
        const networkState: NetworkState = {
          isConnected: isOnline,
          type: isOnline ? 'unknown' : 'none',
        };
        this.updateNetworkState(networkState);
      };

      // Listen for online/offline events
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);

      // Set initial state
      updateOnlineStatus();

      // Store cleanup function
      this.netInfoUnsubscribe = () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
      };
    } else {
      // No network detection available, assume always online
      logger.warn('No network detection available, assuming always online');
      this.networkState = { isConnected: true };
    }
  }

  /**
   * Check current network state with multiple fallback methods
   */
  async checkNetworkState(): Promise<NetworkState> {
    try {
      // Try NetInfo first (React Native/Expo)
      const loadNetInfo = new Function('return import("@react-native-community/netinfo")');
      const NetInfo = await loadNetInfo().then((m: any) => m.default);

      const state = await NetInfo.fetch();
      return {
        isConnected: state.isConnected ?? false,
        type: state.type,
        isExpensive: (state.details as any)?.isConnectionExpensive,
        isMetered: (state.details as any)?.isConnectionMetered,
      };
    } catch (error) {
      // Fallback 1: Use navigator.onLine (web)
      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        return {
          isConnected: navigator.onLine,
          type: navigator.onLine ? 'unknown' : 'none',
        };
      }

      // Fallback 2: Try a simple fetch request to detect connectivity
      try {
        // Try to fetch a small resource from a reliable CDN
        await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        return {
          isConnected: true,
          type: 'unknown',
        };
      } catch {
        // Assume offline if fetch fails
        return {
          isConnected: false,
          type: 'none',
        };
      }
    }
  }

  /**
   * Update network state and trigger sync if needed
   */
  private updateNetworkState(state: NetworkState): void {
    const wasConnected = this.networkState.isConnected;
    const wasOffline = !this.networkState.isConnected;
    this.networkState = state;
    this.config.onNetworkChange(state);
    this.notify();

    // Notify connectivity-capability plugins when the online/offline boolean
    // actually transitions (fire-and-forget, error-isolated per plugin).
    const connectivityPm = peekPluginManager();
    if (wasConnected !== state.isConnected && connectivityPm && connectivityPm.size > 0) {
      void connectivityPm.executeConnectivityHooks(state.isConnected);
    }

    // Auto-sync when coming back online
    if (wasOffline && state.isConnected && this.config.autoSync) {
      const canSync = !this.config.syncOnWifiOnly || state.type === 'wifi';
      if (canSync) {
        this.sync().catch((err) => logger.error(err));
      }
    }
  }

  /**
   * Add request to offline queue
   */
  async addToQueue(
    method: QueuedRequest['method'],
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: any;
      priority?: number;
      maxRetries?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    if (!this.config.enabled) {
      throw new MinderOfflineError('Offline support is disabled');
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new MinderValidationError('Offline queue is full', { queue: ['Maximum queue size exceeded'] });
    }

    const request: QueuedRequest = {
      id: this.generateId(),
      method,
      url,
      headers: options.headers,
      body: options.body,
      priority: options.priority ?? 0,
      queuedAt: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? this.config.maxRetries,
      metadata: options.metadata,
    };

    this.queue.push(request);
    this.sortQueueByPriority();
    await this.saveQueue();

    this.config.onRequestQueued(request);
    this.notify();

    return request.id;
  }

  /**
   * Remove request from queue
   */
  async removeFromQueue(requestId: string): Promise<boolean> {
    const index = this.queue.findIndex((r) => r.id === requestId);
    if (index === -1) {
      return false;
    }

    this.queue.splice(index, 1);
    await this.saveQueue();
    this.notify();
    return true;
  }

  /**
   * Get all queued requests
   */
  getQueue(): QueuedRequest[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.notify();
  }

  /**
   * Get network state
   */
  getNetworkState(): NetworkState {
    return { ...this.networkState };
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.networkState.isConnected;
  }

  /**
   * Check if currently syncing
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Subscribe to offline manager state changes (network state, sync status,
   * and queue mutations). The listener is invoked with a fresh snapshot
   * whenever one of those transitions occurs.
   *
   * @returns An unsubscribe function.
   */
  subscribe(listener: OfflineManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get a point-in-time snapshot of offline state (network, sync, queue).
   */
  getSnapshot(): OfflineManagerSnapshot {
    return {
      isOnline: this.isOnline(),
      isSyncing: this.isSyncing,
      networkState: this.getNetworkState(),
      queue: this.getQueue(),
      queueSize: this.getQueueSize(),
    };
  }

  /**
   * Notify subscribers of a state transition.
   */
  private notify(): void {
    if (this.listeners.size === 0) {
      return;
    }

    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /**
   * Sync queued requests
   */
  async sync(): Promise<SyncStats> {
    if (!this.config.enabled) {
      return { total: 0, successful: 0, failed: 0, pending: 0, duration: 0, errors: [] };
    }

    if (this.isSyncing && this.syncPromise) {
      return this.syncPromise;
    }

    if (!this.networkState.isConnected) {
      throw new MinderOfflineError('Cannot sync while offline');
    }

    const pendingAtStart = this.getQueueSize();
    this.isSyncing = true;
    this.config.onSyncStart();
    this.notify();
    this.emitSyncHook('start', { pending: pendingAtStart, processed: 0 });

    const startTime = Date.now();
    const stats: SyncStats = {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      duration: 0,
      errors: [],
    };

    this.syncPromise = this.performSync(stats, startTime);

    try {
      const result = await this.syncPromise;
      // A replay failure is caught per-request inside performSync (so a partial
      // batch still commits its successes), but the sync as a whole must still
      // surface an 'error' phase to onSync observers when any request failed to
      // replay — otherwise a plugin watching sync health sees only 'success'.
      if (result.failed > 0) {
        this.emitSyncHook('error', {
          processed: result.successful,
          pending: this.getQueueSize(),
          error: {
            message: `${result.failed} queued request(s) failed to sync`,
            code: 'OFFLINE_SYNC_PARTIAL_FAILURE',
          },
        });
      } else {
        this.emitSyncHook('success', {
          processed: result.successful,
          pending: this.getQueueSize(),
        });
      }
      return result;
    } catch (error) {
      this.emitSyncHook('error', {
        error: { message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    } finally {
      this.isSyncing = false;
      this.syncPromise = null;
      this.notify();
    }
  }

  /**
   * Fire the offline-sync lifecycle plugin hooks (fire-and-forget,
   * error-isolated per plugin). Zero-overhead when no plugins are registered.
   */
  private emitSyncHook(
    phase: 'start' | 'success' | 'error',
    extra?: { pending?: number; processed?: number; error?: { message: string; code?: string } }
  ): void {
    const syncHookPm = peekPluginManager();
    if (!syncHookPm || syncHookPm.size === 0) return;
    void syncHookPm.executeSyncHooks({
      phase,
      queueSize: this.getQueueSize(),
      pending: extra?.pending ?? this.getQueueSize(),
      ...(extra?.processed !== undefined ? { processed: extra.processed } : {}),
      ...(extra?.error ? { error: extra.error } : {}),
      timestamp: Date.now(),
    });
  }

  /**
   * Perform actual sync operation
   */
  private async performSync(stats: SyncStats, startTime: number): Promise<SyncStats> {
    // Transient, in-memory only for the lifetime of this pass — never written
    // onto QueuedRequest, never persisted (§10.4). Caps conflict resolution at
    // exactly one attempt per request per pass; a fresh pass (including after
    // a restart) always gets a fresh attempt.
    const resolvedThisPass = new Set<string>();

    if (this.config.strictOrder) {
      // Causal safety: fully sequential, and a non-success outcome (a 'keep'
      // resolution, or any replay failure) halts the remainder of the queue
      // for this pass — mutation N+1 must never apply against a base that N
      // was supposed to establish first (§4).
      for (const request of [...this.queue]) {
        const outcome = await this.processQueuedRequest(request, stats, resolvedThisPass);
        if (outcome !== 'success') {
          break;
        }
      }
    } else {
      const batches = this.createBatches(this.queue, this.config.syncBatchSize);
      for (const batch of batches) {
        await Promise.all(batch.map((request) => this.processQueuedRequest(request, stats, resolvedThisPass)));
      }
    }

    stats.duration = Date.now() - startTime;
    this.config.onSyncComplete(stats);

    return stats;
  }

  /**
   * Execute one queued request and update sync stats/queue accordingly.
   * Returns the outcome so `performSync`'s `strictOrder` path can decide
   * whether to halt the remainder of the pass.
   */
  private async processQueuedRequest(
    request: QueuedRequest,
    stats: SyncStats,
    resolvedThisPass: Set<string>
  ): Promise<'success' | 'error' | 'keep'> {
    stats.total++;

    try {
      const result = await this.executeRequest(request, resolvedThisPass);
      if (result === KEEP_MARKER) {
        // 'keep': leave queued, count as pending, no retry increment (§4).
        stats.pending++;
        return 'keep';
      }
      stats.successful++;
      await this.removeFromQueue(request.id);
      return 'success';
    } catch (error) {
      stats.failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stats.errors.push({ requestId: request.id, error: errorMessage });
      await this.handleRequestError(request, error as Error);
      return 'error';
    }
  }

  /**
   * Execute a queued request
   */
  private async executeRequest(request: QueuedRequest, resolvedThisPass: Set<string>): Promise<unknown> {
    // Preferred path: replay through the injected executor (ApiClient's axios
    // instance) so auth/CSRF/CORS/interceptors apply to the re-dispatch. Per
    // the executor contract (Spec 5.1 §10.1), the executor never throws for a
    // server response error (any status) — it resolves a uniform
    // ReplayErrorSentinel instead, and this layer alone decides conflict vs
    // ordinary error.
    if (this.requestExecutor) {
      const result = await this.requestExecutor(request);
      return this.interpretExecutorResult(request, result, resolvedThisPass);
    }

    // Fallback: bare fetch (no ApiClient wired — RN / standalone). This
    // transport predates the executor's sentinel contract and has no
    // response-body access shape to build a ConflictContext from; conflict
    // detection is out of scope for it (unchanged pre-feature behavior).
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    });

    if (!response.ok) {
      throw new MinderNetworkError(`HTTP ${response.status}: ${response.statusText}`, response.status);
    }

    const data = await response.json();
    this.config.onRequestSuccess(request, data);

    return data;
  }

  /**
   * Decide what an executor result means: a plain success value, a
   * ReplayErrorSentinel that is NOT a conflict (or already resolved this pass
   * — reconstruct & throw, byte-equal to the pre-feature path), or a genuine
   * conflict (dispatch resolution). Shared by both the initial dispatch and a
   * merged `retry` re-dispatch (§10.4 — the guard prevents infinite loops).
   */
  private async interpretExecutorResult(
    request: QueuedRequest,
    result: unknown,
    resolvedThisPass: Set<string>
  ): Promise<unknown> {
    if (isReplayErrorSentinel(result)) {
      const isConflict =
        this.config.conflictStatuses.includes(result.status) && !resolvedThisPass.has(request.id);

      if (!isConflict) {
        // Non-conflict status, OR a conflict status but already resolved once
        // this pass (re-issued retry conflicted again) -> reconstruct the
        // error and throw so handleRequestError runs EXACTLY as pre-feature:
        // same request.lastError string (verbatim axios message), same
        // retries++, same drop-at-maxRetries.
        throw new MinderNetworkError(
          result.message,
          result.status,
          result.serverData,
          request.url,
          request.method,
          result.code ?? 'NETWORK_ERROR'
        );
      }

      return this.resolveConflictAndApply(request, result, resolvedThisPass);
    }

    this.config.onRequestSuccess(request, result);
    return result;
  }

  /**
   * Resolve and apply a genuine conflict (Spec 5.1 §3/§4, refined by §10).
   */
  private async resolveConflictAndApply(
    request: QueuedRequest,
    sentinel: ReplayErrorSentinel,
    resolvedThisPass: Set<string>
  ): Promise<unknown> {
    // Cap: exactly one resolution attempt per request per sync pass (§10.4/R6).
    resolvedThisPass.add(request.id);

    const effectiveStrategy = this.effectiveConflictStrategy(request);

    let resolution: ConflictResolution;
    try {
      const raw = await this.dispatchConflictStrategy(effectiveStrategy, request, sentinel);
      if (!this.isValidConflictResolution(raw)) {
        throw new MinderConflictError('malformed resolution');
      }
      resolution = raw;
    } catch (err) {
      // Fail-closed (§10.3): resolver threw / malformed / timed out -> the
      // SAME retry->dead-letter path as any other replay error. Never
      // silently discard the mutation or silently accept the server.
      throw err instanceof Error ? err : new MinderConflictError(String(err));
    }

    switch (resolution.action) {
      case 'discard':
        // Treat as success: accept server state, remove queued mutation (§4).
        this.config.onRequestSuccess(request, sentinel.serverData);
        return sentinel.serverData;

      case 'keep':
        // Leave queued, no retry increment, counted as pending by the caller.
        return KEEP_MARKER;

      case 'retry': {
        const mergedRequest: QueuedRequest = {
          ...request,
          body: resolution.body !== undefined ? resolution.body : request.body,
          headers:
            resolution.headers !== undefined
              ? { ...request.headers, ...resolution.headers }
              : request.headers,
        };
        // Re-dispatch once. The guard above already marked request.id as
        // resolved this pass, so if THIS also comes back a conflict it falls
        // through interpretExecutorResult's non-conflict branch (reconstruct
        // & throw -> handleRequestError) instead of resolving again — no
        // infinite loop (§10.4, test l).
        const retryResult = await this.requestExecutor!(mergedRequest);
        return this.interpretExecutorResult(request, retryResult, resolvedThisPass);
      }

      default:
        // Unreachable given isValidConflictResolution's narrowing, but keep
        // the fail-closed contract explicit rather than falling off silently.
        throw new MinderConflictError('malformed resolution');
    }
  }

  /**
   * Effective strategy for a replay = per-mutation `metadata.conflictResolution`
   * string override, else the global default (§10.2 — highest wins). Only a
   * JSON-safe strategy NAME is honored from metadata (functions do not survive
   * `JSON.stringify` in `saveQueue`); the async resolver stays a single global.
   */
  private effectiveConflictStrategy(request: QueuedRequest): ConflictStrategy {
    const override = request.metadata?.conflictResolution;
    if (typeof override === 'string' && this.isConflictStrategy(override)) {
      return override;
    }
    return this.config.conflictResolution;
  }

  private isConflictStrategy(value: string): value is ConflictStrategy {
    return (
      value === 'last-write-wins' ||
      value === 'server-wins' ||
      value === 'client-wins' ||
      value === 'merge' ||
      value === 'manual'
    );
  }

  private isValidConflictResolution(value: unknown): value is ConflictResolution {
    if (!value || typeof value !== 'object') return false;
    const action = (value as { action?: unknown }).action;
    return action === 'retry' || action === 'discard' || action === 'keep';
  }

  /**
   * Map a strategy to its ConflictResolution (§4 "Strategy semantics").
   * `client-wins` is an alias of `last-write-wins`; `manual` is an alias of
   * `merge` (§10.5 — both pairs produce identical outcomes).
   */
  private async dispatchConflictStrategy(
    strategy: ConflictStrategy,
    request: QueuedRequest,
    sentinel: ReplayErrorSentinel
  ): Promise<ConflictResolution> {
    switch (strategy) {
      case 'last-write-wins':
      case 'client-wins':
        // Re-issue the client mutation; client wins. (Apps that need to strip
        // If-Match/precondition headers for a true force-overwrite can do so
        // via a custom `resolveConflict` — see README "Offline".)
        return { action: 'retry' };

      case 'server-wins':
        return { action: 'discard' };

      case 'merge':
      case 'manual':
        return this.invokeResolver(request, sentinel);

      default:
        // Unknown strategy string (e.g. a bad per-mutation metadata override)
        // fails closed to the same place as a malformed resolver result.
        throw new MinderConflictError(`Unknown conflict strategy: ${String(strategy)}`);
    }
  }

  /**
   * Invoke `resolveConflict` (preferred) or adapt the legacy `onConflict`,
   * raced against `conflictResolveTimeoutMs` and against `destroy()` (§10.3).
   */
  private async invokeResolver(
    request: QueuedRequest,
    sentinel: ReplayErrorSentinel
  ): Promise<ConflictResolution> {
    const { resolveConflict, onConflict } = this.config;

    if (resolveConflict && onConflict && !this.warnedBothResolversConfigured) {
      this.warnedBothResolversConfigured = true;
      logger.warn(
        'Both resolveConflict and onConflict configured; onConflict ignored (resolveConflict wins).'
      );
    }

    if (!resolveConflict && !onConflict) {
      throw new MinderConflictError(
        'conflictResolution resolved to "merge"/"manual" but neither resolveConflict nor onConflict is configured'
      );
    }

    const { signal, dispose } = this.createConflictSignal();
    try {
      if (resolveConflict) {
        const ctx: ConflictContext = {
          request,
          clientBody: request.body,
          base: request.metadata?.conflictBase,
          server: sentinel.serverData,
          status: sentinel.status,
          signal,
        };
        return await this.raceAgainstAbort(Promise.resolve().then(() => resolveConflict(ctx)), signal);
      }

      // Legacy adapter (§3): onConflict's return value becomes a retry body.
      const merged = await this.raceAgainstAbort(
        Promise.resolve().then(() => onConflict!(request, sentinel.serverData)),
        signal
      );
      return { action: 'retry', body: merged };
    } finally {
      dispose();
    }
  }

  /**
   * Build an AbortSignal that fires on `conflictResolveTimeoutMs` OR when
   * `destroy()` is called (test c: "resolveConflict async + abort on destroy()").
   */
  private createConflictSignal(): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new MinderConflictError(`conflictResolveTimeoutMs (${this.config.conflictResolveTimeoutMs}ms) exceeded`));
    }, this.config.conflictResolveTimeoutMs);

    const onDestroyAbort = () => controller.abort(new MinderConflictError('OfflineManager destroyed'));
    if (this.destroyController.signal.aborted) {
      controller.abort(new MinderConflictError('OfflineManager destroyed'));
    } else {
      this.destroyController.signal.addEventListener('abort', onDestroyAbort, { once: true });
    }

    return {
      signal: controller.signal,
      dispose: () => {
        clearTimeout(timeoutId);
        this.destroyController.signal.removeEventListener('abort', onDestroyAbort);
      },
    };
  }

  private raceAgainstAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(this.toAbortError(signal));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(this.toAbortError(signal));
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        }
      );
    });
  }

  private toAbortError(signal: AbortSignal): Error {
    const reason = (signal as { reason?: unknown }).reason;
    return reason instanceof Error ? reason : new MinderConflictError('conflict resolution aborted');
  }

  /**
   * Handle request error and retry if needed
   */
  private async handleRequestError(
    request: QueuedRequest,
    error: Error
  ): Promise<void> {
    request.lastError = error.message;
    request.retries++;

    if (request.retries >= (request.maxRetries ?? this.config.maxRetries)) {
      // Max retries reached, remove from queue
      this.config.onRequestError(request, error);
      if (this.config.onDeadLetter) {
        try {
          this.config.onDeadLetter(request, request.lastError);
        } catch (hookError) {
          logger.error('onDeadLetter callback threw:', hookError);
        }
      }
      if (this.config.deadLetterKey) {
        await this.appendDeadLetter(request);
      }
      await this.removeFromQueue(request.id);
    } else {
      // Will retry on next sync
      await this.saveQueue();
    }
  }

  /**
   * Append a dropped request to the persisted dead-letter list. Additive and
   * opt-in (`deadLetterKey` + `storage` both required) — default (unset)
   * preserves today's silent-drop with no persistence (§4).
   */
  private async appendDeadLetter(request: QueuedRequest): Promise<void> {
    if (!this.config.storage || !this.config.deadLetterKey) {
      return;
    }
    try {
      const existing = await this.config.storage.getItem(this.config.deadLetterKey);
      const list: QueuedRequest[] = existing ? JSON.parse(existing) : [];
      list.push(request);
      await this.config.storage.setItem(this.config.deadLetterKey, JSON.stringify(list));
    } catch (error) {
      logger.error('Failed to persist dead-letter entry:', error);
    }
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sort queue by priority (higher first)
   */
  private sortQueueByPriority(): void {
    this.queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Save queue to storage
   */
  private async saveQueue(): Promise<void> {
    if (!this.config.storage) {
      return;
    }

    try {
      await this.config.storage.setItem(
        this.config.storageKey,
        JSON.stringify(this.queue)
      );
    } catch (error) {
      logger.error('Failed to save offline queue:', error);
    }
  }

  /**
   * Load queue from storage
   */
  private async loadQueue(): Promise<void> {
    if (!this.config.storage) {
      return;
    }

    try {
      const data = await this.config.storage.getItem(this.config.storageKey);
      if (data) {
        this.queue = JSON.parse(data);
        this.sortQueueByPriority();
      }
    } catch (error) {
      logger.error('Failed to load offline queue:', error);
      this.queue = [];
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    // Abort any in-flight conflict resolution first (§10.3 test c).
    this.destroyController.abort();

    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = undefined;
    }
    this.initPromise = null;

    await this.saveQueue();
  }
}

/**
 * Create OfflineManager instance
 */
export function createOfflineManager(config?: OfflineConfig): OfflineManager {
  return new OfflineManager(config);
}
