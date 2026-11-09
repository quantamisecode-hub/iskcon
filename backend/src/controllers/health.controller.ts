import type { NextFunction, Request, Response } from 'express';
import { healthService } from '../services/health.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ApiError } from '../middleware/error.middleware.js';

/**
 * CONTROLLER LAYER - translates HTTP to service calls.
 * No business logic and no database access here.
 */
export const healthController = {
  /** GET /api/v1/health - public liveness probe. */
  check(_req: Request, res: Response, next: NextFunction): void {
    try {
      const status = healthService.getOverallHealth();
      sendSuccess(res, status, 'API is healthy');
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/health/db - INTERNAL probe (protect with authentication
   * once available). Reports only up/down - never connection details.
   */
  async checkDatabase(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const health = await healthService.getDatabaseHealth();
      if (health.database === 'down') {
        next(
          new ApiError({
            statusCode: 503,
            code: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: 'Database is not reachable.',
          }),
        );
        return;
      }
      sendSuccess(res, health, 'Database is reachable');
    } catch (error) {
      next(error);
    }
  },
};
