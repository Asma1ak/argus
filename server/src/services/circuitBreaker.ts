import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { metrics } from './metricsService.js';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, reject requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;      // Failures before opening
  successThreshold?: number;      // Successes to close from half-open
  timeout?: number;               // Time in OPEN state before trying again (ms)
  resetTimeout?: number;          // Time to reset failure count (ms)
  monitorInterval?: number;       // Health check interval (ms)
}

/**
 * Circuit breaker for external service calls
 * Prevents cascading failures by failing fast when a service is down
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly resetTimeout: number;

  constructor(options: CircuitBreakerOptions) {
    super();
    this.name = options.name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;
    this.resetTimeout = options.resetTimeout || 60000;

    // Start monitoring
    if (options.monitorInterval) {
      setInterval(() => this.monitor(), options.monitorInterval);
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        metrics.incrementCounter('circuit_breaker_rejected', 1, { name: this.name });
        throw new CircuitBreakerError(`Circuit breaker ${this.name} is OPEN`);
      }
      
      // Transition to half-open
      this.setState(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful call
   */
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.successThreshold) {
        this.setState(CircuitState.CLOSED);
        this.successes = 0;
      }
    }

    metrics.incrementCounter('circuit_breaker_success', 1, { name: this.name });
  }

  /**
   * Handle failed call
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    metrics.incrementCounter('circuit_breaker_failure', 1, { name: this.name });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.setState(CircuitState.OPEN);
    } else if (this.failures >= this.failureThreshold) {
      this.setState(CircuitState.OPEN);
    }

    logger.warn(`Circuit breaker ${this.name} failure:`, {
      failures: this.failures,
      state: this.state,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  /**
   * Set circuit state
   */
  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.timeout;
    }

    metrics.setGauge('circuit_breaker_state', this.stateToNumber(newState), { name: this.name });

    logger.info(`Circuit breaker ${this.name}: ${oldState} -> ${newState}`);
    this.emit('stateChange', { name: this.name, from: oldState, to: newState });
  }

  /**
   * Convert state to numeric value for metrics
   */
  private stateToNumber(state: CircuitState): number {
    switch (state) {
      case CircuitState.CLOSED: return 0;
      case CircuitState.HALF_OPEN: return 1;
      case CircuitState.OPEN: return 2;
    }
  }

  /**
   * Monitor and auto-reset if no failures for a while
   */
  private monitor(): void {
    if (this.state === CircuitState.CLOSED && this.failures > 0) {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.failures = 0;
        logger.debug(`Circuit breaker ${this.name}: Reset failure count`);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get stats
   */
  getStats(): {
    name: string;
    state: CircuitState;
    failures: number;
    successes: number;
    nextAttemptTime: number | null;
  } {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttemptTime: this.state === CircuitState.OPEN ? this.nextAttemptTime : null,
    };
  }

  /**
   * Force circuit to close (for admin/testing)
   */
  forceClose(): void {
    this.failures = 0;
    this.successes = 0;
    this.setState(CircuitState.CLOSED);
  }

  /**
   * Force circuit to open (for maintenance)
   */
  forceOpen(): void {
    this.setState(CircuitState.OPEN);
  }
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// Pre-configured circuit breakers for common services
export const circuitBreakers = {
  groq: new CircuitBreaker({
    name: 'groq-api',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
    monitorInterval: 10000,
  }),
};

export default CircuitBreaker;
