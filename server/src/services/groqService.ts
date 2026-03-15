import Groq from 'groq-sdk';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { circuitBreakers, CircuitBreakerError } from './circuitBreaker.js';
import { metrics } from './metricsService.js';

// Retry configuration
const MAX_RETRIES = config.groq.maxRetries || 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff
const REQUEST_TIMEOUT = config.groq.timeout || 30000;

class GroqService {
  private client: Groq;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private circuitBreaker = circuitBreakers.groq;

  constructor() {
    this.client = new Groq({
      apiKey: config.groq.apiKey,
      timeout: REQUEST_TIMEOUT,
    });
    this.model = config.groq.model;
    this.maxTokens = config.groq.maxTokens;
    this.temperature = config.groq.temperature;
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof CircuitBreakerError) {
      return false; // Don't retry circuit breaker errors
    }
    
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('500') ||
        message.includes('econnreset') ||
        message.includes('socket hang up')
      );
    }
    return false;
  }

  async complete(
    systemPrompt: string, 
    userPrompt: string, 
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<Record<string, unknown>> {
    const stopTimer = metrics.startTimer('groq_request_duration_ms');
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Execute with circuit breaker protection
        const result = await this.circuitBreaker.execute(async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

          try {
            const completion = await this.client.chat.completions.create({
              model: options.model || this.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: options.temperature ?? this.temperature,
              max_tokens: options.maxTokens || this.maxTokens,
              response_format: { type: 'json_object' },
            });

            clearTimeout(timeoutId);
            return completion;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        });

        const duration = stopTimer();
        metrics.incrementCounter('groq_requests_total', 1, { status: 'success' });
        logger.debug(`Groq completion took ${duration.toFixed(0)}ms (attempt ${attempt + 1})`);

        const content = result.choices[0]?.message?.content;
        
        if (!content) {
          throw new Error('Empty response from Groq API');
        }

        // Track token usage
        if (result.usage) {
          metrics.incrementCounter('groq_tokens_total', result.usage.total_tokens, { type: 'total' });
          metrics.incrementCounter('groq_tokens_total', result.usage.prompt_tokens, { type: 'prompt' });
          metrics.incrementCounter('groq_tokens_total', result.usage.completion_tokens, { type: 'completion' });
        }

        // Validate JSON before returning
        try {
          return JSON.parse(content);
        } catch (parseError) {
          logger.error('Invalid JSON from Groq API:', { content: content.slice(0, 200) });
          throw new Error('Invalid JSON response from AI');
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry circuit breaker errors
        if (error instanceof CircuitBreakerError) {
          metrics.incrementCounter('groq_requests_total', 1, { status: 'circuit_open' });
          throw new Error('AI service temporarily unavailable. Please try again shortly.');
        }

        logger.warn(`Groq API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, {
          message: lastError.message,
          attempt: attempt + 1,
        });

        metrics.incrementCounter('groq_requests_total', 1, { status: 'error' });

        if (attempt < MAX_RETRIES && this.isRetryableError(error)) {
          const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        break;
      }
    }

    stopTimer();
    logger.error('Groq API error after all retries:', lastError);
    
    if (lastError?.message?.includes('API key')) {
      throw new Error('Invalid Groq API key configuration');
    }
    if (lastError?.message?.includes('rate limit')) {
      throw new Error('AI service is busy. Please try again in a moment.');
    }
    if (lastError?.message?.includes('timeout') || lastError?.message?.includes('abort')) {
      throw new Error('AI service timeout. Please try again.');
    }

    throw lastError || new Error('Unknown error from AI service');
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Don't use circuit breaker for health checks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });

      clearTimeout(timeoutId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitStatus() {
    return this.circuitBreaker.getStats();
  }
}

export default new GroqService();
