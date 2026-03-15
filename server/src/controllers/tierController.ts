import { Response } from 'express';
import tierService, { TierType } from '../services/tierService.js';
import { sendSuccess, Errors } from '../utils/apiResponse.js';
import { AuthRequest } from '../types/index.js';
import logger from '../utils/logger.js';

export const tierController = {
  /**
   * Get all available tiers
   */
  async getTiers(_req: AuthRequest, res: Response) {
    const tiers = tierService.getAllTiers();
    return sendSuccess(res, { tiers });
  },

  /**
   * Get current user's usage and tier info
   */
  async getUsage(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const usage = await tierService.getUserUsage(userId);
    return sendSuccess(res, { usage });
  },

  /**
   * Get usage history for charts
   */
  async getUsageHistory(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const days = parseInt(req.query.days as string) || 30;
    
    const history = await tierService.getUsageHistory(userId, days);
    const usage = await tierService.getUserUsage(userId);
    
    return sendSuccess(res, { history, usage });
  },

  /**
   * Upgrade to a new tier (mock - would integrate with Stripe in production)
   */
  async upgrade(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const { tier } = req.body;

    if (!['pro', 'enterprise'].includes(tier)) {
      throw Errors.BadRequest('Invalid tier. Choose "pro" or "enterprise"');
    }

    // In production, this would:
    // 1. Create Stripe checkout session
    // 2. Wait for webhook confirmation
    // 3. Then upgrade the user
    
    // For demo purposes, we'll upgrade immediately
    await tierService.upgradeTier(userId, tier as TierType, 30); // 30 days

    const usage = await tierService.getUserUsage(userId);

    logger.info(`User ${userId} upgraded to ${tier}`);

    return sendSuccess(res, { 
      message: `Successfully upgraded to ${tier}!`,
      usage,
    });
  },

  /**
   * Downgrade to free tier
   */
  async downgrade(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;

    await tierService.downgradeTier(userId);
    const usage = await tierService.getUserUsage(userId);

    return sendSuccess(res, { 
      message: 'Downgraded to free tier',
      usage,
    });
  },

  /**
   * Generate or regenerate API key (Pro/Enterprise only)
   */
  async generateApiKey(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;

    const apiKey = await tierService.generateApiKey(userId);

    if (!apiKey) {
      throw Errors.Forbidden('API keys are only available for Pro and Enterprise users');
    }

    return sendSuccess(res, { 
      apiKey,
      message: 'API key generated. Store it safely - it won\'t be shown again!',
    });
  },

  /**
   * Check if user can analyze (used by frontend)
   */
  async checkLimit(req: AuthRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
      // Anonymous users - simple rate limiting handled elsewhere
      return sendSuccess(res, { 
        canAnalyze: true,
        isAnonymous: true,
        message: 'Sign in to track your usage and get more analyses',
      });
    }

    const { allowed, reason, usage } = await tierService.canAnalyze(userId);

    return sendSuccess(res, {
      canAnalyze: allowed,
      reason,
      usage,
    });
  },
};

export default tierController;
