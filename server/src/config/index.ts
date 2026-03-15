import dotenv from 'dotenv';

dotenv.config();

const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // CORS
  corsOrigins: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.CLIENT_URL,
  ].filter(Boolean) as string[],
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // Cookie settings
  cookie: {
    name: 'argus_token',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  },
  
  // Download tokens (short-lived)
  downloadToken: {
    secret: process.env.DOWNLOAD_TOKEN_SECRET || process.env.JWT_SECRET || 'download-secret',
    expiresIn: '5m', // 5 minutes
  },
  
  // Groq API
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.GROQ_MAX_TOKENS || '4000', 10),
    temperature: parseFloat(process.env.GROQ_TEMPERATURE || '0.3'),
    timeout: parseInt(process.env.GROQ_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.GROQ_MAX_RETRIES || '3', 10),
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  
  // Analysis
  analysis: {
    maxTextLength: parseInt(process.env.MAX_TEXT_LENGTH || '5000', 10),
  },
  
  // Database
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  },

  // Redis (for distributed caching and rate limiting)
  redis: {
    url: process.env.REDIS_URL || null,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'argus:',
    ttl: {
      analysis: parseInt(process.env.REDIS_TTL_ANALYSIS || '86400', 10), // 24 hours
      user: parseInt(process.env.REDIS_TTL_USER || '300', 10), // 5 minutes
      tier: parseInt(process.env.REDIS_TTL_TIER || '60', 10), // 1 minute
    },
  },

  // Cluster mode
  cluster: {
    enabled: process.env.CLUSTER_ENABLED === 'true',
    workers: parseInt(process.env.CLUSTER_WORKERS || '0', 10), // 0 = auto (CPU count - 1)
  },

  // Job Queue
  queue: {
    enabled: process.env.QUEUE_ENABLED === 'true',
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  },

  // Metrics
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    path: process.env.METRICS_PATH || '/metrics',
  },

  // Health checks
  health: {
    path: process.env.HEALTH_PATH || '/health',
    detailed: process.env.HEALTH_DETAILED === 'true',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || 'json', // 'json' or 'pretty'
  },
} as const;

export function validateConfig(): void {
  const required = ['GROQ_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Security: Require strong JWT secret in production
  if (config.nodeEnv === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('Production requires JWT_SECRET with at least 32 characters');
    }
    if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-in-production') {
      throw new Error('You must change the default JWT_SECRET in production');
    }
  }

  // Validate Redis URL if provided
  if (config.redis.url && !config.redis.url.startsWith('redis://') && !config.redis.url.startsWith('rediss://')) {
    throw new Error('Invalid REDIS_URL format. Must start with redis:// or rediss://');
  }
}

export default config;
