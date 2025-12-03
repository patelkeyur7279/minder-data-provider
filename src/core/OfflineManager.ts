import { Logger, LogLevel } from '../utils/Logger.js';
import { StorageType } from '../constants/enums.js';
import type { OfflineConfig, QueuedRequest } from '../platform/offline/types.js';

const logger = new Logger('OfflineManager', { level: LogLevel.DEBUG });

export class OfflineManager {
    private config: OfflineConfig;
    private queue: QueuedRequest[] = [];
    private isOnline: boolean = true;
    private storage: Storage | null = null;
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
        // Default to localStorage if not specified
        // Note: OfflineConfig in types.ts doesn't have storageType enum, it uses StorageAdapter
        // For this core implementation, we'll stick to simple localStorage/sessionStorage detection
        // or use the provided storage adapter if available (not implemented here yet)

        if (typeof window !== 'undefined') {
            this.storage = window.localStorage;
        }
    }

    private setupListeners() {
        window.addEventListener('online', () => {
            logger.info('Network connection restored');
            this.isOnline = true;
            this.processQueue();
        });

        window.addEventListener('offline', () => {
            logger.warn('Network connection lost');
            this.isOnline = false;
        });
    }

    private loadQueue() {
        if (!this.storage) return;

        try {
            const stored = this.storage.getItem(this.config.storageKey!);
            if (stored) {
                this.queue = JSON.parse(stored);
                logger.debug(`Loaded ${this.queue.length} requests from offline queue`);
            }
        } catch (error) {
            logger.error('Failed to load offline queue:', error);
        }
    }

    private saveQueue() {
        if (!this.storage) return;

        try {
            this.storage.setItem(this.config.storageKey!, JSON.stringify(this.queue));
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
        this.saveQueue();

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

        this.saveQueue();
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
        this.saveQueue();
        logger.info(`Queued request: ${method} ${request.url}`);
    }

    public getQueueLength(): number {
        return this.queue.length;
    }

    public clearQueue() {
        this.queue = [];
        this.saveQueue();
    }
}
