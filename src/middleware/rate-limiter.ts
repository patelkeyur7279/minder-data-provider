/**
 * Server-Side Rate Limiting Middleware
 * 
 * Provides real security protection against API abuse.
 * Works with Next.js middleware, Express, and other frameworks.
 * 
 * @module middleware/rate-limiter
 */

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   * @default 100
   */
  max?: number;

  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Message to return when rate limit is exceeded
   * @default "Too many requests, please try again later"
   */
  message?: string;

  /**
   * Status code to return when rate limit is exceeded
   * @default 429
   */
  statusCode?: number;

  /**
   * Skip rate limiting for certain requests
   */
  skip?: (identifier: string) => boolean;

  /**
   * Custom identifier function (default: IP address)
   */
  keyGenerator?: (req: any) => string;

  /**
   * Handler called when rate limit is exceeded
   */
  onLimitReached?: (identifier: string, req: any) => void;
}

/**
 * Request entry in the rate limit store
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-Memory Rate Limit Store
 */
export class MemoryRateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Increment request count for identifier
   */
  public async increment(identifier: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now();
    const entry = this.store.get(identifier);

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired entry
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(identifier, newEntry);
      return newEntry;
    }

    // Increment existing entry
    entry.count++;
    this.store.set(identifier, entry);
    return entry;
  }

  /**
   * Get current entry for identifier
   */
  public async get(identifier: string): Promise<RateLimitEntry | null> {
    const now = Date.now();
    const entry = this.store.get(identifier);

    if (!entry || entry.resetTime < now) {
      return null;
    }

    return entry;
  }

  /**
   * Reset rate limit for identifier
   */
  public async reset(identifier: string): Promise<void> {
    this.store.delete(identifier);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    // Only log in development/debug mode
    if (cleanedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[RateLimiter] Cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * Get store statistics
   */
  public getStats(): { totalEntries: number; activeEntries: number } {
    const now = Date.now();
    let activeEntries = 0;

    for (const entry of this.store.values()) {
      if (entry.resetTime >= now) {
        activeEntries++;
      }
    }

    return {
      totalEntries: this.store.size,
      activeEntries,
    };
  }

  /**
   * Cleanup on disposal
   */
  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

/**
 * Rate Limiter
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private store: MemoryRateLimitStore;

  constructor(config: RateLimitConfig = {}, store?: MemoryRateLimitStore) {
    this.config = {
      max: config.max ?? 100,
      windowMs: config.windowMs ?? 60000, // 1 minute
      message: config.message ?? 'Too many requests, please try again later',
      statusCode: config.statusCode ?? 429,
      skip: config.skip ?? (() => false),
      keyGenerator: config.keyGenerator ?? this.defaultKeyGenerator.bind(this),
      onLimitReached: config.onLimitReached ?? (() => {}),
    };

    this.store = store ?? new MemoryRateLimitStore();
  }

  /**
   * Default key generator (extracts IP address)
   */
  private defaultKeyGenerator(req: any): string {
    // Try different sources for IP address
    const ip =
      req.ip ||
      req.headers?.['x-forwarded-for']?.split(',')[0].trim() ||
      req.headers?.['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown';

    return String(ip);
  }

  /**
   * Check rate limit for request
   */
  public async check(req: any): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    total: number;
  }> {
    const identifier = this.config.keyGenerator(req);

    // Skip if configured
    if (this.config.skip(identifier)) {
      return {
        allowed: true,
        remaining: this.config.max,
        resetTime: Date.now() + this.config.windowMs,
        total: this.config.max,
      };
    }

    // Increment and check
    const entry = await this.store.increment(identifier, this.config.windowMs);
    const allowed = entry.count <= this.config.max;
    const remaining = Math.max(0, this.config.max - entry.count);

    if (!allowed) {
      this.config.onLimitReached(identifier, req);
    }

    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
      total: this.config.max,
    };
  }

  /**
   * Reset rate limit for identifier
   */
  public async reset(identifier: string): Promise<void> {
    await this.store.reset(identifier);
  }

  /**
   * Get store statistics
   */
  public getStats() {
    return this.store.getStats();
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    this.store.dispose();
  }
}

/**
 * Create rate limiter
 */
export function createRateLimiter(config?: RateLimitConfig): RateLimiter {
  return new RateLimiter(config);
}

/**
 * Next.js Middleware Rate Limiter
 */
export function createNextRateLimiter(config?: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  return async function rateLimitMiddleware(req: any, res: any, next?: () => void) {
    const result = await limiter.check(req);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.total.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      res.status(limiter['config'].statusCode);
      res.setHeader('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());

      // For Next.js API routes
      if (res.json) {
        return res.json({
          error: limiter['config'].message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        });
      }

      // For older frameworks
      res.end(JSON.stringify({
        error: limiter['config'].message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      }));
      return;
    }

    // Continue to next middleware or route handler
    if (next) {
      next();
    }
  };
}

/**
 * Express Middleware Rate Limiter
 */
export function createExpressRateLimiter(config?: RateLimitConfig) {
  const limiter = new RateLimiter(config);

  return async function rateLimitMiddleware(req: any, res: any, next: () => void) {
    const result = await limiter.check(req);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': result.total,
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
    });

    if (!result.allowed) {
      res.set('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
      res.status(limiter['config'].statusCode).json({
        error: limiter['config'].message,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Preset configurations
 */
export const RateLimitPresets = {
  /**
   * Strict - For sensitive endpoints (auth, payment)
   */
  strict: {
    max: 5,
    windowMs: 60 * 1000, // 1 minute
    message: 'Too many requests to sensitive endpoint',
  },

  /**
   * Moderate - For general API endpoints
   */
  moderate: {
    max: 100,
    windowMs: 60 * 1000, // 1 minute
  },

  /**
   * Lenient - For public endpoints
   */
  lenient: {
    max: 1000,
    windowMs: 60 * 1000, // 1 minute
  },

  /**
   * Per-hour - For bulk operations
   */
  perHour: {
    max: 1000,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
} as const;
