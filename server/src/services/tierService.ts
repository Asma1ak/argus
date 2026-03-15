import { nanoid } from 'nanoid';
import crypto from 'crypto';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';

// Tier definitions
export const TIERS = {
  free: {
    name: 'Free',
    dailyLimit: 10,
    maxTextLength: 3000,
    features: ['Basic analysis', '10 analyses/day', 'Web app access'],
    price: 0,
  },
  pro: {
    name: 'Pro',
    dailyLimit: 200,
    maxTextLength: 10000,
    features: ['Advanced analysis', '200 analyses/day', 'Browser extension', 'API access', 'Export to PDF', 'Priority support'],
    price: 3.99,
  },
  enterprise: {
    name: 'Enterprise',
    dailyLimit: Infinity,
    maxTextLength: 50000,
    features: ['Unlimited analyses', 'Browser extension', 'Custom integrations', 'Dedicated support', 'SLA guarantee', 'Team management', 'Analytics dashboard'],
    price: 14.99,
  },
} as const;

export type TierType = keyof typeof TIERS;

export interface UsageInfo {
  tier: TierType;
  tierName: string;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  percentUsed: number;
  canAnalyze: boolean;
  resetAt: Date;
  maxTextLength: number;
  features: string[];
}

class TierService {
  /**
   * Get tier information
   */
  getTierInfo(tier: TierType) {
    return TIERS[tier] || TIERS.free;
  }

  /**
   * Get all tiers for display
   */
  getAllTiers() {
    return Object.entries(TIERS).map(([key, value]) => ({
      id: key,
      ...value,
      dailyLimit: value.dailyLimit === Infinity ? 'Unlimited' : value.dailyLimit,
    }));
  }

  /**
   * Get user's current usage for today
   */
  async getUserUsage(userId: string): Promise<UsageInfo> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });

    const tier = (user?.tier as TierType) || 'free';
    const tierInfo = this.getTierInfo(tier);

    // Get today's start (midnight UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Get or create today's usage log
    const usageLog = await prisma.usageLog.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    const dailyUsed = usageLog?.analysisCount || 0;
    const dailyLimit = tierInfo.dailyLimit;
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

    // Calculate reset time (next midnight UTC)
    const resetAt = new Date(today);
    resetAt.setUTCDate(resetAt.getUTCDate() + 1);

    return {
      tier,
      tierName: tierInfo.name,
      dailyLimit,
      dailyUsed,
      dailyRemaining,
      percentUsed: dailyLimit === Infinity ? 0 : Math.round((dailyUsed / dailyLimit) * 100),
      canAnalyze: dailyUsed < dailyLimit,
      resetAt,
      maxTextLength: tierInfo.maxTextLength,
      features: [...tierInfo.features],
    };
  }

  /**
   * Check if user can perform an analysis
   */
  async canAnalyze(userId: string | undefined): Promise<{ allowed: boolean; reason?: string; usage?: UsageInfo }> {
    // Anonymous users get limited free tier
    if (!userId) {
      return { allowed: true }; // Allow anonymous, but track by IP in production
    }

    const usage = await this.getUserUsage(userId);

    if (!usage.canAnalyze) {
      return {
        allowed: false,
        reason: `Daily limit reached (${usage.dailyLimit} analyses). Upgrade to Pro for more!`,
        usage,
      };
    }

    return { allowed: true, usage };
  }

  /**
   * Increment user's daily usage count
   */
  async incrementUsage(userId: string): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    await prisma.usageLog.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        analysisCount: { increment: 1 },
      },
      create: {
        userId,
        date: today,
        analysisCount: 1,
      },
    });

    logger.info(`Usage incremented for user ${userId}`);
  }

  /**
   * Upgrade user to a new tier
   */
  async upgradeTier(userId: string, newTier: TierType, durationDays?: number): Promise<void> {
    const tierExpiresAt = durationDays
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

    await prisma.$transaction([
      // Update user tier
      prisma.user.update({
        where: { id: userId },
        data: {
          tier: newTier,
          tierExpiresAt,
        },
      }),
      // Create/update subscription record
      prisma.subscription.upsert({
        where: { userId },
        update: {
          tier: newTier,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: tierExpiresAt,
        },
        create: {
          userId,
          tier: newTier,
          status: 'active',
          currentPeriodEnd: tierExpiresAt,
        },
      }),
    ]);

    logger.info(`User ${userId} upgraded to ${newTier}`);
  }

  /**
   * Downgrade user to free tier
   */
  async downgradeTier(userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          tier: 'free',
          tierExpiresAt: null,
        },
      }),
      prisma.subscription.update({
        where: { userId },
        data: {
          tier: 'free',
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      }),
    ]);

    logger.info(`User ${userId} downgraded to free`);
  }

  /**
   * Generate API key for user (Pro and Enterprise only)
   * Returns the raw API key (only shown once) and stores the hash
   */
  async generateApiKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true },
    });

    if (!user || user.tier === 'free') {
      return null; // API keys only for paid tiers
    }

    // Generate a cryptographically secure API key
    const rawApiKey = `argus_${crypto.randomBytes(24).toString('base64url')}`;
    
    // Store only the hash
    const apiKeyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    await prisma.user.update({
      where: { id: userId },
      data: {
        apiKey: apiKeyHash, // Store hash, not raw key
        apiKeyCreatedAt: new Date(),
      },
    });

    // Return the raw key - this is the only time it's available
    return rawApiKey;
  }

  /**
   * Validate API key and get user (timing-safe)
   */
  async validateApiKey(apiKey: string) {
    // Hash the provided key
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Find user by hash
    const user = await prisma.user.findUnique({
      where: { apiKey: apiKeyHash },
      select: {
        id: true,
        email: true,
        tier: true,
      },
    });

    return user;
  }

  /**
   * Get usage history for a user (last N days)
   */
  async getUsageHistory(userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const logs = await prisma.usageLog.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    return logs.map((log) => ({
      date: log.date.toISOString().split('T')[0],
      count: log.analysisCount,
    }));
  }

  /**
   * Check and handle expired subscriptions
   */
  async checkExpiredSubscriptions(): Promise<number> {
    const now = new Date();

    const expiredUsers = await prisma.user.findMany({
      where: {
        tier: { not: 'free' },
        tierExpiresAt: { lt: now },
      },
    });

    for (const user of expiredUsers) {
      await this.downgradeTier(user.id);
      logger.info(`Subscription expired for user ${user.id}, downgraded to free`);
    }

    return expiredUsers.length;
  }
}

export const tierService = new TierService();
export default tierService;
