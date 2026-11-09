import type { NextFunction, Request, Response } from 'express';
import { userService } from '../services/user.service.js';
import { getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * USER MANAGEMENT CONTROLLER (Admin-only endpoints).
 * Actor identity always comes from req.authUser (session-derived).
 */
export const userController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = res.locals['validatedQuery'] as {
        role?: 'ADMIN' | 'EXECUTOR';
        isActive?: boolean;
        search?: string;
        page: number;
        pageSize: number;
      };
      const result = await userService.listUsers(filters);
      sendSuccess(res, result, 'Users retrieved');
    } catch (error) {
      next(error);
    }
  },

  async getById(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = res.locals['validatedParams'] as { id: string };
      const user = await userService.getUser(id);
      sendSuccess(res, { user }, 'User retrieved');
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const body = req.body as {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        role: 'ADMIN' | 'EXECUTOR';
      };
      const user = await userService.createUser(actor, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { user }, 'User created', 201);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const params = res.locals['validatedParams'] as { id: string };
      const body = req.body as {
        firstName?: string;
        lastName?: string;
        email?: string;
        role?: 'ADMIN' | 'EXECUTOR';
      };
      const user = await userService.updateUser(actor, params.id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { user }, 'User updated');
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const params = res.locals['validatedParams'] as { id: string };
      const { status } = req.body as { status: 'ACTIVE' | 'INACTIVE' };
      const user = await userService.updateUserStatus(actor, params.id, status, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { user }, status === 'ACTIVE' ? 'User activated' : 'User deactivated');
    } catch (error) {
      next(error);
    }
  },
};
