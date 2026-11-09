import { PrismaClient } from '@prisma/client';

/** Standalone Prisma client used ONLY by test setup/teardown scripts. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export default globalForPrisma.prisma ?? new PrismaClient();
