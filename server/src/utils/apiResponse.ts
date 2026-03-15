import { Response } from 'express';
import { ApiResponse } from '../types/index.js';

export class ApiError extends Error {
  statusCode: number;
  details: unknown;
  isOperational: boolean;

  constructor(statusCode: number, message: string, details: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const Errors = {
  BadRequest: (message = 'Bad Request', details: unknown = null) => 
    new ApiError(400, message, details),
  
  Unauthorized: (message = 'Unauthorized') => 
    new ApiError(401, message),
  
  Forbidden: (message = 'Forbidden') => 
    new ApiError(403, message),
  
  NotFound: (message = 'Not Found') => 
    new ApiError(404, message),
  
  Conflict: (message = 'Conflict') => 
    new ApiError(409, message),
  
  TooManyRequests: (message = 'Too many requests, please try again later') => 
    new ApiError(429, message),
  
  InternalError: (message = 'Internal Server Error') => 
    new ApiError(500, message),
};

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
}

export function sendError(res: Response, error: ApiError | Error): Response {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = error.message || 'Internal Server Error';
  const details = error instanceof ApiError ? error.details : null;

  const response: ApiResponse = {
    success: false,
    error: { message, details },
    timestamp: new Date().toISOString(),
  };
  
  return res.status(statusCode).json(response);
}
