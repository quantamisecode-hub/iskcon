import type { NextFunction, Request, Response } from 'express';
import { materialRequestService } from '../services/materialRequest.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * MATERIAL REQUEST CONTROLLER (Phase 6 + Phase 7 issue workflow).
 * - Only an EXECUTOR can create/submit/cancel their own requests for accessible events.
 * - ADMIN can read/act on requests inside their scope only (adminId = user.id).
 * - Approval/rejection requires ADMIN role (enforced at the route + in the service)
 *   and an admin can never approve or reject a request they created.
 * - Stock ISSUE requires ADMIN and is the only action that moves inventory.
 */
export const materialRequestController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const query = res.locals['validatedQuery'] as {
        status?: string;
        eventId?: string;
        search?: string;
        page: number;
        pageSize: number;
        sort: 'createdAt' | 'eventDate' | 'status';
        order: 'asc' | 'desc';
      };
      const result = await materialRequestService.list(actor, query);
      sendSuccess(res, result, 'Material requests retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const request = await materialRequestService.getById(actor, id);
      sendSuccess(res, { request }, 'Material request retrieved');
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const body = req.body as {
        eventId: string;
        notes?: string | null;
        items?: Array<{ eventMaterialId: string; requestedQuantity: number; remarks?: string | null }>;
      };
      const request = await materialRequestService.create(
        actor,
        { eventId: body.eventId, notes: body.notes, items: body.items },
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      );
      sendSuccess(res, { request }, 'Material request created', 201);
    } catch (error) {
      next(error);
    }
  },

  async createAdditional(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventId } = res.locals['validatedParams'] as { eventId: string };
      const body = req.body as {
        reason: string;
        note?: string | null;
        notes?: string | null;
        parentRequestId?: string | null;
        items: Array<{ eventMaterialId: string; requestedQuantity: number; remarks?: string | null }>;
      };
      const request = await materialRequestService.createAdditional(
        actor,
        { eventId, ...body },
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      );
      sendSuccess(res, { request }, 'Additional material request created', 201);
    } catch (error) {
      next(error);
    }
  },

  async submit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const request = await materialRequestService.submit(actor, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { request }, 'Material request submitted for approval');
    } catch (error) {
      next(error);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = (req.body ?? {}) as {
        items?: Array<{ itemId: string; approvedQuantity: number }>;
      };
      const request = await materialRequestService.approve(actor, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { request }, 'Material request approved');
    } catch (error) {
      next(error);
    }
  },

  async issue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = req.body as { items: Array<{ itemId: string; quantity: number }> };
      const request = await materialRequestService.issue(actor, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { request }, 'Stock issued successfully');
    } catch (error) {
      next(error);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const { reason } = req.body as { reason: string };
      const request = await materialRequestService.reject(actor, id, reason, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { request }, 'Material request rejected');
    } catch (error) {
      next(error);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const request = await materialRequestService.cancel(actor, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { request }, 'Material request cancelled');
    } catch (error) {
      next(error);
    }
  },
};
