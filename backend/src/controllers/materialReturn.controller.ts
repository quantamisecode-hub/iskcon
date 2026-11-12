import type { NextFunction, Request, Response } from 'express';
import { materialReturnService } from '../services/materialReturn.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * MATERIAL RETURN CONTROLLER (Phase 7 extension).
 * - Only an EXECUTOR creates a return (service enforces role + event scope).
 * - Only an ADMIN accepts/rejects, and only within their own scope.
 * - Accept is the ONLY action that restocks inventory; submit/reject never do.
 * - Partial accept is allowed per item (0 rejects that line).
 */
export const materialReturnController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const query = res.locals['validatedQuery'] as {
        status?: string;
        completed?: 'true' | 'false';
        eventId?: string;
        search?: string;
        page: number;
        pageSize: number;
        sort: 'createdAt' | 'requestedAt' | 'status';
        order: 'asc' | 'desc';
      };
      const result = await materialReturnService.list(actor, query);
      sendSuccess(res, result, 'Material returns retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const materialReturn = await materialReturnService.getById(actor, id);
      sendSuccess(res, { return: materialReturn }, 'Material return retrieved');
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventId } = res.locals['validatedParams'] as { eventId: string };
      const body = req.body as {
        reason?: string | null;
        reasonNote?: string | null;
        notes?: string | null;
        items: Array<{ foodItemId: string; quantity: number; reason?: string | null }>;
      };
      const materialReturn = await materialReturnService.create(actor, eventId, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { return: materialReturn }, 'Material return submitted for review', 201);
    } catch (error) {
      next(error);
    }
  },

  async accept(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = (req.body ?? {}) as {
        items?: Array<{ itemId: string; acceptedQuantity: number }>;
      };
      const materialReturn = await materialReturnService.accept(actor, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { return: materialReturn }, 'Material return accepted');
    } catch (error) {
      next(error);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const { reason } = req.body as { reason: string };
      const materialReturn = await materialReturnService.reject(actor, id, reason, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { return: materialReturn }, 'Material return rejected');
    } catch (error) {
      next(error);
    }
  },

  /** Returnable lines for the "Return Materials" modal (live issued - returned). */
  async returnable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventId } = res.locals['validatedParams'] as { eventId: string };
      const result = await materialReturnService.returnableLines(actor, eventId);
      sendSuccess(res, result, 'Returnable materials retrieved');
    } catch (error) {
      next(error);
    }
  },
};
