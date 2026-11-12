import { Router } from 'express';
import { dishController } from '../controllers/dish.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import {
  createDishMaterialSchema,
  createDishSchema,
  dishIdParamsSchema,
  dishMaterialParamsSchema,
  dishStatusSchema,
  listDishesQuerySchema,
  updateDishMaterialSchema,
  updateDishSchema,
} from '../validators/event.validator.js';

/**
 * DISH MASTER + DISH MATERIAL ROUTES (/api/v1/dishes).
 *  - Reads: any authenticated role (executors see only ACTIVE dishes).
 *  - Mutations (Dish Master / Dish Material Master): ADMIN only.
 */
export const dishRouter = Router();

const anyRole = [authenticate];
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

dishRouter.get('/', anyRole, validateQuery(listDishesQuerySchema), dishController.list);
dishRouter.get('/:id', anyRole, validateParams(dishIdParamsSchema), dishController.getById);

dishRouter.post('/', adminOnly, validateBody(createDishSchema), dishController.create);
dishRouter.patch('/:id', adminOnly, validateParams(dishIdParamsSchema), validateBody(updateDishSchema), dishController.update);
dishRouter.patch('/:id/status', adminOnly, validateParams(dishIdParamsSchema), validateBody(dishStatusSchema), dishController.setStatus);

// --- Dish materials (recipe template mapping): ADMIN only ---
dishRouter.get('/:id/materials', adminOnly, validateParams(dishIdParamsSchema), dishController.listMaterials);
dishRouter.post('/:id/materials', adminOnly, validateParams(dishIdParamsSchema), validateBody(createDishMaterialSchema), dishController.addMaterial);
dishRouter.patch('/:id/materials/:materialId', adminOnly, validateParams(dishMaterialParamsSchema), validateBody(updateDishMaterialSchema), dishController.updateMaterial);
dishRouter.delete('/:id/materials/:materialId', adminOnly, validateParams(dishMaterialParamsSchema), dishController.removeMaterial);
