import { PrismaClient, type Prisma } from '@prisma/client';
import { env } from './env.js';

/**
 * SINGLE PrismaClient instance for the entire backend.
 * One client is created per process (never per request) and is reused
 * in development across hot reloads by caching it on `globalThis`.
 * All future database access goes through this export only.
 */
const prismaLogLevels: Prisma.LogLevel[] =
  env.NODE_ENV === 'production' ? ['error'] : ['info', 'warn', 'error'];

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLogLevels,
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Light connectivity check used by the internal database health endpoint.
 * Returns only true/false - never leaks connection details.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.warn(`Database ping failed: ${error instanceof Error ? error.name : 'unknown error'}`);
    return false;
  }
}

/** Cleanly close the connection at shutdown. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
