import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from '../utils/apiResponse.js';
import config from '../config/index.js';

export const schemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string()
      .min(8)
      .max(128)
      .required()
      .custom((value, helpers) => {
        // Check complexity for shorter passwords
        if (value.length < 12) {
          const hasUpper = /[A-Z]/.test(value);
          const hasLower = /[a-z]/.test(value);
          const hasNumber = /\d/.test(value);
          const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);
          
          const complexity = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
          
          if (complexity < 3) {
            return helpers.error('password.complexity');
          }
        }
        
        // Check for common passwords
        const commonPasswords = [
          'password', '12345678', 'qwerty123', 'letmein', 'welcome',
          'admin123', 'password1', 'password123'
        ];
        
        if (commonPasswords.includes(value.toLowerCase())) {
          return helpers.error('password.common');
        }
        
        return value;
      })
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.max': 'Password must be less than 128 characters',
        'password.complexity': 'Password must contain at least 3 of: uppercase, lowercase, number, special character',
        'password.common': 'Password is too common. Please choose a stronger password.',
        'any.required': 'Password is required',
      }),
    name: Joi.string()
      .max(100)
      .trim()
      .optional()
      .custom((value) => {
        if (!value) return value;
        // Sanitize: remove HTML tags, scripts, and dangerous characters
        return value
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/[<>'"&]/g, '') // Remove dangerous chars
          .replace(/javascript:/gi, '') // Remove JS protocol
          .replace(/on\w+=/gi, '') // Remove event handlers
          .trim();
      }),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  analyzeText: Joi.object({
    text: Joi.string()
      .min(10)
      .max(config.analysis.maxTextLength)
      .required()
      .messages({
        'string.min': 'Text must be at least 10 characters',
        'string.max': `Text must be under ${config.analysis.maxTextLength} characters`,
      }),
    language: Joi.string()
      .valid('auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi', 'tr', 'pl', 'vi', 'th', 'id')
      .default('auto')
      .optional(),
  }),

  analyzeUrl: Joi.object({
    url: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .messages({
        'string.uri': 'Please provide a valid URL (http or https)',
      }),
    language: Joi.string()
      .valid('auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar', 'hi', 'tr', 'pl', 'vi', 'th', 'id')
      .default('auto')
      .optional(),
  }),

  extractUrl: Joi.object({
    url: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .messages({
        'string.uri': 'Please provide a valid URL (http or https)',
      }),
  }),

  updatePreferences: Joi.object({
    theme: Joi.string().valid('dark', 'light', 'system').optional(),
    emailNotifications: Joi.boolean().optional(),
  }),

  upgradeTier: Joi.object({
    tier: Joi.string().valid('pro', 'enterprise').required(),
  }),

  trackEvent: Joi.object({
    event: Joi.string().required(),
    properties: Joi.object().optional(),
    analysisId: Joi.string().optional(),
    sessionId: Joi.string().optional(),
  }),
};

export function validate(schema: Joi.Schema, property: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(new ApiError(400, 'Validation failed', details));
    }

    req[property] = value;
    next();
  };
}

export function sanitizeText(req: Request, _res: Response, next: NextFunction) {
  if (req.body?.text) {
    req.body.text = req.body.text.trim().replace(/\s+/g, ' ');
  }
  next();
}
