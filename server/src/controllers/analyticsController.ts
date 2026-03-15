import { Request, Response } from 'express';
import analyticsService from '../services/analyticsService.js';
import groqService from '../services/groqService.js';
import { analysisCache, userCache, tierCache } from '../services/cacheService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import config from '../config/index.js';
import { AuthRequest } from '../types/index.js';

export const analyticsController = {
  async trackEvent(req: AuthRequest, res: Response) {
    const { event, properties, analysisId, sessionId } = req.body;

    await analyticsService.trackEvent(
      { event, properties, analysisId, sessionId },
      {
        userId: req.user?.userId,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        referrer: req.headers.referer,
      }
    );

    return sendSuccess(res, { tracked: true });
  },

  async getDashboard(req: AuthRequest, res: Response) {
    const days = parseInt(req.query.days as string) || 30;
    const dashboard = await analyticsService.getDashboard(days);
    return sendSuccess(res, dashboard);
  },
};

export const healthController = {
  async check(_req: Request, res: Response) {
    return sendSuccess(res, {
      status: 'ok',
      service: 'Argus API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  },

  async detailed(_req: Request, res: Response) {
    const groqHealthy = await groqService.healthCheck();

    // Get cache statistics
    const cacheStats = {
      analysis: analysisCache.getStats(),
      user: userCache.getStats(),
      tier: tierCache.getStats(),
    };

    // Memory usage
    const memUsage = process.memoryUsage();
    const memoryStats = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
      external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
    };

    return sendSuccess(res, {
      status: groqHealthy ? 'healthy' : 'degraded',
      service: 'Argus API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      dependencies: {
        groq: { status: groqHealthy ? 'healthy' : 'unhealthy', model: config.groq.model },
        database: { status: 'healthy' },
      },
      performance: {
        memory: memoryStats,
        cache: {
          analysis: {
            entries: cacheStats.analysis.memoryEntries,
            hitRate: Math.round(cacheStats.analysis.hitRate * 100) + '%',
            hits: cacheStats.analysis.hits,
          },
          user: {
            entries: cacheStats.user.memoryEntries,
            hitRate: Math.round(cacheStats.user.hitRate * 100) + '%',
            hits: cacheStats.user.hits,
          },
          tier: {
            entries: cacheStats.tier.memoryEntries,
            hitRate: Math.round(cacheStats.tier.hitRate * 100) + '%',
            hits: cacheStats.tier.hits,
          },
        },
      },
    });
  },
};
