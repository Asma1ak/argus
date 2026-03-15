import { PrismaClient } from '@prisma/client';
import config from './index.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Configure Prisma with connection pool settings
// Pool settings are configured via DATABASE_URL query params:
// ?connection_limit=10&pool_timeout=10
const prismaOptions = {
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] as const
    : ['error'] as const,
  // Connection pooling is handled by Prisma's connection string
  // For PostgreSQL: ?connection_limit=10&pool_timeout=10
  // For SQLite: Not applicable (single connection)
};

// Create Prisma client with middleware for metrics
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient(prismaOptions);

  // Add query timing middleware
  client.$use(async (params, next) => {
    const startTime = Date.now();
    
    try {
      const result = await next(params);
      const duration = Date.now() - startTime;
      
      // Log slow queries (> 100ms)
      if (duration > 100) {
        console.warn(`Slow query: ${params.model}.${params.action} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Query error: ${params.model}.${params.action} failed after ${duration}ms`);
      throw error;
    }
  });

  return client;
}

// Prevent multiple instances during hot reload in development
export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// Graceful disconnect
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
