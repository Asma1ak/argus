import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { ApiError, sendError } from '../utils/apiResponse.js';
import config from '../config/index.js';

// Patterns that indicate sensitive error messages
const SENSITIVE_PATTERNS = [
  /prisma/i,
  /database/i,
  /sql/i,
  /postgres/i,
  /sqlite/i,
  /mysql/i,
  /mongodb/i,
  /constraint/i,
  /foreign key/i,
  /unique constraint/i,
  /connection refused/i,
  /ECONNREFUSED/i,
  /authentication failed/i,
  /permission denied/i,
  /access denied/i,
];

function isSensitiveError(message: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

function sanitizeErrorMessage(err: Error): string {
  const message = err.message;
  
  // In production, never expose sensitive error details
  if (config.nodeEnv === 'production') {
    if (isSensitiveError(message)) {
      return 'A database error occurred. Please try again later.';
    }
    
    // Don't expose stack traces or internal details
    if (message.includes('\n') || message.length > 200) {
      return 'An unexpected error occurred.';
    }
  }
  
  return message;
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string;
  
  // Log full error details server-side (never to client)
  logger.error('Request error', { 
    requestId,
    message: err.message, 
    stack: err.stack, 
    path: req.path, 
    method: req.method,
    ip: req.ip,
  });

  if (err instanceof ApiError) {
    return sendError(res, err);
  }

  if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
    return sendError(res, new ApiError(400, 'Invalid JSON in request body'));
  }

  // Prisma-specific errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    return sendError(res, new ApiError(400, 'A database constraint was violated.'));
  }

  if (err.constructor.name === 'PrismaClientValidationError') {
    return sendError(res, new ApiError(400, 'Invalid data provided.'));
  }

  const statusCode = 500;
  const message = sanitizeErrorMessage(err);

  return sendError(res, new ApiError(statusCode, message));
}

export function notFoundHandler(req: Request, res: Response) {
  // Don't reveal the exact path in production
  const message = config.nodeEnv === 'production' 
    ? 'Route not found'
    : `Route ${req.method} ${req.path} not found`;
  return sendError(res, new ApiError(404, message));
}

export function asyncHandler<T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
