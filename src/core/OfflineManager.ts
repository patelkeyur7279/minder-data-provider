import { Logger, LogLevel } from '../utils/Logger.js';
import { StorageType } from '../constants/enums.js';
import type { OfflineConfig, QueuedRequest } from '../platform/offline/types.js';
import { IndexedDBStorage } from '../utils/IndexedDB.js';

const logger = new Logger('OfflineManager', { level: LogLevel.DEBUG });

export class OfflineManager {
    private config: OfflineConfig;
    private queue: QueuedRequest[] = [];
    private isOnline: boolean = true;
    private storage: IndexedDBStorage | null = null;
    private processQueueCallback?: (request: QueuedRequest) => Promise<void>;

    constructor(config: OfflineConfig) {
        this.config = {
            enabled: true,
            storageKey: 'minder_offline_queue',
            maxQueueSize: 50,
            ...config,
        };

        if (typeof window !== 'undefined') {
            this.isOnline = navigator.onLine;
            this.initStorage();
            this.loadQueue();
            this.setupListeners();
        }
    }

    private initStorage() {
        if (typeof window !== 'undefined') {
            this.storage = new IndexedDBStorage('MinderOfflineDB', 'requests');
        }
    }

    // Stable handler refs so they can be removed in destroy() (anonymous
    // listeners can never be unregistered and leak on every provider remount).
    private handleOnline = () => {
        logger.info('Network connection restored');
        this.isOnline = true;
        this.processQueue();
    };

    private handleOffline = () => {
        logger.warn('Network connection lost');
        this.isOnline = false;
    };

    private setupListeners() {
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
    }

    /**
     * Release resources held by this manager (network listeners). Invoked by
     * ApiClient.destroy() when the owning provider unmounts.
     */
    public destroy(): void {
        if (typeof window !== 'undefined') {
            window.removeEventListener('online', this.handleOnline);
            window.removeEventListener('offline', this.handleOffline);
        }
    }

    private async loadQueue() {
        if (!this.storage) return;

        try {
            const stored = await this.storage.get<QueuedRequest[]>(this.config.storageKey!);
            if (stored && Array.isArray(stored)) {
                this.queue = stored;
                logger.debug(`Loaded ${this.queue.length} requests from offline queue (IndexedDB)`);
            }
            
            // Register Background Sync if available
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                const registration = await navigator.serviceWorker.ready;
                try {
                    await (registration as any).sync.register('minder-sync');
                    logger.debug('Background Sync registered successfully');
                } catch (e) {
                    logger.warn('Background Sync registration failed', e);
                }
            }
        } catch (error) {
            logger.error('Failed to load offline queue:', error);
        }
    }

    private isSerializable(data: any): boolean {
        if (!data) return true;

        // Check for non-serializable types
        if (typeof FormData !== 'undefined' && data instanceof FormData) return false;
        if (typeof Blob !== 'undefined' && data instanceof Blob) return false;
        if (typeof File !== 'undefined' && data instanceof File) return false;

        return true;
    }

    private async saveQueue() {
        if (!this.storage) return;

        try {
            // Filter out requests with non-serializable bodies
            const serializableQueue = this.queue.filter(req => this.isSerializable(req.body));

            if (serializableQueue.length !== this.queue.length) {
                logger.debug(`Not persisting ${this.queue.length - serializableQueue.length} non-serializable requests to storage`);
            }

            await this.storage.set(this.config.storageKey!, serializableQueue);
        } catch (error) {
            logger.error('Failed to save offline queue:', error);
        }
    }

    public setProcessQueueCallback(callback: (request: QueuedRequest) => Promise<void>) {
        this.processQueueCallback = callback;
    }

    public async processQueue() {
        if (!this.isOnline || this.queue.length === 0 || !this.processQueueCallback) return;

        logger.info(`Processing ${this.queue.length} queued requests...`);

        // Process sequentially to maintain order
        const queueCopy = [...this.queue];
        this.queue = []; // Clear queue temporarily, failed items will be re-added
        await this.saveQueue();

        for (const request of queueCopy) {
            try {
                await this.processQueueCallback(request);
                logger.debug(`Replayed request: ${request.method} ${request.url}`);
            } catch (error) {
                logger.error(`Failed to replay request: ${request.method} ${request.url}`, error);
                // Re-queue if it's still a network error, otherwise discard
                // For simplicity, we re-queue if it failed, but increment retry count
                request.retries++;
                if (request.retries <= (this.config.maxRetries || 3)) {
                    this.queue.push(request);
                } else {
                    logger.warn(`Dropping request after ${this.config.maxRetries || 3} failed replays: ${request.method} ${request.url}`);
                }
            }
        }

        await this.saveQueue();
    }

    public queueRequest(request: Omit<QueuedRequest, 'id' | 'queuedAt' | 'retries'>) {
        if (!this.config.enabled) return;

        // Only queue mutation requests (POST, PUT, DELETE, PATCH)
        const method = request.method.toUpperCase();
        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return;
        }

        if (this.queue.length >= (this.config.maxQueueSize || 50)) {
            logger.warn('Offline queue is full, dropping oldest request');
            this.queue.shift();
        }

        const queuedRequest: QueuedRequest = {
            id: crypto.randomUUID(),
            queuedAt: Date.now(),
            retries: 0,
            ...request,
            method: method as any, // Cast to specific union type
        };

        this.queue.push(queuedRequest);

        // Log warning if non-serializable
        if (!this.isSerializable(request.body)) {
            logger.warn(`Queued non-serializable request (${method} ${request.url}). This request will be lost if the app is restarted while offline.`);
        }

        this.saveQueue().catch(e => logger.error('Async save error', e));
        logger.info(`Queued request: ${method} ${request.url}`);
    }

    public getQueueLength(): number {
        return this.queue.length;
    }

    public clearQueue() {
        this.queue = [];
        this.saveQueue().catch(e => logger.error('Async save error', e));
    }
}
