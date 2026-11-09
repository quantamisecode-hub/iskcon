import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import {
  createUserSchema,
  idParamsSchema,
  updateUserSchema,
  updateUserStatusSchema,
  listUsersQuerySchema,
} from '../validators/user.validator.js';

/**
 * USER MANAGEMENT ROUTES (/api/v1/users).
 * EVERY route requires: valid session + ADMIN role (server-side).
 */
export const userRouter = Router();

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

userRouter.use(...adminOnly);

userRouter.get('/', validateQuery(listUsersQuerySchema), userController.list);
userRouter.post('/', validateBody(createUserSchema), userController.create);
userRouter.get('/:id', validateParams(idParamsSchema), userController.getById);
userRouter.patch('/:id', validateParams(idParamsSchema), validateBody(updateUserSchema), userController.update);
userRouter.patch('/:id/status', validateParams(idParamsSchema), validateBody(updateUserStatusSchema), userController.updateStatus);
