/**
 * MediaUploadManager Tests
 * 
 * Tests for MediaUploadManager with various data types and configurations.
 * 
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { MediaUploadManager } from '../src/upload/MediaUploadManager';
import { ApiClient } from '../src/core/ApiClient';
import { MinderConfig } from '../src/core/types';
import { HttpMethod } from '../src/constants/enums';

// Mock dependencies
const mockConfig: MinderConfig = {
    apiBaseUrl: 'https://api.example.com',
    routes: {
        upload: {
            url: '/upload',
            method: HttpMethod.POST
        }
    }
};

const mockApiClient = {
    post: jest.fn(),
} as unknown as ApiClient;

// Polyfill Response if missing
if (typeof Response === 'undefined') {
    (global as any).Response = class Response {
        body: any;
        status: number;
        statusText: string;
        headers: any;

        constructor(body: any, init: any) {
            this.body = body;
            this.status = init?.status || 200;
            this.statusText = init?.statusText || 'OK';
            this.headers = new Map();
        }

        json() {
            return Promise.resolve(JSON.parse(this.body));
        }
    };
}

describe('MediaUploadManager', () => {
    let uploadManager: MediaUploadManager;
    let xhrMock: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock XMLHttpRequest
        xhrMock = {
            open: jest.fn(),
            send: jest.fn(),
            setRequestHeader: jest.fn(),
            upload: {
                addEventListener: jest.fn(),
            },
            addEventListener: jest.fn(),
            abort: jest.fn(),
            status: 200,
            statusText: 'OK',
            response: JSON.stringify({ success: true, url: 'https://example.com/file.jpg' }),
        };

        window.XMLHttpRequest = jest.fn(() => xhrMock) as any;

        uploadManager = new MediaUploadManager(mockConfig, mockApiClient);
    });

    afterEach(() => {
        uploadManager.destroy();
    });

    describe('Standard File Upload (FormData)', () => {
        it('should upload a valid file using FormData', async () => {
            const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

            // Setup successful upload simulation
            xhrMock.send.mockImplementation(() => {
                // Trigger load event immediately for this test
                const loadHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'load')[1];
                loadHandler();
            });

            const result = await uploadManager.uploadFile(file);

            expect(xhrMock.open).toHaveBeenCalledWith('POST', 'https://api.example.com/upload');
            expect(xhrMock.send).toHaveBeenCalledWith(expect.any(FormData));
            expect(result).toBeDefined();
        });

        it('should report upload progress', async () => {
            const file = new File(['test content'.repeat(1000)], 'large.jpg', { type: 'image/jpeg' });
            const onProgress = jest.fn();

            // Setup progress simulation
            xhrMock.send.mockImplementation(() => {
                const progressHandler = xhrMock.upload.addEventListener.mock.calls.find((call: any) => call[0] === 'progress')[1];
                const loadHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'load')[1];

                // Simulate progress
                progressHandler({ lengthComputable: true, loaded: 5000, total: 10000 });
                progressHandler({ lengthComputable: true, loaded: 10000, total: 10000 });

                loadHandler();
            });

            await uploadManager.uploadFile(file, { onProgress });

            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
                percentage: 50,
                loaded: 5000,
                total: 10000
            }));
            expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
                percentage: 100,
                loaded: 10000,
                total: 10000
            }));
        });
    });

    describe('Robustness Tests', () => {
        it('should handle non-File objects gracefully if coerced', async () => {
            // JavaScript users might pass objects that look like files but aren't instances of File
            // This tests if the manager fails fast or attempts to upload
            const fakeFile = {
                name: 'fake.png',
                size: 100,
                type: 'image/png',
                slice: () => new Blob(['a']),
            } as unknown as File;

            // The manager expects a File object for FormData.append('file', file)
            // If it's not a Blob/File, FormData typically casts it to string "[object Object]"
            // We want to see what happens.

            xhrMock.send.mockImplementation(() => {
                const loadHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'load')[1];
                loadHandler();
            });

            // expect it to NOT throw, but send something. 
            // Whether the server accepts "[object Object]" is another story, but the client shouldn't crash.
            await expect(uploadManager.uploadFile(fakeFile)).resolves.toBeDefined();
            expect(xhrMock.send).toHaveBeenCalled();
        });

        it('should handle "Any" type data acting as file', async () => {
            const anyData: any = "just a string";
            // This should fail because "just a string" doesn't have .size or .type properties accessed by MediaUploadManager
            await expect(uploadManager.uploadFile(anyData)).rejects.toThrow();
        });
    });

    describe('Edge Cases / "Without FormData"', () => {
        // MediaUploadManager is designed to use FormData. 
        // "Without FormData" logic would imply it manually constructs the body or uses a different strategy.
        // Since the code is hardcoded to `new FormData()`, we can verify that it *always* uses FormData 
        // effectively confirming "Without FormData" is NOT supported/default behavior for this class.

        it('should ALWAYS use FormData for uploads', async () => {
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });
            xhrMock.send.mockImplementation(() => {
                const loadHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'load')[1];
                loadHandler();
            });

            await uploadManager.uploadFile(file);

            const sendCall = xhrMock.send.mock.calls[0][0];
            expect(sendCall).toBeInstanceOf(FormData);
        });
    });

    describe('JSON Payload as File', () => {
        it('should upload a JSON file correctly', async () => {
            const jsonContent = JSON.stringify({ foo: 'bar' });
            const file = new File([jsonContent], 'data.json', { type: 'application/json' });

            xhrMock.send.mockImplementation(() => {
                const loadHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'load')[1];
                loadHandler();
            });

            await uploadManager.uploadFile(file);

            // Verify it was appended to FormData as a file
            expect(xhrMock.send).toHaveBeenCalledWith(expect.any(FormData));
        });
    });

    describe('Error Handling', () => {
        it('should handle network errors', async () => {
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });

            xhrMock.send.mockImplementation(() => {
                const errorHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'error')[1];
                errorHandler();
            });

            await expect(uploadManager.uploadFile(file)).rejects.toThrow('Network error during upload');
        });

        it('should handle server errors (500)', async () => {
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });
            xhrMock.status = 500;
            xhrMock.statusText = 'Internal Server Error';

            xhrMock.send.mockImplementation(() => {
                const loadHandler = xhrMock.addEventListener.mock.calls.find((call: any) => call[0] === 'load')[1];
                loadHandler();
            });

            await expect(uploadManager.uploadFile(file)).rejects.toThrow('Upload failed: 500 Internal Server Error');
        });
    });

});
