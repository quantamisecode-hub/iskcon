import type { NextFunction, Request, Response } from 'express';
import { assignmentService } from '../services/assignment.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * ADMIN -> EXECUTOR ASSIGNMENT CONTROLLER.
 * The admin side of the assignment is ALWAYS the authenticated user.
 */
export const assignmentController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { activeOnly } = res.locals['validatedQuery'] as { activeOnly: boolean };
      const assignments = await assignmentService.listAssignments(actor, activeOnly);
      sendSuccess(res, { assignments }, 'Assignments retrieved');
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { executorId } = req.body as { executorId: string };
      const assignment = await assignmentService.createAssignment(actor, executorId, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { assignment }, 'Executor assigned', 201);
    } catch (error) {
      next(error);
    }
  },

  async end(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const params = res.locals['validatedParams'] as { id: string };
      const assignment = await assignmentService.endAssignment(actor, params.id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { assignment }, 'Assignment ended (history preserved)');
    } catch (error) {
      next(error);
    }
  },
};
