/**
 * Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  RateLimiter,
  MemoryRateLimitStore,
  createRateLimiter,
  RateLimitPresets,
} from '../src/middleware/rate-limiter';

describe('MemoryRateLimitStore', () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('should increment request count', async () => {
    const entry1 = await store.increment('test-ip', 60000);
    expect(entry1.count).toBe(1);

    const entry2 = await store.increment('test-ip', 60000);
    expect(entry2.count).toBe(2);
  });

  it('should reset count after window expires', async () => {
    const entry1 = await store.increment('test-ip', 100); // 100ms window
    expect(entry1.count).toBe(1);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    const entry2 = await store.increment('test-ip', 100);
    expect(entry2.count).toBe(1); // Reset to 1
  });

  it('should track separate identifiers independently', async () => {
    const entry1 = await store.increment('ip-1', 60000);
    const entry2 = await store.increment('ip-2', 60000);

    expect(entry1.count).toBe(1);
    expect(entry2.count).toBe(1);
  });

  it('should reset specific identifier', async () => {
    await store.increment('test-ip', 60000);
    await store.increment('test-ip', 60000);

    const beforeReset = await store.get('test-ip');
    expect(beforeReset?.count).toBe(2);

    await store.reset('test-ip');

    const afterReset = await store.get('test-ip');
    expect(afterReset).toBeNull();
  });

  it('should return null for expired entries', async () => {
    await store.increment('test-ip', 100);

    await new Promise(resolve => setTimeout(resolve, 150));

    const entry = await store.get('test-ip');
    expect(entry).toBeNull();
  });

  it('should provide accurate stats', async () => {
    await store.increment('ip-1', 60000);
    await store.increment('ip-2', 60000);
    await store.increment('ip-3', 100); // Will expire soon

    let stats = store.getStats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.activeEntries).toBe(3);

    // Wait for one to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    stats = store.getStats();
    expect(stats.totalEntries).toBe(3); // Still in store
    expect(stats.activeEntries).toBe(2); // But only 2 active
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;
  let mockReq: any;

  beforeEach(() => {
    mockReq = {
      ip: '192.168.1.100',
      headers: {},
    };
  });

  afterEach(() => {
    if (limiter) {
      limiter.dispose();
    }
  });

  it('should allow requests under limit', async () => {
    limiter = new RateLimiter({
      max: 5,
      windowMs: 60000,
    });

    for (let i = 0; i < 5; i++) {
      const result = await limiter.check(mockReq);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i - 1);
    }
  });

  it('should block requests over limit', async () => {
    limiter = new RateLimiter({
      max: 3,
      windowMs: 60000,
    });

    // Make 3 allowed requests
    await limiter.check(mockReq);
    await limiter.check(mockReq);
    await limiter.check(mockReq);

    // 4th request should be blocked
    const result = await limiter.check(mockReq);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after window expires', async () => {
    limiter = new RateLimiter({
      max: 2,
      windowMs: 100,
    });

    // Use up the limit
    await limiter.check(mockReq);
    await limiter.check(mockReq);

    const blocked = await limiter.check(mockReq);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be allowed again
    const allowed = await limiter.check(mockReq);
    expect(allowed.allowed).toBe(true);
  });

  it('should use custom key generator', async () => {
    limiter = new RateLimiter({
      max: 2,
      windowMs: 60000,
      keyGenerator: (req) => req.userId || req.ip,
    });

    const user1Req = { ...mockReq, userId: 'user-1' };
    const user2Req = { ...mockReq, userId: 'user-2' };

    // Each user gets their own limit
    await limiter.check(user1Req);
    await limiter.check(user1Req);

    const user1Result = await limiter.check(user1Req);
    expect(user1Result.allowed).toBe(false);

    const user2Result = await limiter.check(user2Req);
    expect(user2Result.allowed).toBe(true);
  });

  it('should skip rate limiting when configured', async () => {
    limiter = new RateLimiter({
      max: 1,
      windowMs: 60000,
      skip: (identifier) => identifier === '127.0.0.1',
    });

    const localReq = { ...mockReq, ip: '127.0.0.1' };

    // Should allow unlimited requests
    for (let i = 0; i < 10; i++) {
      const result = await limiter.check(localReq);
      expect(result.allowed).toBe(true);
    }
  });

  it('should call onLimitReached callback', async () => {
    const onLimitReached = jest.fn();

    limiter = new RateLimiter({
      max: 2,
      windowMs: 60000,
      onLimitReached,
    });

    await limiter.check(mockReq);
    await limiter.check(mockReq);
    await limiter.check(mockReq); // Over limit

    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(onLimitReached).toHaveBeenCalledWith('192.168.1.100', mockReq);
  });

  it('should extract IP from x-forwarded-for header', async () => {
    limiter = new RateLimiter({ max: 2, windowMs: 60000 });

    const proxyReq = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
    };

    await limiter.check(proxyReq);
    await limiter.check(proxyReq);

    const result = await limiter.check(proxyReq);
    expect(result.allowed).toBe(false); // Same IP blocked
  });

  it('should extract IP from x-real-ip header', async () => {
    limiter = new RateLimiter({ max: 2, windowMs: 60000 });

    const proxyReq = {
      headers: {
        'x-real-ip': '203.0.113.195',
      },
    };

    await limiter.check(proxyReq);
    await limiter.check(proxyReq);

    const result = await limiter.check(proxyReq);
    expect(result.allowed).toBe(false);
  });

  it('should allow manual reset', async () => {
    limiter = new RateLimiter({ max: 2, windowMs: 60000 });

    await limiter.check(mockReq);
    await limiter.check(mockReq);

    const blocked = await limiter.check(mockReq);
    expect(blocked.allowed).toBe(false);

    // Reset manually
    await limiter.reset('192.168.1.100');

    const allowed = await limiter.check(mockReq);
    expect(allowed.allowed).toBe(true);
  });
});

describe('RateLimitPresets', () => {
  it('should have strict preset', () => {
    expect(RateLimitPresets.strict).toBeDefined();
    expect(RateLimitPresets.strict.max).toBe(5);
    expect(RateLimitPresets.strict.windowMs).toBe(60000);
  });

  it('should have moderate preset', () => {
    expect(RateLimitPresets.moderate).toBeDefined();
    expect(RateLimitPresets.moderate.max).toBe(100);
  });

  it('should have lenient preset', () => {
    expect(RateLimitPresets.lenient).toBeDefined();
    expect(RateLimitPresets.lenient.max).toBe(1000);
  });

  it('should have perHour preset', () => {
    expect(RateLimitPresets.perHour).toBeDefined();
    expect(RateLimitPresets.perHour.max).toBe(1000);
    expect(RateLimitPresets.perHour.windowMs).toBe(3600000); // 1 hour
  });
});

describe('createRateLimiter', () => {
  it('should create rate limiter instance', () => {
    const limiter = createRateLimiter({ max: 10, windowMs: 60000 });
    expect(limiter).toBeInstanceOf(RateLimiter);
    limiter.dispose();
  });

  it('should work with presets', async () => {
    const limiter = createRateLimiter(RateLimitPresets.strict);

    const mockReq = { ip: '192.168.1.1' };

    // Strict allows only 5 requests
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check(mockReq);
      expect(result.allowed).toBe(true);
    }

    const blocked = await limiter.check(mockReq);
    expect(blocked.allowed).toBe(false);

    limiter.dispose();
  });
});
