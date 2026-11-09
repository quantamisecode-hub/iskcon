import { healthRepository } from '../repositories/health.repository.js';

/**
 * SERVICE LAYER - business logic lives here.
 * Controllers call services; services call repositories.
 */
export interface DatabaseHealth {
  database: 'up' | 'down';
}

export const healthService = {
  getOverallHealth(): { status: 'healthy' } {
    // No environment details or versions are exposed.
    return { status: 'healthy' };
  },

  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const connected = await healthRepository.checkDatabaseConnectivity();
    return { database: connected ? 'up' : 'down' };
  },
};
