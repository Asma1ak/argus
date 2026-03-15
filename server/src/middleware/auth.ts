import { Response, NextFunction } from 'express';
import authService from '../services/authService.js';
import tierService from '../services/tierService.js';
import { AuthRequest } from '../types/index.js';
import { Errors, sendError } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

/**
 * Wrap async middleware to catch errors
 */
function asyncMiddleware(fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Extract token from request (cookie first, then header, then query param)
 */
function extractToken(req: AuthRequest): string | null {
  // 1. Check httpOnly cookie first (most secure)
  const cookieName = authService.getCookieName();
  if (req.cookies && req.cookies[cookieName]) {
    return req.cookies[cookieName];
  }
  
  // 2. Check Authorization header (for API clients)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // 3. Check query param for download tokens ONLY
  // Regular auth should NOT use query params
  if (req.query.downloadToken && typeof req.query.downloadToken === 'string') {
    return req.query.downloadToken;
  }
  
  return null;
}

/**
 * Extract API key from request
 */
function extractApiKey(req: AuthRequest): string | null {
  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.startsWith('argus_')) {
    return apiKeyHeader;
  }
  
  // Also accept in Authorization header with ApiKey prefix
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('ApiKey ')) {
    return authHeader.slice(7);
  }
  
  return null;
}

/**
 * Require authentication (JWT or API Key)
 */
export const requireAuth = asyncMiddleware(async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Try API key first
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const user = await tierService.validateApiKey(apiKey);
    if (user) {
      req.user = { userId: user.id, email: user.email };
      req.authMethod = 'apiKey';
      return next();
    }
    // Invalid API key
    logger.warn('Invalid API key attempt', { keyPrefix: apiKey.slice(0, 10) });
    return sendError(res, Errors.Unauthorized('Invalid API key'));
  }

  // Try JWT token
  const token = extractToken(req);
  if (!token) {
    return sendError(res, Errors.Unauthorized('Authentication required'));
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    req.authMethod = 'jwt';
    next();
  } catch {
    return sendError(res, Errors.Unauthorized('Invalid or expired session'));
  }
});

/**
 * Optional authentication - sets user if token present
 */
export const optionalAuth = asyncMiddleware(async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Try API key first
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const user = await tierService.validateApiKey(apiKey);
    if (user) {
      req.user = { userId: user.id, email: user.email };
      req.authMethod = 'apiKey';
    }
    return next();
  }

  // Try JWT token
  const token = extractToken(req);
  if (token) {
    try {
      const payload = authService.verifyToken(token);
      req.user = payload;
      req.authMethod = 'jwt';
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
  
  next();
});

/**
 * Verify download token for secure file downloads
 */
export function verifyDownloadToken(req: AuthRequest, res: Response, next: NextFunction): void | Response {
  try {
    const downloadToken = req.query.downloadToken as string;
    
    if (!downloadToken) {
      return sendError(res, Errors.Unauthorized('Download token required'));
    }

    const payload = authService.verifyDownloadToken(downloadToken);
    
    if (!payload) {
      return sendError(res, Errors.Unauthorized('Invalid or expired download token'));
    }
    
    // Store download context for use in controller
    req.downloadContext = payload;
    
    // Also set user if present in token
    if (payload.userId) {
      req.user = { userId: payload.userId, email: '' };
    }
    
    next();
  } catch {
    return sendError(res, Errors.Unauthorized('Invalid download token'));
  }
}

/**
 * Require admin access (for dashboard, etc.)
 */
export const requireAdmin = asyncMiddleware(async (req: AuthRequest, res: Response, next: NextFunction) => {
  // First require auth
  const token = extractToken(req);
  if (!token) {
    return sendError(res, Errors.Unauthorized('Authentication required'));
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    
    // For now, allow all authenticated users
    // In production, check for admin role in database
    return next();
  } catch {
    return sendError(res, Errors.Unauthorized('Invalid or expired session'));
  }
});
