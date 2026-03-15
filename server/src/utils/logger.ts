import winston from 'winston';
import config from '../config/index.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Patterns that should be redacted from logs
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /password["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: 'password=[REDACTED]' },
  { pattern: /token["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: 'token=[REDACTED]' },
  { pattern: /apiKey["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: 'apiKey=[REDACTED]' },
  { pattern: /api_key["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: 'api_key=[REDACTED]' },
  { pattern: /authorization["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: 'authorization=[REDACTED]' },
  { pattern: /bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /argus_[a-zA-Z0-9_-]+/g, replacement: 'argus_[REDACTED]' },
  // Email partial redaction
  { pattern: /([a-zA-Z0-9._%+-]{3})[a-zA-Z0-9._%+-]*@/g, replacement: '$1***@' },
];

/**
 * Sanitize a message to remove sensitive information
 */
function sanitizeMessage(message: unknown): string {
  if (typeof message !== 'string') {
    try {
      message = JSON.stringify(message);
    } catch {
      message = String(message);
    }
  }
  
  let sanitized = message as string;
  
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}

// Custom format that sanitizes messages
const sanitizeFormat = winston.format((info) => {
  if (info.message) {
    info.message = sanitizeMessage(info.message);
  }
  if (info.stack) {
    info.stack = sanitizeMessage(info.stack);
  }
  return info;
});

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: combine(
    sanitizeFormat(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        sanitizeFormat(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
    }),
  ],
  exitOnError: false,
});

if (config.nodeEnv === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    })
  );
}

export default logger;
