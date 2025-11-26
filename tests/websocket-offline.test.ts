import { WebSocketManager } from '../src/core/WebSocketManager';
import { AuthManager } from '../src/core/AuthManager';
import { WebSocketAdapter } from '../src/platform/adapters/websocket/WebSocketAdapter';

// Mock AuthManager
const mockAuthManager = {
    getToken: jest.fn().mockReturnValue('mock-token'),
} as unknown as AuthManager;

// Mock WebSocket Adapter
const mockAdapter = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn(),
    isConnected: jest.fn().mockReturnValue(false), // Simulating offline
    getState: jest.fn().mockReturnValue(3), // CLOSED
} as unknown as WebSocketAdapter;

// Mock Factory
jest.mock('../src/platform/adapters/websocket/WebSocketAdapterFactory', () => ({
    createWebSocketAdapterWithFallback: () => mockAdapter,
}));

describe('WebSocketManager Offline Behavior', () => {
    let wsManager: WebSocketManager;

    beforeEach(() => {
        wsManager = new WebSocketManager(
            { url: 'ws://test.com', reconnect: true },
            mockAuthManager
        );
        // Manually inject the mock adapter since we can't easily mock the factory in this setup without more complex jest config
        (wsManager as any).adapter = mockAdapter;
    });

    it('should queue messages when offline and flush when online', () => {
        const sendSpy = jest.spyOn(mockAdapter, 'send');

        // 1. Simulate offline state
        (mockAdapter.isConnected as jest.Mock).mockReturnValue(false);

        // 2. Attempt to send message (should be queued)
        wsManager.send('test-event', { data: 'test' });

        // Expect send NOT to be called yet
        expect(sendSpy).not.toHaveBeenCalled();

        // 3. Simulate reconnection
        // We need to trigger the onOpen callback that the manager passed to the adapter
        // Since we mocked the factory, we need to access the config passed to it
        // But for this unit test, we can simulate the flush behavior if we could access the queue
        // OR we can verify the behavior by simulating the flow:

        // Re-connect (which triggers onOpen in our real implementation)
        // For test simplicity, we'll manually trigger the flush if we can, 
        // but since flush is private, we'll rely on the fact that connect() sets up the callback.

        // Let's simulate the adapter becoming connected and the manager flushing
        (mockAdapter.isConnected as jest.Mock).mockReturnValue(true);

        // We need to manually call the flush method or trigger the onOpen callback.
        // Since we can't easily access the private onOpen callback from the mock adapter in this test setup,
        // we will verify the queueing logic by checking if send is called AFTER we manually call send again while connected?
        // No, that doesn't verify flush.

        // Let's use a slightly different approach: verify the queue length if possible, or cast to any to access private methods for testing
        (wsManager as any).flushOfflineQueue();

        expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: 'test-event', data: { data: 'test' } }));
    });
});
