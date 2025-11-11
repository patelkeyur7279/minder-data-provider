import { Request, Response, NextFunction } from 'express';

/**
 * Rate Limiting Middleware
 * 
 * Why rate limiting?
 * - Prevent API abuse
 * - Protect backend resources
 * - Fair usage for all clients
 * 
 * This is a simple in-memory implementation.
 * For production, use Redis or similar.
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export function rateLimiter(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => void | undefined {
  const { windowMs, maxRequests } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    /**
     * Use IP address as identifier
     * In production, might want to use API key or user ID
     */
    const identifier = req.ip || 'unknown';
    const now = Date.now();

    // Initialize or reset if window expired
    if (!store[identifier] || store[identifier].resetTime < now) {
      store[identifier] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }

    // Increment request count
    store[identifier].count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - store[identifier].count));
    res.setHeader('X-RateLimit-Reset', store[identifier].resetTime);

    // Check if limit exceeded
    if (store[identifier].count > maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests, please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Cleanup old entries periodically
 * Prevents memory leak in long-running processes
 */
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000); // Cleanup every minute
