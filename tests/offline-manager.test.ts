import { OfflineManager } from '../src/core/OfflineManager';
import { StorageType } from '../src/constants/enums';

describe('OfflineManager', () => {
    let offlineManager: OfflineManager;
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
        mockStorage = {};
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn((key) => mockStorage[key] || null),
                setItem: jest.fn((key, value) => { mockStorage[key] = value; }),
                removeItem: jest.fn((key) => { delete mockStorage[key]; }),
                clear: jest.fn(() => { mockStorage = {}; }),
            },
            writable: true
        });
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        Object.defineProperty(global, 'crypto', {
            value: {
                randomUUID: jest.fn(() => 'test-uuid')
            }
        });
    });

    it('should queue mutation requests when enabled', () => {
        offlineManager = new OfflineManager({ enabled: true });

        offlineManager.queueRequest({
            url: '/api/users',
            method: 'POST',
            body: { name: 'Test' }
        });

        expect(offlineManager.getQueueLength()).toBe(1);
        expect(window.localStorage.setItem).toHaveBeenCalled();
    });

    it('should NOT queue GET requests', () => {
        offlineManager = new OfflineManager({ enabled: true });

        offlineManager.queueRequest({
            url: '/api/users',
            method: 'GET'
        });

        expect(offlineManager.getQueueLength()).toBe(0);
    });

    it('should replay queued requests when processing queue', async () => {
        offlineManager = new OfflineManager({ enabled: true });
        const processCallback = jest.fn().mockResolvedValue(undefined);
        offlineManager.setProcessQueueCallback(processCallback);

        offlineManager.queueRequest({
            url: '/api/users',
            method: 'POST',
            body: { name: 'Test' }
        });

        await offlineManager.processQueue();

        expect(processCallback).toHaveBeenCalledTimes(1);
        expect(offlineManager.getQueueLength()).toBe(0);
    });

    it('should retry failed requests up to maxRetries', async () => {
        offlineManager = new OfflineManager({ enabled: true, maxRetries: 2 });
        const processCallback = jest.fn().mockRejectedValue(new Error('Network Error'));
        offlineManager.setProcessQueueCallback(processCallback);

        offlineManager.queueRequest({
            url: '/api/users',
            method: 'POST'
        });

        // First attempt
        await offlineManager.processQueue();
        expect(offlineManager.getQueueLength()).toBe(1); // Re-queued

        // Second attempt
        await offlineManager.processQueue();
        expect(offlineManager.getQueueLength()).toBe(1); // Re-queued again

        // Third attempt (exceeds maxRetries=2)
        await offlineManager.processQueue();
        expect(offlineManager.getQueueLength()).toBe(0); // Dropped
    });
});
