
/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { AuthManager } from '../src/core/AuthManager';
import { StorageType } from '../src/constants/enums';

describe('AuthManager - Async Storage Race Condition', () => {
    let authManager: AuthManager;
    let mockAsyncStorage: any;

    beforeEach(() => {
        // Mock AsyncStorage
        const store = new Map<string, string>();
        store.set('accessToken', 'valid-token.eyJleHAiOjkyOTk5OTk5OTl9.signature');

        mockAsyncStorage = {
            getItem: jest.fn((key: string) => Promise.resolve(store.get(key) || null)),
            setItem: jest.fn((key: string, value: string) => Promise.resolve(store.set(key, value))),
            removeItem: jest.fn((key: string) => Promise.resolve(store.delete(key))),
        };

        // Mock require for AsyncStorage
        jest.mock('@react-native-async-storage/async-storage', () => ({
            default: mockAsyncStorage
        }), { virtual: true });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('should return true for isAuthenticated after calling initialize()', async () => {
        authManager = new AuthManager({
            tokenKey: 'accessToken',
            storage: StorageType.ASYNC_STORAGE
        });

        // 1. Initially false (as before)
        expect(authManager.isAuthenticated()).toBe(false);

        // 2. Call initialize to hydrate from async storage
        await authManager.initialize();

        // 3. Now it should be true because token is in memory
        expect(authManager.isAuthenticated()).toBe(true);
        expect(authManager.getToken()).toBe('valid-token.eyJleHAiOjkyOTk5OTk5OTl9.signature');
    });
});
