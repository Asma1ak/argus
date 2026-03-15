import { jobQueue, JobStatus } from './jobQueueService.js';
import analysisService from './analysisService.js';
import { cache } from './redisCacheService.js';
import logger from '../utils/logger.js';
import { metrics } from './metricsService.js';

/**
 * Async analysis job data
 */
interface AnalysisJobData {
  text: string;
  userId?: string;
  language?: string;
  requestId?: string;
}

/**
 * Async analysis result
 */
interface AnalysisJobResult {
  analysisId: string;
  score: number;
  issueCount: number;
}

/**
 * Async analysis service for handling high load
 * Offloads analysis to background workers
 */
class AsyncAnalysisService {
  private initialized = false;

  /**
   * Initialize the async analysis handler
   */
  initialize(): void {
    if (this.initialized) return;

    // Register job handler
    jobQueue.register<AnalysisJobData, AnalysisJobResult>(
      'analysis',
      async (data) => {
        const stopTimer = metrics.startTimer('async_analysis_duration_ms');
        
        try {
          logger.info(`Processing async analysis job`, { requestId: data.requestId });
          
          const result = await analysisService.analyzeText(
            data.text,
            data.userId,
            data.language
          );

          stopTimer();
          metrics.incrementCounter('async_analysis_completed', 1);

          return {
            analysisId: result.id,
            score: result.score,
            issueCount: result.issues.length,
          };
        } catch (error) {
          stopTimer();
          metrics.incrementCounter('async_analysis_failed', 1);
          throw error;
        }
      }
    );

    // Listen for job events
    jobQueue.on('job:completed', (job) => {
      if (job.type === 'analysis') {
        logger.info(`Analysis job completed: ${job.id}`);
      }
    });

    jobQueue.on('job:failed', (job) => {
      if (job.type === 'analysis') {
        logger.error(`Analysis job failed: ${job.id}`, { error: job.error });
      }
    });

    this.initialized = true;
    logger.info('Async analysis service initialized');
  }

  /**
   * Queue an analysis for async processing
   * Returns a job ID that can be polled for status
   */
  async queueAnalysis(
    text: string,
    userId?: string,
    language?: string,
    requestId?: string
  ): Promise<string> {
    const jobId = await jobQueue.add<AnalysisJobData>(
      'analysis',
      { text, userId, language, requestId },
      { priority: userId ? 1 : 0 } // Authenticated users get higher priority
    );

    metrics.incrementCounter('async_analysis_queued', 1);
    logger.info(`Queued async analysis: ${jobId}`);

    return jobId;
  }

  /**
   * Get analysis job status
   */
  async getJobStatus(jobId: string): Promise<{
    status: JobStatus;
    result?: AnalysisJobResult;
    error?: string;
    progress?: number;
  }> {
    const job = await jobQueue.getJob<AnalysisJobData, AnalysisJobResult>(jobId);
    
    if (!job) {
      return { status: JobStatus.FAILED, error: 'Job not found' };
    }

    let progress = 0;
    switch (job.status) {
      case JobStatus.PENDING:
        progress = 0;
        break;
      case JobStatus.PROCESSING:
        progress = 50;
        break;
      case JobStatus.COMPLETED:
        progress = 100;
        break;
      case JobStatus.FAILED:
        progress = 0;
        break;
    }

    return {
      status: job.status,
      result: job.result,
      error: job.error,
      progress,
    };
  }

  /**
   * Wait for analysis to complete (with timeout)
   */
  async waitForResult(jobId: string, timeoutMs = 60000): Promise<AnalysisJobResult> {
    return jobQueue.waitForJob<AnalysisJobResult>(jobId, timeoutMs);
  }

  /**
   * Estimate wait time based on queue length
   */
  async estimateWaitTime(): Promise<number> {
    const stats = await jobQueue.getStats();
    // Rough estimate: 5 seconds per pending job
    return stats.pending * 5000;
  }
}

export const asyncAnalysisService = new AsyncAnalysisService();
export default asyncAnalysisService;
