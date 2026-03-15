import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const CSRF_COOKIE_NAME = 'argus_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * CSRF Protection Middleware
 * 
 * Uses double-submit cookie pattern:
 * 1. Server sets a CSRF token in a cookie (readable by JS)
 * 2. Client must send the same token in a header
 * 3. Server verifies they match
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    // Set CSRF token cookie if not present (for client to read)
    if (!req.cookies[CSRF_COOKIE_NAME]) {
      const token = generateToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by JavaScript
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });
    }
    return next();
  }

  // For state-changing methods, verify CSRF token
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;

  if (!cookieToken || !headerToken) {
    logger.warn('CSRF token missing', { 
      path: req.path, 
      hasCookie: !!cookieToken, 
      hasHeader: !!headerToken 
    });
    res.status(403).json({
      success: false,
      error: { message: 'CSRF token missing' },
    });
    return;
  }

  // Use constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    logger.warn('CSRF token mismatch', { path: req.path });
    res.status(403).json({
      success: false,
      error: { message: 'CSRF token invalid' },
    });
    return;
  }

  // Rotate token after successful validation
  const newToken = generateToken();
  res.cookie(CSRF_COOKIE_NAME, newToken, {
    httpOnly: false,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  next();
}

/**
 * Generate initial CSRF token for client
 * Call this on app load to ensure token is set
 */
export function setCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies[CSRF_COOKIE_NAME]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
  next();
}

export default csrfProtection;
