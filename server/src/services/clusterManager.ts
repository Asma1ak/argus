import cluster from 'cluster';
import os from 'os';
import logger from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Cluster manager for horizontal scaling within a single server
 * Spawns worker processes based on CPU cores
 */
class ClusterManager {
  private workers = new Map<number, { pid: number; startedAt: Date }>();
  private isShuttingDown = false;
  private restartDelay = 1000;
  private maxRestarts = 10;
  private restartCounts = new Map<number, number>();

  /**
   * Get number of workers to spawn
   */
  private getWorkerCount(): number {
    const cpuCount = os.cpus().length;
    const configuredWorkers = config.cluster?.workers || 0;
    
    if (configuredWorkers > 0) {
      return Math.min(configuredWorkers, cpuCount);
    }
    
    // Default: leave one CPU for system
    return Math.max(1, cpuCount - 1);
  }

  /**
   * Check if clustering is enabled
   */
  isEnabled(): boolean {
    return config.cluster?.enabled === true && cluster.isPrimary;
  }

  /**
   * Check if this is the primary process
   */
  isPrimary(): boolean {
    return cluster.isPrimary;
  }

  /**
   * Check if this is a worker process
   */
  isWorker(): boolean {
    return cluster.isWorker;
  }

  /**
   * Get worker ID (or 0 for primary/single process)
   */
  getWorkerId(): number {
    return cluster.worker?.id || 0;
  }

  /**
   * Start the cluster
   */
  start(workerInit: () => void): void {
    if (!this.isEnabled()) {
      // Run in single process mode
      logger.info('Running in single process mode');
      workerInit();
      return;
    }

    if (cluster.isPrimary) {
      this.startPrimary();
    } else {
      workerInit();
    }
  }

  /**
   * Start the primary process
   */
  private startPrimary(): void {
    const workerCount = this.getWorkerCount();
    
    logger.info(`
╔══════════════════════════════════════════╗
║   Cluster Mode: Primary Process          ║
║   Workers: ${String(workerCount).padEnd(29)}║
║   CPUs: ${String(os.cpus().length).padEnd(32)}║
╚══════════════════════════════════════════╝
    `);

    // Fork workers
    for (let i = 0; i < workerCount; i++) {
      this.forkWorker();
    }

    // Handle worker events
    cluster.on('exit', (worker, code, signal) => {
      this.handleWorkerExit(worker, code, signal);
    });

    cluster.on('online', (worker) => {
      logger.info(`Worker ${worker.id} (PID: ${worker.process.pid}) is online`);
      this.workers.set(worker.id, {
        pid: worker.process.pid!,
        startedAt: new Date(),
      });
    });

    // Handle signals
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    // Health monitoring
    setInterval(() => this.monitorWorkers(), 30000);
  }

  /**
   * Fork a new worker
   */
  private forkWorker(): cluster.Worker {
    const worker = cluster.fork({
      ...process.env,
      WORKER_ID: String(cluster.workers ? Object.keys(cluster.workers).length + 1 : 1),
    });

    return worker;
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(worker: cluster.Worker, code: number, signal: string): void {
    this.workers.delete(worker.id);
    
    logger.warn(`Worker ${worker.id} died (code: ${code}, signal: ${signal})`);

    if (this.isShuttingDown) {
      logger.info('Shutdown in progress, not restarting worker');
      return;
    }

    // Track restart count
    const restarts = (this.restartCounts.get(worker.id) || 0) + 1;
    this.restartCounts.set(worker.id, restarts);

    if (restarts > this.maxRestarts) {
      logger.error(`Worker ${worker.id} exceeded max restarts (${this.maxRestarts}), not restarting`);
      return;
    }

    // Restart with delay
    setTimeout(() => {
      if (!this.isShuttingDown) {
        logger.info(`Restarting worker (attempt ${restarts}/${this.maxRestarts})`);
        this.forkWorker();
      }
    }, this.restartDelay * restarts);
  }

  /**
   * Monitor worker health
   */
  private monitorWorkers(): void {
    const workerCount = this.getWorkerCount();
    const currentCount = this.workers.size;

    if (currentCount < workerCount && !this.isShuttingDown) {
      logger.warn(`Only ${currentCount}/${workerCount} workers running, spawning more`);
      for (let i = currentCount; i < workerCount; i++) {
        this.forkWorker();
      }
    }

    // Reset restart counts periodically
    this.restartCounts.clear();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Initiating graceful shutdown of cluster...');

    // Send shutdown signal to all workers
    for (const id of this.workers.keys()) {
      const worker = cluster.workers?.[id];
      if (worker) {
        worker.send('shutdown');
        worker.disconnect();
      }
    }

    // Wait for workers to exit
    const timeout = 30000;
    const startTime = Date.now();

    while (this.workers.size > 0 && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      logger.info(`Waiting for ${this.workers.size} workers to exit...`);
    }

    // Force kill remaining workers
    if (this.workers.size > 0) {
      logger.warn(`Force killing ${this.workers.size} remaining workers`);
      for (const id of this.workers.keys()) {
        const worker = cluster.workers?.[id];
        if (worker) {
          worker.kill('SIGKILL');
        }
      }
    }

    logger.info('Cluster shutdown complete');
    process.exit(0);
  }

  /**
   * Send message to all workers
   */
  broadcast(message: unknown): void {
    if (!cluster.isPrimary) return;

    for (const id in cluster.workers) {
      cluster.workers[id]?.send(message);
    }
  }

  /**
   * Get cluster statistics
   */
  getStats(): {
    isPrimary: boolean;
    workerId: number;
    workers: { id: number; pid: number; uptime: number }[];
    cpus: number;
  } {
    const workers = Array.from(this.workers.entries()).map(([id, info]) => ({
      id,
      pid: info.pid,
      uptime: Date.now() - info.startedAt.getTime(),
    }));

    return {
      isPrimary: cluster.isPrimary,
      workerId: this.getWorkerId(),
      workers,
      cpus: os.cpus().length,
    };
  }
}

export const clusterManager = new ClusterManager();
export default clusterManager;
