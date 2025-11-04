/**
 * Rate Limiter Usage Examples
 * 
 * Demonstrates various ways to implement server-side rate limiting
 */

// ============================================================================
// Example 1: Next.js API Route (Pages Router)
// ============================================================================

// pages/api/users.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createNextRateLimiter, RateLimitPresets } from 'minder-data-provider/middleware/rate-limiter';

const rateLimiter = createNextRateLimiter({
  max: 100, // 100 requests
  windowMs: 60 * 1000, // per 1 minute
  message: 'Too many requests to user API',
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiting
  await rateLimiter(req, res, async () => {
    // Your API logic here
    res.status(200).json({ users: [] });
  });
}

// ============================================================================
// Example 2: Strict Rate Limiting for Auth Endpoints
// ============================================================================

// pages/api/auth/login.ts
import { createNextRateLimiter, RateLimitPresets } from 'minder-data-provider/middleware/rate-limiter';

const strictLimiter = createNextRateLimiter(RateLimitPresets.strict);

export default async function loginHandler(req: NextApiRequest, res: NextApiResponse) {
  await strictLimiter(req, res, async () => {
    // Login logic (only 5 attempts per minute)
    const { email, password } = req.body;
    
    // Authenticate user...
    res.status(200).json({ token: 'jwt-token' });
  });
}

// ============================================================================
// Example 3: Custom Key Generator (Per-User Rate Limiting)
// ============================================================================

import { createRateLimiter } from 'minder-data-provider/middleware/rate-limiter';

const perUserLimiter = createRateLimiter({
  max: 50,
  windowMs: 60 * 1000,
  keyGenerator: (req) => {
    // Rate limit per authenticated user instead of IP
    const userId = req.headers.authorization?.split(' ')[1]; // Extract from JWT
    return userId || req.ip || 'anonymous';
  },
});

// ============================================================================
// Example 4: Conditional Rate Limiting
// ============================================================================

const conditionalLimiter = createRateLimiter({
  max: 100,
  windowMs: 60 * 1000,
  skip: (identifier) => {
    // Skip rate limiting for whitelisted IPs
    const whitelist = ['127.0.0.1', '::1', '10.0.0.0'];
    return whitelist.includes(identifier);
  },
});

// ============================================================================
// Example 5: Rate Limit with Custom Response
// ============================================================================

const customLimiter = createNextRateLimiter({
  max: 100,
  windowMs: 60 * 1000,
  statusCode: 429,
  message: 'Slow down! You are making requests too quickly.',
  onLimitReached: (identifier, req) => {
    console.warn(`Rate limit exceeded for ${identifier} on ${req.url}`);
    
    // Log to monitoring service
    // monitoringService.trackRateLimitViolation(identifier);
  },
});

// ============================================================================
// Example 6: Express Integration
// ============================================================================

import express from 'express';
import { createExpressRateLimiter } from 'minder-data-provider/middleware/rate-limiter';

const app = express();

// Apply rate limiting to all routes
app.use(createExpressRateLimiter({
  max: 100,
  windowMs: 60 * 1000,
}));

// Apply stricter limits to specific routes
app.post('/api/auth/login', 
  createExpressRateLimiter(RateLimitPresets.strict),
  (req, res) => {
    res.json({ message: 'Login endpoint' });
  }
);

// ============================================================================
// Example 7: Multiple Rate Limit Tiers
// ============================================================================

// pages/api/data.ts
import { createRateLimiter } from 'minder-data-provider/middleware/rate-limiter';

const freeTierLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
});

const premiumTierLimiter = createRateLimiter({
  max: 1000,
  windowMs: 60 * 1000,
});

export default async function dataHandler(req: NextApiRequest, res: NextApiResponse) {
  // Check user tier
  const userTier = req.headers['x-user-tier'] || 'free';
  const limiter = userTier === 'premium' ? premiumTierLimiter : freeTierLimiter;

  const result = await limiter.check(req);

  // Set headers
  res.setHeader('X-RateLimit-Limit', result.total);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      upgrade: 'Upgrade to premium for higher limits',
    });
  }

  // Process request
  res.status(200).json({ data: [] });
}

// ============================================================================
// Example 8: Redis-Based Rate Limiting (Production)
// ============================================================================

import { createClient } from 'redis';

class RedisRateLimitStore {
  private client;

  constructor() {
    this.client = createClient({ url: process.env.REDIS_URL });
    this.client.connect();
  }

  async increment(identifier: string, windowMs: number) {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();

    // Multi-command transaction
    const multi = this.client.multi();
    multi.incr(key);
    multi.pexpire(key, windowMs);
    
    const results = await multi.exec();
    const count = results[0] as number;

    return {
      count,
      resetTime: now + windowMs,
    };
  }

  async get(identifier: string) {
    const key = `ratelimit:${identifier}`;
    const count = await this.client.get(key);
    const ttl = await this.client.pttl(key);

    if (!count || ttl < 0) {
      return null;
    }

    return {
      count: parseInt(count, 10),
      resetTime: Date.now() + ttl,
    };
  }

  async reset(identifier: string) {
    await this.client.del(`ratelimit:${identifier}`);
  }
}

// Use with custom store
import { RateLimiter } from 'minder-data-provider/middleware/rate-limiter';

const redisStore = new RedisRateLimitStore();
const productionLimiter = new RateLimiter(
  {
    max: 100,
    windowMs: 60 * 1000,
  },
  redisStore as any // Type assertion for custom store
);

// ============================================================================
// Example 9: Rate Limit Reset Endpoint (Admin)
// ============================================================================

// pages/api/admin/reset-rate-limit.ts
import { createRateLimiter } from 'minder-data-provider/middleware/rate-limiter';

const limiter = createRateLimiter({ max: 100, windowMs: 60 * 1000 });

export default async function resetRateLimitHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify admin authentication
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { identifier } = req.body;
  await limiter.reset(identifier);

  res.status(200).json({ message: 'Rate limit reset successfully' });
}

// ============================================================================
// Example 10: Rate Limit Statistics
// ============================================================================

// pages/api/admin/rate-limit-stats.ts
export default async function statsHandler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const stats = limiter.getStats();
  
  res.status(200).json({
    totalEntries: stats.totalEntries,
    activeEntries: stats.activeEntries,
    memoryUsage: process.memoryUsage(),
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function isAdmin(req: NextApiRequest): boolean {
  // Implement admin check
  return req.headers['x-admin-key'] === process.env.ADMIN_KEY;
}

export {
  rateLimiter,
  strictLimiter,
  perUserLimiter,
  conditionalLimiter,
  customLimiter,
  productionLimiter,
};
