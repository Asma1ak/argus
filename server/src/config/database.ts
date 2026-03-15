import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create Prisma client with pg adapter
function createPrismaClient(): PrismaClient {
  // For production, use PostgreSQL with adapter
  if (connectionString) {
    const pool = new pg.Pool({ 
      connectionString,
      max: 10, // Connection pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaPg(pool as any);
    
    const client = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn']
        : ['error'],
    });

    return client;
  }

  // For development without DATABASE_URL, throw error
  throw new Error('DATABASE_URL is required. Set it in your .env file.');
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
