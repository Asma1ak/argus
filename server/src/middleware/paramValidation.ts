import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiResponse.js';

/**
 * Validate that an ID parameter is a valid format
 * Prevents NoSQL injection and path traversal attacks
 */
export function validateIdParam(paramName: string = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const id = req.params[paramName];
    
    if (!id) {
      return next(new ApiError(400, `Missing ${paramName} parameter`));
    }

    // CUID format: starts with 'c', followed by alphanumeric chars, typically 25 chars
    // Also allow nanoid format (10-21 alphanumeric + some special chars)
    const validIdPattern = /^[a-zA-Z0-9_-]{8,36}$/;
    
    if (!validIdPattern.test(id)) {
      return next(new ApiError(400, `Invalid ${paramName} format`));
    }

    // Check for path traversal attempts
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return next(new ApiError(400, `Invalid ${paramName} format`));
    }

    next();
  };
}

/**
 * Validate shareId parameter (shorter format)
 */
export function validateShareId(req: Request, _res: Response, next: NextFunction) {
  const shareId = req.params.shareId;
  
  if (!shareId) {
    return next(new ApiError(400, 'Missing shareId parameter'));
  }

  // ShareId is a nanoid(10) - alphanumeric, 10 chars
  const validShareIdPattern = /^[a-zA-Z0-9_-]{8,21}$/;
  
  if (!validShareIdPattern.test(shareId)) {
    return next(new ApiError(400, 'Invalid shareId format'));
  }

  next();
}

/**
 * Sanitize query parameters to prevent injection
 */
export function sanitizeQueryParams(req: Request, _res: Response, next: NextFunction) {
  // Sanitize common query params
  if (req.query.limit) {
    const limit = parseInt(req.query.limit as string, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      req.query.limit = '20'; // Default
    } else {
      req.query.limit = String(limit);
    }
  }

  if (req.query.offset) {
    const offset = parseInt(req.query.offset as string, 10);
    if (isNaN(offset) || offset < 0) {
      req.query.offset = '0';
    } else {
      req.query.offset = String(offset);
    }
  }

  if (req.query.days) {
    const days = parseInt(req.query.days as string, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      req.query.days = '30';
    } else {
      req.query.days = String(days);
    }
  }

  next();
}

/**
 * Validate format query parameter for exports
 */
export function validateExportFormat(req: Request, _res: Response, next: NextFunction) {
  const format = req.query.format as string;
  
  if (format && !['json', 'pdf'].includes(format)) {
    return next(new ApiError(400, 'Invalid export format. Must be json or pdf.'));
  }

  next();
}

export default {
  validateIdParam,
  validateShareId,
  sanitizeQueryParams,
  validateExportFormat,
};
