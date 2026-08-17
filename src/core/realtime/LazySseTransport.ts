import type { AuthManager } from '../AuthManager.js';
import type { DebugManager } from '../../debug/DebugManager.js';
import type { RealtimeTransport, ResolvedRealtimeConfig } from './types.js';

type SseTransportModule = typeof import('./SseTransport.js');
type SseTransportLoader = () => Promise<SseTransportModule>;

interface PendingSubscription {
  event: string;
  callback: (data: unknown) => void;
  /** Filled in once the real transport loads and the subscription is replayed. */
  unsubscribe: (() => void) | null;
}

/**
 * Defers loading (and constructing) the real `SseTransport` — and everything it
 * pulls in (`SseParser`, the fetch/backoff/stall machinery) — until a consumer
 * actually calls `connect()`. `MinderDataProvider` hands this out synchronously
 * at mount so `realtimeManager` is always present when `transport: 'sse'` is
 * selected, without the provider's `useMemo` needing to be async and without
 * eagerly importing the SSE module for apps that configure SSE but never
 * connect (P4 — 0 eager bytes; `./realtime/SseTransport.js` lands in its own
 * chunk, verified by `verify:treeshake`).
 *
 * Structurally implements `RealtimeTransport` so it's a drop-in stand-in:
 * `subscribe()` calls made before `connect()` resolves are buffered and
 * replayed against the real instance once it loads.
 */
export class LazySseTransport implements RealtimeTransport {
  private real: RealtimeTransport | null = null;
  private loadPromise: Promise<RealtimeTransport> | null = null;
  private readonly pending: PendingSubscription[] = [];
  private disconnectRequested = false;

  constructor(
    private readonly loader: SseTransportLoader,
    private readonly config: ResolvedRealtimeConfig,
    private readonly authManager: AuthManager,
    private readonly debugManager: DebugManager | undefined,
    private readonly enableLogs: boolean
  ) {}

  private load(): Promise<RealtimeTransport> {
    if (this.real) {
      return Promise.resolve(this.real);
    }
    if (!this.loadPromise) {
      this.loadPromise = this.loader().then((mod) => {
        const instance = new mod.SseTransport(this.config, this.authManager, this.debugManager, this.enableLogs);
        this.real = instance;
        for (const sub of this.pending) {
          sub.unsubscribe = instance.subscribe(sub.event, sub.callback);
        }
        if (this.disconnectRequested) {
          instance.disconnect();
        }
        return instance;
      });
    }
    return this.loadPromise;
  }

  async connect(): Promise<void> {
    if (this.disconnectRequested) {
      // A disconnect() before the module ever loaded means "never mind" —
      // don't kick off the chunk load + fetch just to immediately tear it down.
      return;
    }
    const instance = await this.load();
    // Re-check after the await: a disconnect() during the module-load window
    // set disconnectRequested and already called instance.disconnect() in
    // load()'s continuation. Without this guard, the resuming connect() would
    // call instance.connect() and re-open a stream after teardown (leak).
    if (this.disconnectRequested) {
      return;
    }
    return instance.connect();
  }

  disconnect(): void {
    this.disconnectRequested = true;
    this.real?.disconnect();
  }

  subscribe(event: string, callback: (data: unknown) => void): () => void {
    if (this.real) {
      return this.real.subscribe(event, callback);
    }

    const sub: PendingSubscription = { event, callback, unsubscribe: null };
    this.pending.push(sub);

    return () => {
      if (sub.unsubscribe) {
        sub.unsubscribe();
        return;
      }
      const index = this.pending.indexOf(sub);
      if (index !== -1) {
        this.pending.splice(index, 1);
      }
    };
  }

  isConnected(): boolean {
    return this.real?.isConnected() ?? false;
  }

  send(type: string, data: unknown): void {
    this.real?.send?.(type, data);
  }
}
