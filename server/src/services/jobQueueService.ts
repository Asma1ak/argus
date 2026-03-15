import { EventEmitter } from 'events';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { cache } from './redisCacheService.js';

/**
 * Job status enum
 */
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Job interface
 */
export interface Job<T = unknown, R = unknown> {
  id: string;
  type: string;
  data: T;
  status: JobStatus;
  result?: R;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  priority: number;
}

/**
 * Job handler type
 */
type JobHandler<T, R> = (data: T) => Promise<R>;

/**
 * Simple in-process job queue with Redis persistence
 * For production at scale, use BullMQ or similar
 */
class JobQueueService extends EventEmitter {
  private handlers = new Map<string, JobHandler<unknown, unknown>>();
  private processing = new Set<string>();
  private concurrency: number;
  private pollInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor() {
    super();
    this.concurrency = config.queue?.concurrency || 5;
  }

  /**
   * Start the queue processor
   */
  start(): void {
    if (this.pollInterval) return;

    logger.info(`Job queue started with concurrency: ${this.concurrency}`);
    
    this.pollInterval = setInterval(() => {
      this.processQueue().catch((err) => {
        logger.error('Queue processing error:', err);
      });
    }, 1000);

    // Process immediately on start
    this.processQueue().catch(() => {});
  }

  /**
   * Stop the queue processor
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for current jobs to complete
    const maxWait = 30000;
    const startTime = Date.now();
    
    while (this.processing.size > 0 && Date.now() - startTime < maxWait) {
      logger.info(`Waiting for ${this.processing.size} jobs to complete...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (this.processing.size > 0) {
      logger.warn(`Force stopping with ${this.processing.size} jobs still processing`);
    }
  }

  /**
   * Register a job handler
   */
  register<T, R>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler as JobHandler<unknown, unknown>);
    logger.info(`Registered job handler: ${type}`);
  }

  /**
   * Add a job to the queue
   */
  async add<T>(
    type: string,
    data: T,
    options: { priority?: number; maxAttempts?: number } = {}
  ): Promise<string> {
    const job: Job<T> = {
      id: crypto.randomUUID(),
      type,
      data,
      status: JobStatus.PENDING,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: Date.now(),
      priority: options.priority || 0,
    };

    // Store job in Redis/memory
    await cache.set(`job:${job.id}`, job, 86400); // 24 hour TTL
    
    // Add to queue
    await this.pushToQueue(job.id, job.priority);

    this.emit('job:added', job);
    logger.debug(`Job added: ${job.id} (${type})`);

    return job.id;
  }

  /**
   * Get job by ID
   */
  async getJob<T, R>(jobId: string): Promise<Job<T, R> | null> {
    return cache.get<Job<T, R>>(`job:${jobId}`);
  }

  /**
   * Wait for a job to complete
   */
  async waitForJob<R>(jobId: string, timeoutMs: number = 60000): Promise<R> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const job = await this.getJob<unknown, R>(jobId);
      
      if (!job) {
        throw new Error('Job not found');
      }

      if (job.status === JobStatus.COMPLETED) {
        return job.result as R;
      }

      if (job.status === JobStatus.FAILED) {
        throw new Error(job.error || 'Job failed');
      }

      // Poll every 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('Job timeout');
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isShuttingDown) return;
    if (this.processing.size >= this.concurrency) return;

    const jobId = await this.popFromQueue();
    if (!jobId) return;

    // Process job in background
    this.processJob(jobId).catch((err) => {
      logger.error(`Error processing job ${jobId}:`, err);
    });

    // Try to process more if we have capacity
    if (this.processing.size < this.concurrency) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Process a single job
   */
  private async processJob(jobId: string): Promise<void> {
    if (this.processing.has(jobId)) return;
    this.processing.add(jobId);

    try {
      const job = await this.getJob(jobId);
      if (!job) {
        logger.warn(`Job not found: ${jobId}`);
        return;
      }

      if (job.status !== JobStatus.PENDING) {
        return;
      }

      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler for job type: ${job.type}`);
      }

      // Update status to processing
      job.status = JobStatus.PROCESSING;
      job.startedAt = Date.now();
      job.attempts++;
      await cache.set(`job:${jobId}`, job, 86400);

      this.emit('job:started', job);
      logger.debug(`Processing job: ${jobId} (${job.type}), attempt ${job.attempts}`);

      // Execute handler
      const result = await handler(job.data);

      // Mark as completed
      job.status = JobStatus.COMPLETED;
      job.result = result;
      job.completedAt = Date.now();
      await cache.set(`job:${jobId}`, job, 3600); // Keep result for 1 hour

      this.emit('job:completed', job);
      logger.debug(`Job completed: ${jobId} in ${job.completedAt - job.startedAt!}ms`);

    } catch (error) {
      const job = await this.getJob(jobId);
      if (job) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (job.attempts < job.maxAttempts) {
          // Retry
          job.status = JobStatus.PENDING;
          job.error = errorMessage;
          await cache.set(`job:${jobId}`, job, 86400);
          
          // Re-queue with delay (exponential backoff)
          const delay = Math.pow(2, job.attempts) * 1000;
          setTimeout(() => this.pushToQueue(jobId, job.priority), delay);
          
          logger.warn(`Job ${jobId} failed, retrying in ${delay}ms (attempt ${job.attempts}/${job.maxAttempts})`);
        } else {
          // Mark as failed
          job.status = JobStatus.FAILED;
          job.error = errorMessage;
          job.completedAt = Date.now();
          await cache.set(`job:${jobId}`, job, 3600);

          this.emit('job:failed', job);
          logger.error(`Job failed permanently: ${jobId} - ${errorMessage}`);
        }
      }
    } finally {
      this.processing.delete(jobId);
    }
  }

  /**
   * Push job ID to queue (sorted by priority)
   */
  private async pushToQueue(jobId: string, priority: number): Promise<void> {
    const queueKey = 'job:queue';
    
    // Use Redis sorted set for priority queue
    const queue = (await cache.get<string[]>(queueKey)) || [];
    
    // Insert maintaining priority order (higher priority first)
    const item = `${priority}:${jobId}`;
    queue.push(item);
    queue.sort((a, b) => {
      const priorityA = parseInt(a.split(':')[0]);
      const priorityB = parseInt(b.split(':')[0]);
      return priorityB - priorityA;
    });

    await cache.set(queueKey, queue, 86400);
  }

  /**
   * Pop job ID from queue
   */
  private async popFromQueue(): Promise<string | null> {
    const queueKey = 'job:queue';
    
    // Acquire lock for thread safety
    const acquired = await cache.acquireLock('queue:pop', 5);
    if (!acquired) return null;

    try {
      const queue = (await cache.get<string[]>(queueKey)) || [];
      if (queue.length === 0) return null;

      const item = queue.shift();
      await cache.set(queueKey, queue, 86400);

      if (!item) return null;
      return item.split(':').slice(1).join(':');
    } finally {
      await cache.releaseLock('queue:pop');
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    handlers: string[];
  }> {
    const queue = (await cache.get<string[]>('job:queue')) || [];
    
    return {
      pending: queue.length,
      processing: this.processing.size,
      handlers: Array.from(this.handlers.keys()),
    };
  }
}

// Export singleton instance
export const jobQueue = new JobQueueService();
export default jobQueue;
