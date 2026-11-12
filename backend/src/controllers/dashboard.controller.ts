import type { NextFunction, Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * DASHBOARD CONTROLLER — read-only operational summary.
 * Scope + authorization are enforced inside dashboardService.
 */
export const dashboardController = {
  async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const result = await dashboardService.summary(actor);
      sendSuccess(res, result, 'Dashboard summary');
    } catch (error) {
      next(error);
    }
  },
};
