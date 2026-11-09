import { PrismaClient } from '@prisma/client';

/**
 * Prisma client for test setup/teardown scripts.
 * LAZY construction: the instance is created on first use, so it always
 * reads the DATABASE_URL that is already active at that moment (tests
 * point it at the dedicated test database first).
 */
let client: PrismaClient | null = null;

export default function getTestClient(): PrismaClient {
  client = client ?? new PrismaClient();
  return client;
}
