import { getDehydratedState } from '../src/ssr/index';

// Mock @tanstack/react-query
jest.mock('@tanstack/react-query', () => ({
    dehydrate: jest.fn(() => ({ dehydrated: true })),
    QueryClient: jest.fn(),
    HydrationBoundary: jest.fn(),
}));

describe('SSR Hydration', () => {
    it('should wait for prefetch promises and return dehydrated state', async () => {
        const mockQueryClient = {};
        const mockPrefetch = Promise.resolve('data');

        const state = await getDehydratedState(mockQueryClient, [mockPrefetch]);

        expect(state).toEqual({ dehydrated: true });
    });

    it('should handle multiple prefetch promises', async () => {
        const mockQueryClient = {};
        const p1 = Promise.resolve(1);
        const p2 = new Promise(resolve => setTimeout(() => resolve(2), 10));

        const start = Date.now();
        const state = await getDehydratedState(mockQueryClient, [p1, p2]);
        const duration = Date.now() - start;

        expect(state).toEqual({ dehydrated: true });
        expect(duration).toBeGreaterThanOrEqual(9); // Should wait for p2
    });
});
