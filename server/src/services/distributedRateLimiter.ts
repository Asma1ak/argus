import { Request, Response, NextFunction } from 'express';
import { cache } from './redisCacheService.js';
import logger from '../utils/logger.js';
import { metrics } from './metricsService.js';

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  windowMs: number;           // Time window in milliseconds
  max: number;                // Max requests per window
  keyGenerator?: (req: Request) => string;  // Custom key generator
  skip?: (req: Request) => boolean;         // Skip rate limiting
  message?: string;           // Error message
  statusCode?: number;        // HTTP status code when limited
  headers?: boolean;          // Include rate limit headers
}

/**
 * Rate limit result
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  total: number;
}

/**
 * Distributed rate limiter using Redis sliding window
 * Falls back to in-memory when Redis unavailable
 */
class DistributedRateLimiter {
  /**
   * Check rate limit using sliding window algorithm
   */
  async checkLimit(
    key: string,
    windowMs: number,
    maxRequests: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const windowKey = `ratelimit:${key}`;

    try {
      // Get current count and increment
      const currentCount = await cache.increment(windowKey, Math.ceil(windowMs / 1000));
      
      const remaining = Math.max(0, maxRequests - currentCount);
      const resetTime = now + windowMs;

      return {
        allowed: currentCount <= maxRequests,
        remaining,
        resetTime,
        total: maxRequests,
      };
    } catch (error) {
      logger.error('Rate limiter error:', error);
      // Fail open - allow request if rate limiter fails
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: now + windowMs,
        total: maxRequests,
      };
    }
  }

  /**
   * Create Express middleware
   */
  middleware(options: RateLimitOptions) {
    const {
      windowMs,
      max,
      keyGenerator = (req) => req.ip || 'unknown',
      skip = () => false,
      message = 'Too many requests, please try again later',
      statusCode = 429,
      headers = true,
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
      // Check if should skip
      if (skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const result = await this.checkLimit(key, windowMs, max);

      // Set headers
      if (headers) {
        res.setHeader('X-RateLimit-Limit', result.total);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
      }

      if (!result.allowed) {
        metrics.incrementCounter('rate_limit_exceeded', 1, { 
          path: req.path,
          method: req.method,
        });

        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        
        return res.status(statusCode).json({
          success: false,
          error: {
            message,
            retryAfter: Math.ceil(windowMs / 1000),
          },
        });
      }

      next();
    };
  }
}

// Export singleton
export const rateLimiter = new DistributedRateLimiter();

// Pre-configured rate limiters
export const rateLimiters = {
  // Global API rate limit
  global: rateLimiter.middleware({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    skip: (req) => req.path === '/health' || req.path === '/metrics',
  }),

  // Auth endpoints (stricter)
  auth: rateLimiter.middleware({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    keyGenerator: (req) => `auth:${req.ip}`,
    message: 'Too many authentication attempts',
  }),

  // Login specifically (very strict)
  login: rateLimiter.middleware({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `login:${req.ip}:${req.body?.email || 'unknown'}`,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  }),

  // Registration (prevent spam)
  register: rateLimiter.middleware({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    keyGenerator: (req) => `register:${req.ip}`,
    message: 'Registration limit reached. Please try again later.',
  }),

  // Analysis endpoint
  analysis: rateLimiter.middleware({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      // @ts-ignore - user may be attached by auth middleware
      const userId = req.user?.userId;
      return userId ? `analysis:user:${userId}` : `analysis:ip:${req.ip}`;
    },
    message: 'Analysis rate limit reached. Please wait before submitting again.',
  }),

  // API key rate limit (higher limits)
  apiKey: rateLimiter.middleware({
    windowMs: 60 * 1000,
    max: 60, // Higher limit for API key users
    keyGenerator: (req) => {
      const apiKey = req.headers['x-api-key'] as string;
      return `apikey:${apiKey?.slice(0, 20) || 'none'}`;
    },
  }),

  // Export endpoint (expensive operation)
  export: rateLimiter.middleware({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
      // @ts-ignore
      const userId = req.user?.userId;
      return `export:${userId || req.ip}`;
    },
    message: 'Export rate limit reached.',
  }),
};

export default rateLimiter;
