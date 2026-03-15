import { Response } from 'express';
import analysisService from '../services/analysisService.js';
import exportService from '../services/exportService.js';
import analyticsService from '../services/analyticsService.js';
import tierService from '../services/tierService.js';
import urlExtractorService from '../services/urlExtractorService.js';
import { sendSuccess, Errors } from '../utils/apiResponse.js';
import { AuthRequest } from '../types/index.js';
import logger from '../utils/logger.js';

export const analysisController = {
  async analyze(req: AuthRequest, res: Response) {
    const { text, language = 'auto' } = req.body;
    const userId = req.user?.userId;

    // Check tier limits for authenticated users
    if (userId) {
      const { allowed, reason, usage } = await tierService.canAnalyze(userId);
      
      if (!allowed) {
        throw Errors.TooManyRequests(reason || 'Daily limit reached');
      }

      // Check text length against tier limit
      if (usage && text.length > usage.maxTextLength) {
        throw Errors.BadRequest(
          `Text too long. Your ${usage.tierName} plan allows up to ${usage.maxTextLength.toLocaleString()} characters. ` +
          `Upgrade to Pro for up to 10,000 characters.`
        );
      }
    }

    logger.info('Analysis request', { textLength: text.length, userId, language });

    const result = await analysisService.analyzeText(text, userId, language);

    // Increment usage counter for authenticated users
    if (userId) {
      await tierService.incrementUsage(userId);
    }

    // Track event
    await analyticsService.trackEvent(
      { event: 'analysis_created', analysisId: result.id, properties: { score: result.score, issueCount: result.issues.length, language } },
      { userId, userAgent: req.headers['user-agent'] }
    );

    // Include usage info in response
    const usage = userId ? await tierService.getUserUsage(userId) : null;

    return sendSuccess(res, { ...result, usage });
  },

  async analyzeUrl(req: AuthRequest, res: Response) {
    const { url, language = 'auto' } = req.body;
    const userId = req.user?.userId;

    // Check tier limits for authenticated users
    if (userId) {
      const { allowed, reason, usage } = await tierService.canAnalyze(userId);
      
      if (!allowed) {
        throw Errors.TooManyRequests(reason || 'Daily limit reached');
      }
    }

    logger.info('URL analysis request', { url, userId, language });

    // Extract content from URL
    const extracted = await urlExtractorService.extract(url);

    // Check text length against tier limit
    if (userId) {
      const usage = await tierService.getUserUsage(userId);
      if (extracted.content.length > usage.maxTextLength) {
        throw Errors.BadRequest(
          `Extracted content too long (${extracted.content.length.toLocaleString()} chars). ` +
          `Your ${usage.tierName} plan allows up to ${usage.maxTextLength.toLocaleString()} characters. ` +
          `Upgrade for higher limits.`
        );
      }
    }

    // Analyze the extracted content
    const result = await analysisService.analyzeText(extracted.content, userId, language);

    // Increment usage counter for authenticated users
    if (userId) {
      await tierService.incrementUsage(userId);
    }

    // Track event
    await analyticsService.trackEvent(
      { event: 'url_analysis_created', analysisId: result.id, properties: { 
        url: extracted.url,
        siteName: extracted.siteName,
        wordCount: extracted.wordCount,
        score: result.score, 
        issueCount: result.issues.length, 
        language 
      }},
      { userId, userAgent: req.headers['user-agent'] }
    );

    // Include usage info and source metadata in response
    const usage = userId ? await tierService.getUserUsage(userId) : null;

    return sendSuccess(res, { 
      ...result, 
      usage,
      source: {
        url: extracted.url,
        title: extracted.title,
        description: extracted.description,
        author: extracted.author,
        publishedDate: extracted.publishedDate,
        siteName: extracted.siteName,
        wordCount: extracted.wordCount,
        extractedAt: extracted.extractedAt,
      }
    });
  },

  async extractUrl(req: AuthRequest, res: Response) {
    const { url } = req.body;

    logger.info('URL extraction request', { url });

    const extracted = await urlExtractorService.extract(url);

    return sendSuccess(res, { extracted });
  },

  async getLanguages(_req: AuthRequest, res: Response) {
    const languages = analysisService.getSupportedLanguages();
    return sendSuccess(res, { languages });
  },

  async getById(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user?.userId;

    const result = await analysisService.getById(id, userId);

    if (!result) {
      throw Errors.NotFound('Analysis not found');
    }

    return sendSuccess(res, result);
  },

  async getByShareId(req: AuthRequest, res: Response) {
    const { shareId } = req.params;

    const result = await analysisService.getByShareId(shareId);

    if (!result) {
      throw Errors.NotFound('Shared analysis not found');
    }

    // Track share view
    await analyticsService.trackEvent(
      { event: 'analysis_shared', analysisId: result.id },
      { userAgent: req.headers['user-agent'] }
    );

    return sendSuccess(res, result);
  },

  async getHistory(req: AuthRequest, res: Response) {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await analysisService.getUserHistory(userId, limit, offset);

    return sendSuccess(res, result);
  },

  async delete(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user!.userId;

    const deleted = await analysisService.delete(id, userId);

    if (!deleted) {
      throw Errors.NotFound('Analysis not found');
    }

    return sendSuccess(res, { deleted: true });
  },

  async exportAnalysis(req: AuthRequest, res: Response) {
    const format = (req.query.format as string) || 'json';
    
    // Get analysis info from download token context
    const downloadContext = req.downloadContext;
    if (!downloadContext) {
      throw Errors.Unauthorized('Invalid download token');
    }
    
    const { analysisId, userId } = downloadContext;

    // Get analysis - use the ID from the download token for security
    let analysis = await analysisService.getById(analysisId, userId);
    
    // If not found by ID, try as shareId (for public shared analyses)
    if (!analysis) {
      analysis = await analysisService.getByShareId(analysisId);
    }

    if (!analysis) {
      throw Errors.NotFound('Analysis not found');
    }

    // Track export
    await analyticsService.trackEvent(
      { event: 'analysis_exported', analysisId: analysis.id, properties: { format } },
      { userId, userAgent: req.headers['user-agent'] }
    );

    if (format === 'pdf') {
      const pdf = await exportService.exportToPDF(analysis);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="argus-analysis-${analysis.id}.pdf"`);
      return res.send(pdf);
    }

    // JSON
    const json = exportService.exportToJSON(analysis);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="argus-analysis-${analysis.id}.json"`);
    return res.send(json);
  },

  async getExamples(_req: AuthRequest, res: Response) {
    const examples = [
      { id: 1, title: 'Bandwagon Fallacy', text: 'Everyone is switching to this new diet, so it must be the healthiest option. Over 10 million people can\'t be wrong!' },
      { id: 2, title: 'Ad Hominem', text: 'You can\'t trust his research on climate change because he drives an SUV and flies on private jets.' },
      { id: 3, title: 'False Dichotomy', text: 'You\'re either with us or against us. There\'s no middle ground on this issue.' },
      { id: 4, title: 'Appeal to Fear', text: 'If we don\'t act now, our entire economy will collapse within months. Every day we wait brings us closer to total disaster.' },
    ];

    return sendSuccess(res, { examples });
  },
};

export default analysisController;
