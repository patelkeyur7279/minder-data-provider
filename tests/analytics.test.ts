
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { AnalyticsManager } from '../src/utils/analytics';
import { ApiClient } from '../src/core/ApiClient';
import { AuthManager } from '../src/core/AuthManager';
import { StorageType, HttpMethod } from '../src/constants/enums';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock window and gtag
const mockGtag = jest.fn();
const mockDataLayer: any[] = [];

describe('Analytics Integration', () => {
    let originalWindow: any;
    let originalDocument: any;

    beforeEach(() => {
        originalWindow = global.window;
        originalDocument = global.document;

        global.window = {
            gtag: mockGtag,
            dataLayer: mockDataLayer,
            location: { protocol: 'http:' }
        } as any;

        global.document = {
            createElement: jest.fn().mockReturnValue({}),
            head: {
                appendChild: jest.fn()
            }
        } as any;

        // Reset mocks
        mockGtag.mockClear();
        mockDataLayer.length = 0;

        // Setup axios mock
        mockedAxios.create.mockReturnValue({
            interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() }
            },
            request: jest.fn(),
            get: jest.fn(),
            post: jest.fn()
        } as any);
    });

    afterEach(() => {
        global.window = originalWindow;
        global.document = originalDocument;
        jest.clearAllMocks();
    });

    describe('AnalyticsManager', () => {
        it('should initialize GA4 when enabled', () => {
            // Ensure gtag is undefined so it initializes
            (window as any).gtag = undefined;

            new AnalyticsManager({
                enabled: true,
                googleAnalyticsId: 'G-TEST-ID'
            });

            // It should define gtag and push to dataLayer
            expect((window as any).gtag).toBeDefined();

            const dataLayer = (window as any).dataLayer;
            expect(dataLayer).toBeDefined();
            expect(dataLayer.length).toBeGreaterThan(0);

            // Check for 'js' and 'config' events in dataLayer
            const configCall = dataLayer.find((args: any[]) => args[0] === 'config');
            expect(configCall).toBeDefined();
            expect(configCall[1]).toBe('G-TEST-ID');
            expect(configCall[2]).toEqual(expect.objectContaining({
                send_page_view: true
            }));
        });

        it('should not initialize when disabled', () => {
            (window as any).gtag = undefined;

            new AnalyticsManager({
                enabled: false,
                googleAnalyticsId: 'G-TEST-ID'
            });

            expect((window as any).gtag).toBeUndefined();
        });

        it('should track custom events', () => {
            (window as any).gtag = undefined;

            const analytics = new AnalyticsManager({
                enabled: true,
                googleAnalyticsId: 'G-TEST-ID'
            });

            analytics.trackEvent('test_event', { foo: 'bar' });

            // Check dataLayer for event
            const dataLayer = (window as any).dataLayer;
            const eventCall = dataLayer.find((args: any[]) => args[0] === 'event' && args[1] === 'test_event');
            expect(eventCall).toBeDefined();
            expect(eventCall[2]).toEqual({ foo: 'bar' });
        });
    });

    describe('ApiClient Integration', () => {
        let apiClient: ApiClient;

        beforeEach(() => {
            const authManager = new AuthManager({
                tokenKey: 'test_token',
                storage: StorageType.MEMORY
            });

            apiClient = new ApiClient({
                apiBaseUrl: 'http://api.example.com',
                routes: {
                    'test-route': { url: '/test', method: HttpMethod.GET }
                },
                analytics: {
                    enabled: true,
                    googleAnalyticsId: 'G-TEST-ID',
                    autoTrackErrors: true
                }
            }, authManager);
        });

        it('should have analytics manager initialized', () => {
            // @ts-ignore
            expect(apiClient.analyticsManager).toBeDefined();
        });
    });
});
