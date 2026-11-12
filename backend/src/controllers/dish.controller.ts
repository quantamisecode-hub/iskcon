import type { NextFunction, Request, Response } from 'express';
import { dishService } from '../services/dish.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * DISH MASTER CONTROLLER (Phase 4).
 * Reads are open to any authenticated user (executors get active dishes only -
 * enforced in dishService). Mutations require ADMIN (enforced in routes).
 */
export const dishController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const query = res.locals['validatedQuery'] as {
        search?: string;
        isActive?: boolean;
        page: number;
        pageSize: number;
      };
      const result = await dishService.list(actor, query);
      sendSuccess(res, result, 'Dishes retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const dish = await dishService.getById(actor, id);
      sendSuccess(res, dish, 'Dish retrieved');
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const body = req.body as { name: string; description?: string | null; isActive?: boolean };
      const dish = await dishService.create(actor, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, dish, 'Dish created', 201);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = req.body as { name?: string; description?: string | null };
      const dish = await dishService.update(id, actor, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, dish, 'Dish updated');
    } catch (error) {
      next(error);
    }
  },

  async setStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const { isActive } = req.body as { isActive: boolean };
      const dish = await dishService.setStatus(id, actor, isActive, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, dish, 'Dish status updated');
    } catch (error) {
      next(error);
    }
  },

  // ---------------- Dish materials ----------------

  async listMaterials(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = res.locals['validatedParams'] as { id: string };
      const materials = await dishService.listMaterials(id);
      sendSuccess(res, { materials }, 'Dish materials retrieved');
    } catch (error) {
      next(error);
    }
  },

  async addMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id } = res.locals['validatedParams'] as { id: string };
      const body = req.body as { foodItemId: string; quantityPerPerson?: number | null; unitId?: string };
      const material = await dishService.addMaterial(id, actor, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, material, 'Material added to dish', 201);
    } catch (error) {
      next(error);
    }
  },

  async updateMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id, materialId } = res.locals['validatedParams'] as { id: string; materialId: string };
      const body = req.body as { quantityPerPerson?: number | null; unitId?: string };
      const material = await dishService.updateMaterial(id, materialId, actor, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, material, 'Dish material updated');
    } catch (error) {
      next(error);
    }
  },

  async removeMaterial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { id, materialId } = res.locals['validatedParams'] as { id: string; materialId: string };
      const result = await dishService.removeMaterial(id, materialId, actor, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, result, 'Dish material removed');
    } catch (error) {
      next(error);
    }
  },
};
