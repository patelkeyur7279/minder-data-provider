/**
 * Next.js 13+ App Router Middleware Example
 * 
 * Server-side rate limiting using the new middleware.ts pattern
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================================================
// In-Memory Rate Limit Store (shared across requests)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

// ============================================================================
// Rate Limiter Function
// ============================================================================

interface RateLimitConfig {
  max: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  total: number;
}

function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetTime < now) {
    // Create new entry or reset expired entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(identifier, newEntry);

    return {
      allowed: true,
      remaining: config.max - 1,
      resetTime: newEntry.resetTime,
      total: config.max,
    };
  }

  // Increment existing entry
  entry.count++;
  rateLimitStore.set(identifier, entry);

  const allowed = entry.count <= config.max;
  const remaining = Math.max(0, config.max - entry.count);

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
    total: config.max,
  };
}

// ============================================================================
// Get Client Identifier (IP Address)
// ============================================================================

function getClientIdentifier(request: NextRequest): string {
  // Try to get real IP from headers (for proxy/load balancer setups)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to connection IP
  return request.ip ?? 'unknown';
}

// ============================================================================
// Middleware Configuration
// ============================================================================

const rateLimitConfigs: Record<string, RateLimitConfig> = {
  // Strict limits for authentication endpoints
  '/api/auth/login': { max: 5, windowMs: 60 * 1000 }, // 5 requests per minute
  '/api/auth/register': { max: 3, windowMs: 60 * 1000 }, // 3 requests per minute
  '/api/auth/reset-password': { max: 3, windowMs: 60 * 1000 },

  // Moderate limits for general API
  '/api/': { max: 100, windowMs: 60 * 1000 }, // 100 requests per minute

  // Lenient limits for public endpoints
  '/api/public/': { max: 1000, windowMs: 60 * 1000 }, // 1000 requests per minute
};

// ============================================================================
// Next.js Middleware
// ============================================================================

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip rate limiting for non-API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Find matching rate limit config
  let config: RateLimitConfig | null = null;
  let matchedPath = '';

  for (const [path, cfg] of Object.entries(rateLimitConfigs)) {
    if (pathname.startsWith(path) && path.length > matchedPath.length) {
      config = cfg;
      matchedPath = path;
    }
  }

  // No rate limit configured for this path
  if (!config) {
    return NextResponse.next();
  }

  // Get client identifier
  const identifier = getClientIdentifier(request);
  const rateLimitKey = `${matchedPath}:${identifier}`;

  // Check rate limit
  const result = checkRateLimit(rateLimitKey, config);

  // Create response
  const response = result.allowed
    ? NextResponse.next()
    : NextResponse.json(
        {
          error: 'Too many requests',
          message: 'You have exceeded the rate limit. Please try again later.',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        { status: 429 }
      );

  // Add rate limit headers
  response.headers.set('X-RateLimit-Limit', result.total.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

  if (!result.allowed) {
    response.headers.set(
      'Retry-After',
      Math.ceil((result.resetTime - Date.now()) / 1000).toString()
    );
  }

  return response;
}

// ============================================================================
// Middleware Configuration
// ============================================================================

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    
    // Exclude static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
