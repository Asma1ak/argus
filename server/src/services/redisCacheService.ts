import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Redis-based cache service for distributed caching
 * Falls back to in-memory cache if Redis is unavailable
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// In-memory fallback cache
const memoryCache = new Map<string, CacheEntry<unknown>>();

class RedisCacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private stats = { hits: 0, misses: 0, errors: 0 };

  async connect(): Promise<void> {
    if (!config.redis?.url) {
      logger.info('Redis URL not configured, using in-memory cache');
      return;
    }

    try {
      this.client = createClient({
        url: config.redis.url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > this.maxReconnectAttempts) {
              logger.error('Redis max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err) => {
        logger.error('Redis error:', err.message);
        this.stats.errors++;
      });

      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.client = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Try Redis first
      if (this.client && this.isConnected) {
        const data = await this.client.get(key);
        if (data) {
          this.stats.hits++;
          return JSON.parse(data) as T;
        }
        this.stats.misses++;
        return null;
      }

      // Fallback to memory cache
      const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
      if (entry && Date.now() < entry.expiresAt) {
        this.stats.hits++;
        return entry.value;
      }
      
      if (entry) {
        memoryCache.delete(key);
      }
      this.stats.misses++;
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      // Try Redis first
      if (this.client && this.isConnected) {
        await this.client.setEx(key, ttlSeconds, serialized);
        return;
      }

      // Fallback to memory cache
      memoryCache.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });

      // Limit memory cache size
      if (memoryCache.size > 10000) {
        const firstKey = memoryCache.keys().next().value;
        if (firstKey) memoryCache.delete(firstKey);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
      this.stats.errors++;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.del(key);
      }
      memoryCache.delete(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      if (this.client && this.isConnected) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
        return keys.length;
      }

      // Memory cache pattern delete
      let deleted = 0;
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      for (const key of memoryCache.keys()) {
        if (regex.test(key)) {
          memoryCache.delete(key);
          deleted++;
        }
      }
      return deleted;
    } catch (error) {
      logger.error('Cache deletePattern error:', error);
      return 0;
    }
  }

  /**
   * Increment a counter (for rate limiting)
   */
  async increment(key: string, ttlSeconds: number = 60): Promise<number> {
    try {
      if (this.client && this.isConnected) {
        const result = await this.client.incr(key);
        if (result === 1) {
          await this.client.expire(key, ttlSeconds);
        }
        return result;
      }

      // Memory fallback
      const entry = memoryCache.get(key) as CacheEntry<number> | undefined;
      const current = entry && Date.now() < entry.expiresAt ? entry.value : 0;
      const newValue = current + 1;
      memoryCache.set(key, {
        value: newValue,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return newValue;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Acquire a distributed lock
   */
  async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    const lockKey = `lock:${key}`;
    try {
      if (this.client && this.isConnected) {
        const result = await this.client.set(lockKey, '1', {
          NX: true,
          EX: ttlSeconds,
        });
        return result === 'OK';
      }

      // Memory fallback
      const entry = memoryCache.get(lockKey);
      if (entry && Date.now() < (entry as CacheEntry<string>).expiresAt) {
        return false;
      }
      memoryCache.set(lockKey, {
        value: '1',
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return true;
    } catch (error) {
      logger.error('Lock acquire error:', error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(key: string): Promise<void> {
    await this.delete(`lock:${key}`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      isRedisConnected: this.isConnected,
      memoryEntries: memoryCache.size,
    };
  }

  /**
   * Check if Redis is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) return true; // Using memory cache
    
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const cache = new RedisCacheService();

// Convenience cache instances with different prefixes
export const analysisCache = {
  get: <T>(key: string) => cache.get<T>(`analysis:${key}`),
  set: <T>(key: string, value: T, ttl = 86400) => cache.set(`analysis:${key}`, value, ttl),
  delete: (key: string) => cache.delete(`analysis:${key}`),
  getStats: () => cache.getStats(),
};

export const userCache = {
  get: <T>(key: string) => cache.get<T>(`user:${key}`),
  set: <T>(key: string, value: T, ttl = 300) => cache.set(`user:${key}`, value, ttl),
  delete: (key: string) => cache.delete(`user:${key}`),
};

export const tierCache = {
  get: <T>(key: string) => cache.get<T>(`tier:${key}`),
  set: <T>(key: string, value: T, ttl = 60) => cache.set(`tier:${key}`, value, ttl),
  delete: (key: string) => cache.delete(`tier:${key}`),
};

export default cache;
