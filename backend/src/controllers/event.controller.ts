import type { NextFunction, Request, Response } from 'express';
import { eventService } from '../services/event.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * EVENT CONTROLLER (planning only).
 * Identity comes ONLY from req.authUser. All authorization + scope
 * checks live in eventService.
 */
export const eventController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const query = res.locals['validatedQuery'] as {
        search?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        adminId?: string;
        createdBy?: string;
        page: number;
        pageSize: number;
        sort: string;
        order: 'asc' | 'desc';
      };
      const result = await eventService.list(actor, query);
      sendSuccess(res, result, 'Events retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await eventService.getById(actor, id);
      sendSuccess(res, result, 'Event retrieved');
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const body = req.body as {
        name: string;
        description?: string | null;
        eventDate: string;
        startTime: string;
        numberOfPeople: number;
        location?: string | null;
        notes?: string | null;
        donationAmount?: number | null;
        donationGivenBy?: string | null;
        trNumber?: string | null;
        eventType?: string | null;
        servingType?: string | null;
        contactPerson?: string | null;
        mobileNumber?: string | null;
        status?: 'DRAFT' | 'PLANNING';
      };
      const result = await eventService.create(actor, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Event created', 201);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = req.body as {
        name?: string;
        description?: string | null;
        eventDate?: string;
        startTime?: string;
        numberOfPeople?: number;
        location?: string | null;
        notes?: string | null;
        donationAmount?: number | null;
        donationGivenBy?: string | null;
        trNumber?: string | null;
        eventType?: string | null;
        servingType?: string | null;
        contactPerson?: string | null;
        mobileNumber?: string | null;
      };
      const result = await eventService.update(actor, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Event updated');
    } catch (error) {
      next(error);
    }
  },

  async changeStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const { status, reason, donationType, donationAmount, trNumber } = req.body as {
        status: string;
        reason?: string;
        donationType?: string;
        donationAmount?: number | null;
        trNumber?: string | null;
      };
      const result = await eventService.changeStatus(
        actor,
        id,
        status,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        reason,
        donationType || donationAmount !== undefined || trNumber !== undefined
          ? { type: donationType, amount: donationAmount, trNumber }
          : undefined,
      );
      sendSuccess(res, result, 'Event status updated');
    } catch (error) {
      next(error);
    }
  },

  /** POST /events/:id/undo — revert READY -> PLANNING or COMPLETED -> READY. */
  async undo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await eventService.undo(actor, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Event status undone');
    } catch (error) {
      next(error);
    }
  },

  /** POST /events/:id/dispatch — record destination + verified-by (ADMIN + EXECUTOR). */
  async dispatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const { destinationAddress, verifiedById } = req.body as { destinationAddress: string; verifiedById: string };
      const result = await eventService.dispatch(
        actor,
        id,
        { destinationAddress, verifiedById },
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
      );
      sendSuccess(res, result, 'Dispatch details saved');
    } catch (error) {
      next(error);
    }
  },

  /** GET /events/:id/dispatch/verifiers — active executors for the Verified By dropdown. */
  async dispatchVerifiers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await eventService.listDispatchVerifiers(actor, id);
      sendSuccess(res, result, 'Dispatch verifiers retrieved');
    } catch (error) {
      next(error);
    }
  },

  /** POST /events/:id/cancel — ADMIN only, reason required (Phase 7 extension). */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const { reason } = req.body as { reason: string };
      const result = await eventService.cancel(actor, id, { reason }, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Event cancelled');
    } catch (error) {
      next(error);
    }
  },

  /** GET /events/:id/material-summary — computed §39/§40 table (never stored). */
  async materialSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await eventService.materialSummary(actor, id);
      sendSuccess(res, result, 'Event material summary retrieved');
    } catch (error) {
      next(error);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await eventService.remove(actor, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Event deleted');
    } catch (error) {
      next(error);
    }
  },

  // ---------------- Event dishes ----------------

  async listDishes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await eventService.getById(actor, id);
      sendSuccess(res, { dishes: result.dishes }, 'Event dishes retrieved');
    } catch (error) {
      next(error);
    }
  },

  async addDish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = req.body as { dishId: string; notes?: string | null; displayOrder?: number; quantity?: number | null; quantityUnit?: string | null };
      const result = await eventService.addDish(actor, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Dish added to event', 201);
    } catch (error) {
      next(error);
    }
  },

  async updateDish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id, eventDishId } = res.locals['validatedParams'] as { id: string; eventDishId: string };
      const body = req.body as { displayOrder?: number; notes?: string | null; quantity?: number | null; quantityUnit?: string | null };
      const result = await eventService.updateEventDish(actor, id, eventDishId, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Event dish updated');
    } catch (error) {
      next(error);
    }
  },

  async removeDish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id, eventDishId } = res.locals['validatedParams'] as { id: string; eventDishId: string };
      const result = await eventService.removeDish(actor, id, eventDishId, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Dish removed from event');
    } catch (error) {
      next(error);
    }
  },

  // ---------------- Event materials ----------------

  async listMaterials(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventDishId } = res.locals['validatedParams'] as { eventDishId: string };
      const materials = await eventService.listMaterials(actor, eventDishId);
      sendSuccess(res, { materials }, 'Materials retrieved');
    } catch (error) {
      next(error);
    }
  },

  async addMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventDishId } = res.locals['validatedParams'] as { eventDishId: string };
      const body = req.body as {
        foodItemId: string;
        plannedQuantity: number;
        unitId?: string;
        notes?: string | null;
      };
      const result = await eventService.addMaterial(actor, eventDishId, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Material added', 201);
    } catch (error) {
      next(error);
    }
  },

  async updateMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventDishId, id } = res.locals['validatedParams'] as { eventDishId: string; id: string };
      const body = req.body as { plannedQuantity?: number; unitId?: string; notes?: string | null };
      const result = await eventService.updateMaterial(actor, eventDishId, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Material updated');
    } catch (error) {
      next(error);
    }
  },

  async removeMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { eventDishId, id } = res.locals['validatedParams'] as { eventDishId: string; id: string };
      const result = await eventService.removeMaterial(actor, eventDishId, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Material removed');
    } catch (error) {
      next(error);
    }
  },

  // ---------------- Calendar ----------------

  async calendar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const query = res.locals['validatedQuery'] as { from: string; to: string };
      const result = await eventService.calendar(actor, query);
      sendSuccess(res, { events: result }, 'Calendar events retrieved');
    } catch (error) {
      next(error);
    }
  },
};
