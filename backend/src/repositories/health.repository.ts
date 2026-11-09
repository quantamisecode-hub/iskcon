import { prisma, pingDatabase } from '../config/database.js';

/**
 * REPOSITORY LAYER - the only place health status touches the database.
 * Controllers never run database queries directly.
 *
 * NOTE for later phases: inventory operations that must be atomic
 * (approve request -> issue material -> deduct stock -> notify -> audit)
 * will be implemented here with prisma.$transaction (see docs/architecture.md).
 */
export const healthRepository = {
  async checkDatabaseConnectivity(): Promise<boolean> {
    return pingDatabase();
  },

  /** Exposed so future phases reuse the same client (never new PrismaClient()). */
  get client() {
    return prisma;
  },
};
