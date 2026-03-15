import crypto from 'crypto';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { AnalyticsEventInput, AnalyticsDashboard } from '../types/index.js';

class AnalyticsService {
  /**
   * Track an analytics event
   */
  async trackEvent(event: AnalyticsEventInput, context?: { userAgent?: string; ip?: string; referrer?: string; userId?: string }) {
    try {
      await prisma.analyticsEvent.create({
        data: {
          event: event.event,
          properties: event.properties ? JSON.stringify(event.properties) : null,
          analysisId: event.analysisId,
          sessionId: event.sessionId,
          userId: context?.userId,
          userAgent: context?.userAgent,
          ipHash: context?.ip ? this.hashIP(context.ip) : null,
          referrer: context?.referrer,
        },
      });
    } catch (error) {
      logger.error('Failed to track event:', error);
    }
  }

  /**
   * Get dashboard analytics
   */
  async getDashboard(days = 30): Promise<AnalyticsDashboard> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Overview stats
    const [totalAnalyses, totalUsers, recentAnalyses] = await Promise.all([
      prisma.analysis.count(),
      prisma.user.count(),
      prisma.analysis.findMany({
        where: { createdAt: { gte: startDate } },
        select: { score: true, issueCount: true, createdAt: true },
      }),
    ]);

    const avgScore = recentAnalyses.length > 0
      ? recentAnalyses.reduce((sum, a) => sum + a.score, 0) / recentAnalyses.length
      : 0;
    
    const avgIssueCount = recentAnalyses.length > 0
      ? recentAnalyses.reduce((sum, a) => sum + a.issueCount, 0) / recentAnalyses.length
      : 0;

    // Daily trends
    const dailyStats = await this.getDailyTrends(days);

    // Top issues
    const topIssues = await this.getTopIssues(startDate);

    // Score distribution
    const scoreDistribution = await this.getScoreDistribution(startDate);

    return {
      overview: {
        totalAnalyses,
        totalUsers,
        avgScore: Math.round(avgScore * 10) / 10,
        avgIssueCount: Math.round(avgIssueCount * 10) / 10,
      },
      trends: dailyStats,
      topIssues,
      scoreDistribution,
    };
  }

  /**
   * Get daily trends (optimized - single query instead of N queries)
   */
  private async getDailyTrends(days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Try to get from pre-aggregated table first
    const aggregatedData = await prisma.analyticsDaily.findMany({
      where: { date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    // Build a map of existing aggregated data
    const aggregatedMap = new Map<string, { analyses: number; users: number; avgScore: number }>();
    for (const row of aggregatedData) {
      const dateKey = row.date.toISOString().split('T')[0];
      aggregatedMap.set(dateKey, {
        analyses: row.totalAnalyses,
        users: row.newUsers,
        avgScore: Math.round(row.avgScore * 10) / 10,
      });
    }

    // Fill in any missing dates with live queries (only for recent days not yet aggregated)
    const trends: { date: string; analyses: number; users: number; avgScore: number }[] = [];
    
    // Get all analyses and users in date range in single queries
    const [allAnalyses, allUserCounts] = await Promise.all([
      prisma.analysis.findMany({
        where: { createdAt: { gte: startDate } },
        select: { score: true, createdAt: true },
      }),
      prisma.user.groupBy({
        by: ['createdAt'],
        where: { createdAt: { gte: startDate } },
        _count: true,
      }),
    ]);

    // Group analyses by date
    const analysesByDate = new Map<string, number[]>();
    for (const analysis of allAnalyses) {
      const dateKey = analysis.createdAt.toISOString().split('T')[0];
      if (!analysesByDate.has(dateKey)) {
        analysesByDate.set(dateKey, []);
      }
      analysesByDate.get(dateKey)!.push(analysis.score);
    }

    // Count users by date
    const usersByDate = new Map<string, number>();
    for (const row of allUserCounts) {
      const dateKey = row.createdAt.toISOString().split('T')[0];
      usersByDate.set(dateKey, (usersByDate.get(dateKey) || 0) + row._count);
    }

    // Build trends array
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.toISOString().split('T')[0];

      // Use aggregated data if available, otherwise compute from live data
      if (aggregatedMap.has(dateKey)) {
        const agg = aggregatedMap.get(dateKey)!;
        trends.push({
          date: dateKey,
          analyses: agg.analyses,
          users: agg.users,
          avgScore: agg.avgScore,
        });
      } else {
        const scores = analysesByDate.get(dateKey) || [];
        const avgScore = scores.length > 0
          ? scores.reduce((sum, s) => sum + s, 0) / scores.length
          : 0;

        trends.push({
          date: dateKey,
          analyses: scores.length,
          users: usersByDate.get(dateKey) || 0,
          avgScore: Math.round(avgScore * 10) / 10,
        });
      }
    }

    return trends;
  }

  /**
   * Get top issues
   */
  private async getTopIssues(since: Date) {
    const analyses = await prisma.analysis.findMany({
      where: { createdAt: { gte: since } },
      select: { issues: true },
    });

    const issueCounts: Record<string, { name: string; type: string; count: number }> = {};

    for (const analysis of analyses) {
      const issues = JSON.parse(analysis.issues) as Array<{ name: string; type: string }>;
      for (const issue of issues) {
        const key = `${issue.type}:${issue.name}`;
        if (!issueCounts[key]) {
          issueCounts[key] = { name: issue.name, type: issue.type, count: 0 };
        }
        issueCounts[key].count++;
      }
    }

    return Object.values(issueCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(i => ({
        name: i.name,
        type: i.type as 'fallacy' | 'bias' | 'heuristic' | 'manipulation',
        count: i.count,
      }));
  }

  /**
   * Get score distribution
   */
  private async getScoreDistribution(since: Date) {
    const analyses = await prisma.analysis.findMany({
      where: { createdAt: { gte: since } },
      select: { score: true },
    });

    const ranges = [
      { range: '0-20', min: 0, max: 20, count: 0 },
      { range: '21-40', min: 21, max: 40, count: 0 },
      { range: '41-60', min: 41, max: 60, count: 0 },
      { range: '61-80', min: 61, max: 80, count: 0 },
      { range: '81-100', min: 81, max: 100, count: 0 },
    ];

    for (const analysis of analyses) {
      const range = ranges.find(r => analysis.score >= r.min && analysis.score <= r.max);
      if (range) range.count++;
    }

    return ranges.map(r => ({ range: r.range, count: r.count }));
  }

  /**
   * Hash IP for privacy
   */
  private hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  }

  /**
   * Aggregate daily stats (run via cron)
   */
  async aggregateDaily() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const [analyses, newUsers] = await Promise.all([
      prisma.analysis.findMany({
        where: { createdAt: { gte: yesterday, lt: today } },
        select: { score: true, issueCount: true, textLength: true, issues: true },
      }),
      prisma.user.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
    ]);

    const totalUsers = await prisma.user.count();

    // Calculate issue breakdown
    const issueBreakdown: Record<string, number> = {};
    for (const a of analyses) {
      const issues = JSON.parse(a.issues) as Array<{ type: string }>;
      for (const i of issues) {
        issueBreakdown[i.type] = (issueBreakdown[i.type] || 0) + 1;
      }
    }

    await prisma.analyticsDaily.upsert({
      where: { date: yesterday },
      update: {
        totalAnalyses: analyses.length,
        totalUsers,
        newUsers,
        avgScore: analyses.length > 0 ? analyses.reduce((s, a) => s + a.score, 0) / analyses.length : 0,
        avgIssueCount: analyses.length > 0 ? analyses.reduce((s, a) => s + a.issueCount, 0) / analyses.length : 0,
        avgTextLength: analyses.length > 0 ? analyses.reduce((s, a) => s + a.textLength, 0) / analyses.length : 0,
        issueBreakdown: JSON.stringify(issueBreakdown),
      },
      create: {
        date: yesterday,
        totalAnalyses: analyses.length,
        totalUsers,
        newUsers,
        avgScore: analyses.length > 0 ? analyses.reduce((s, a) => s + a.score, 0) / analyses.length : 0,
        avgIssueCount: analyses.length > 0 ? analyses.reduce((s, a) => s + a.issueCount, 0) / analyses.length : 0,
        avgTextLength: analyses.length > 0 ? analyses.reduce((s, a) => s + a.textLength, 0) / analyses.length : 0,
        issueBreakdown: JSON.stringify(issueBreakdown),
      },
    });

    logger.info(`Aggregated daily stats for ${yesterday.toISOString().split('T')[0]}`);
  }
}

export default new AnalyticsService();
