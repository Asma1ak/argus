import { EventEmitter } from 'events';
import os from 'os';
import logger from '../utils/logger.js';

/**
 * Metrics types
 */
interface Counter {
  value: number;
  labels: Record<string, string>;
}

interface Gauge {
  value: number;
  labels: Record<string, string>;
}

interface Histogram {
  count: number;
  sum: number;
  buckets: Map<number, number>;
  labels: Record<string, string>;
}

interface Timer {
  startTime: bigint;
  labels: Record<string, string>;
}

/**
 * Metrics service for application monitoring
 * Compatible with Prometheus exposition format
 */
class MetricsService extends EventEmitter {
  private counters = new Map<string, Counter[]>();
  private gauges = new Map<string, Gauge[]>();
  private histograms = new Map<string, Histogram[]>();
  private activeTimers = new Map<string, Timer>();
  
  // Default histogram buckets (in milliseconds)
  private defaultBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

  constructor() {
    super();
    this.startSystemMetrics();
  }

  /**
   * Increment a counter
   */
  incrementCounter(
    name: string, 
    value: number = 1, 
    labels: Record<string, string> = {}
  ): void {
    const counters = this.counters.get(name) || [];
    const existing = counters.find((c) => this.labelsMatch(c.labels, labels));
    
    if (existing) {
      existing.value += value;
    } else {
      counters.push({ value, labels });
    }
    
    this.counters.set(name, counters);
  }

  /**
   * Set a gauge value
   */
  setGauge(
    name: string, 
    value: number, 
    labels: Record<string, string> = {}
  ): void {
    const gauges = this.gauges.get(name) || [];
    const existing = gauges.find((g) => this.labelsMatch(g.labels, labels));
    
    if (existing) {
      existing.value = value;
    } else {
      gauges.push({ value, labels });
    }
    
    this.gauges.set(name, gauges);
  }

  /**
   * Record a histogram observation
   */
  observeHistogram(
    name: string, 
    value: number, 
    labels: Record<string, string> = {},
    buckets: number[] = this.defaultBuckets
  ): void {
    const histograms = this.histograms.get(name) || [];
    let histogram = histograms.find((h) => this.labelsMatch(h.labels, labels));
    
    if (!histogram) {
      histogram = {
        count: 0,
        sum: 0,
        buckets: new Map(buckets.map((b) => [b, 0])),
        labels,
      };
      histograms.push(histogram);
    }
    
    histogram.count++;
    histogram.sum += value;
    
    for (const bucket of buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }
    
    this.histograms.set(name, histograms);
  }

  /**
   * Start a timer (returns a function to stop it)
   */
  startTimer(
    name: string, 
    labels: Record<string, string> = {}
  ): () => number {
    const timerId = `${name}:${Date.now()}:${Math.random()}`;
    this.activeTimers.set(timerId, {
      startTime: process.hrtime.bigint(),
      labels,
    });

    return () => {
      const timer = this.activeTimers.get(timerId);
      if (timer) {
        const duration = Number(process.hrtime.bigint() - timer.startTime) / 1e6; // ms
        this.observeHistogram(name, duration, timer.labels);
        this.activeTimers.delete(timerId);
        return duration;
      }
      return 0;
    };
  }

  /**
   * Record request metrics middleware-style
   */
  recordRequest(
    method: string, 
    path: string, 
    statusCode: number, 
    durationMs: number
  ): void {
    const labels = { method, path: this.normalizePath(path), status: String(statusCode) };
    
    this.incrementCounter('http_requests_total', 1, labels);
    this.observeHistogram('http_request_duration_ms', durationMs, labels);
    
    if (statusCode >= 500) {
      this.incrementCounter('http_server_errors_total', 1, labels);
    } else if (statusCode >= 400) {
      this.incrementCounter('http_client_errors_total', 1, labels);
    }
  }

  /**
   * Get all metrics in Prometheus format
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, counters] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const counter of counters) {
        lines.push(`${name}${this.formatLabels(counter.labels)} ${counter.value}`);
      }
    }

    // Gauges
    for (const [name, gauges] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const gauge of gauges) {
        lines.push(`${name}${this.formatLabels(gauge.labels)} ${gauge.value}`);
      }
    }

    // Histograms
    for (const [name, histograms] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const histogram of histograms) {
        for (const [bucket, count] of histogram.buckets) {
          lines.push(`${name}_bucket${this.formatLabels({ ...histogram.labels, le: String(bucket) })} ${count}`);
        }
        lines.push(`${name}_bucket${this.formatLabels({ ...histogram.labels, le: '+Inf' })} ${histogram.count}`);
        lines.push(`${name}_sum${this.formatLabels(histogram.labels)} ${histogram.sum}`);
        lines.push(`${name}_count${this.formatLabels(histogram.labels)} ${histogram.count}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get metrics as JSON
   */
  getMetrics(): {
    counters: Record<string, Counter[]>;
    gauges: Record<string, Gauge[]>;
    histograms: Record<string, { count: number; sum: number; avg: number; labels: Record<string, string> }[]>;
  } {
    const histogramData: Record<string, { count: number; sum: number; avg: number; labels: Record<string, string> }[]> = {};
    
    for (const [name, histograms] of this.histograms) {
      histogramData[name] = histograms.map((h) => ({
        count: h.count,
        sum: h.sum,
        avg: h.count > 0 ? h.sum / h.count : 0,
        labels: h.labels,
      }));
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: histogramData,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Start collecting system metrics
   */
  private startSystemMetrics(): void {
    setInterval(() => {
      // Memory
      const memUsage = process.memoryUsage();
      this.setGauge('nodejs_heap_used_bytes', memUsage.heapUsed);
      this.setGauge('nodejs_heap_total_bytes', memUsage.heapTotal);
      this.setGauge('nodejs_rss_bytes', memUsage.rss);
      this.setGauge('nodejs_external_bytes', memUsage.external);

      // CPU
      const cpuUsage = process.cpuUsage();
      this.setGauge('nodejs_cpu_user_microseconds', cpuUsage.user);
      this.setGauge('nodejs_cpu_system_microseconds', cpuUsage.system);

      // Event loop lag (rough estimate)
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e6;
        this.setGauge('nodejs_eventloop_lag_ms', lag);
      });

      // OS metrics
      this.setGauge('os_load_1m', os.loadavg()[0]);
      this.setGauge('os_load_5m', os.loadavg()[1]);
      this.setGauge('os_load_15m', os.loadavg()[2]);
      this.setGauge('os_memory_free_bytes', os.freemem());
      this.setGauge('os_memory_total_bytes', os.totalmem());

      // Active handles/requests
      // @ts-ignore - These are available but not typed
      this.setGauge('nodejs_active_handles', process._getActiveHandles?.()?.length || 0);
      // @ts-ignore
      this.setGauge('nodejs_active_requests', process._getActiveRequests?.()?.length || 0);

    }, 15000); // Every 15 seconds
  }

  /**
   * Normalize path for metrics (remove IDs)
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\/[a-f0-9-]{36}/gi, '/:id') // UUID
      .replace(/\/c[a-z0-9]{24}/gi, '/:id') // CUID
      .replace(/\/[a-zA-Z0-9_-]{10,21}/g, '/:id') // nanoid
      .replace(/\/\d+/g, '/:id'); // Numeric ID
  }

  /**
   * Format labels for Prometheus
   */
  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    
    const formatted = entries
      .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
      .join(',');
    
    return `{${formatted}}`;
  }

  /**
   * Check if two label sets match
   */
  private labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every((key) => a[key] === b[key]);
  }
}

export const metrics = new MetricsService();
export default metrics;
