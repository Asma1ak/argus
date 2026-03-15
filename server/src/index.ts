import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import crypto from 'crypto';
import http from 'http';

import config, { validateConfig } from './config/index.js';
import prisma from './config/database.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import { cache } from './services/redisCacheService.js';
import { jobQueue } from './services/jobQueueService.js';
import { clusterManager } from './services/clusterManager.js';
import { metrics } from './services/metricsService.js';

// Validate config
validateConfig();

/**
 * Create and configure Express app
 */
function createApp(): express.Application {
  const app = express();

  // Trust proxy (for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Request ID middleware for tracing
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // Metrics middleware
  if (config.metrics.enabled) {
    app.use((req, res, next) => {
      const startTime = process.hrtime.bigint();
      
      res.on('finish', () => {
        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        metrics.recordRequest(req.method, req.path, res.statusCode, duration);
      });
      
      next();
    });
  }

  // Cookie parser
  app.use(cookieParser());

  // Compression
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }));

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'", 'https://api.groq.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
  }));

  // Additional security headers
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  // Global rate limiter
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, error: { message: 'Too many requests, please slow down' } },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health' || req.path === '/metrics',
  });
  app.use(globalLimiter);

  // CORS
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      if (config.nodeEnv === 'development') {
        if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
          return callback(null, true);
        }
      }
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-API-Key'],
    exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
    maxAge: 86400,
  }));

  // Parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Logging (skip health checks and metrics)
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev', {
    stream: { write: (message) => logger.info(message.trim()) },
    skip: (req) => req.path === '/api/health' || req.path === '/metrics',
  }));

  // Root route
  app.get('/', (_req, res) => {
    res.json({
      name: 'Argus API',
      version: '1.0.0',
      description: 'Critical Thinking Analysis API',
      status: 'running',
      worker: clusterManager.getWorkerId(),
    });
  });

  // Prometheus metrics endpoint
  if (config.metrics.enabled) {
    app.get('/metrics', (_req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(metrics.getPrometheusMetrics());
    });
  }

  // Health check endpoints
  app.get('/health', async (_req, res) => {
    const redisHealthy = await cache.healthCheck();
    const dbHealthy = await checkDatabaseHealth();
    
    const status = redisHealthy && dbHealthy ? 'healthy' : 'degraded';
    const statusCode = status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      worker: clusterManager.getWorkerId(),
      checks: {
        database: dbHealthy ? 'ok' : 'fail',
        cache: redisHealthy ? 'ok' : 'fail',
      },
    });
  });

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    const redisHealthy = await cache.healthCheck();
    const dbHealthy = await checkDatabaseHealth();
    
    if (redisHealthy && dbHealthy) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  });

  // API Routes
  app.use('/api', routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize services
 */
async function initializeServices(): Promise<void> {
  // Connect to Redis
  await cache.connect();
  logger.info('Cache service initialized');

  // Start job queue if enabled
  if (config.queue.enabled) {
    jobQueue.start();
    logger.info('Job queue started');
  }

  // Record startup metric
  metrics.incrementCounter('app_starts_total');
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  // Initialize services
  await initializeServices();

  const app = createApp();
  const server = http.createServer(app);

  // Keep-alive settings for load balancer compatibility
  server.keepAliveTimeout = 65000; // Slightly higher than ALB's 60s
  server.headersTimeout = 66000;

  // Handle connections for graceful shutdown
  const connections = new Set<http.ServerResponse>();
  
  server.on('connection', (socket) => {
    const response = new http.ServerResponse(socket as unknown as http.IncomingMessage);
    connections.add(response);
    socket.on('close', () => connections.delete(response));
  });

  // Start listening
  server.listen(config.port, () => {
    const workerId = clusterManager.getWorkerId();
    logger.info(`
╔══════════════════════════════════════════╗
║                                          ║
║   👁️  Argus API Server                   ║
║                                          ║
║   Environment: ${config.nodeEnv.padEnd(24)}║
║   Port: ${String(config.port).padEnd(31)}║
║   Worker: ${String(workerId).padEnd(29)}║
║   Redis: ${(config.redis.url ? 'Connected' : 'In-Memory').padEnd(30)}║
║   Queue: ${(config.queue.enabled ? 'Enabled' : 'Disabled').padEnd(30)}║
║   Metrics: ${(config.metrics.enabled ? 'Enabled' : 'Disabled').padEnd(28)}║
║                                          ║
╚══════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Stop job queue
      if (config.queue.enabled) {
        await jobQueue.stop();
        logger.info('Job queue stopped');
      }
      
      // Disconnect cache
      await cache.disconnect();
      logger.info('Cache disconnected');
      
      // Disconnect database
      await prisma.$disconnect();
      logger.info('Database disconnected');
      
      process.exit(0);
    });

    // Force close connections after timeout
    setTimeout(() => {
      logger.warn('Force closing remaining connections');
      for (const conn of connections) {
        conn.end();
      }
      
      setTimeout(() => {
        logger.error('Forced shutdown');
        process.exit(1);
      }, 5000);
    }, 25000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle worker messages in cluster mode
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      shutdown('CLUSTER_SHUTDOWN');
    }
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    metrics.incrementCounter('uncaught_exceptions_total');
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    metrics.incrementCounter('unhandled_rejections_total');
  });
}

// Entry point
if (config.cluster.enabled) {
  clusterManager.start(startServer);
} else {
  startServer().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default createApp;
