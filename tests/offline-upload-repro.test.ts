
/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { OfflineManager } from '../src/core/OfflineManager';
import { StorageType } from '../src/constants/enums';

describe('OfflineManager - FormData Reproduction', () => {
    let offlineManager: OfflineManager;
    let mockStorage: any;

    beforeEach(() => {
        // Mock localStorage
        mockStorage = {
            getItem: jest.fn(),
            setItem: jest.fn(),
            removeItem: jest.fn(),
            clear: jest.fn(),
        };
        Object.defineProperty(window, 'localStorage', {
            value: mockStorage,
            writable: true
        });

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: false,
            configurable: true
        });

        // Mock crypto.randomUUID
        Object.defineProperty(global, 'crypto', {
            value: {
                randomUUID: () => 'test-uuid-123'
            },
            writable: true
        });

        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should handle FormData in offline queue (memory only, not persisted)', () => {
        offlineManager = new OfflineManager({
            enabled: true,
            storageKey: 'offline_queue'
        });

        const formData = new FormData();
        formData.append('file', new Blob(['test content']), 'test.txt');

        // Queue a request with FormData
        offlineManager.queueRequest({
            url: '/upload',
            method: 'POST',
            body: formData,
            headers: {}
        });

        // 1. Check that it IS in memory
        expect(offlineManager.getQueueLength()).toBe(1);

        // 2. Check what was persisted to storage
        expect(mockStorage.setItem).toHaveBeenCalled();
        const savedData = JSON.parse(mockStorage.setItem.mock.calls[0][1]);

        // Should be empty array because FormData is not serializable and we filtered it out
        expect(savedData).toEqual([]);
    });
});
