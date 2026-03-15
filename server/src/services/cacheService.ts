/**
 * Cache Service - Re-exports from Redis cache service
 * 
 * This file exists for backward compatibility.
 * The actual implementation is now in redisCacheService.ts
 * which supports distributed caching via Redis with in-memory fallback.
 */

import cache, { 
  analysisCache, 
  userCache, 
  tierCache 
} from './redisCacheService.js';

export { analysisCache, userCache, tierCache };
export default cache;
