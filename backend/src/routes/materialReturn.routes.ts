import { Router } from 'express';
import { materialReturnController } from '../controllers/materialReturn.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import {
  acceptMaterialReturnSchema,
  listMaterialReturnsQuerySchema,
  rejectMaterialReturnSchema,
  returnIdParamsSchema,
} from '../validators/materialReturn.validator.js';

/**
 * MATERIAL RETURN ROUTES (Phase 7 extension).
 * Creation lives under /events/:eventId/returns (see event.routes.ts).
 * Review (accept/reject) is ADMIN-only; reads are scoped in the service.
 * ONLY POST /:id/accept ever moves inventory.
 */
export const materialReturnRouter = Router();

const anyRole = [authenticate];
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

materialReturnRouter.get('/', anyRole, validateQuery(listMaterialReturnsQuerySchema), materialReturnController.list);
materialReturnRouter.get('/:id', anyRole, validateParams(returnIdParamsSchema), materialReturnController.getById);
materialReturnRouter.post('/:id/accept', adminOnly, validateParams(returnIdParamsSchema), validateBody(acceptMaterialReturnSchema), materialReturnController.accept);
materialReturnRouter.post('/:id/reject', adminOnly, validateParams(returnIdParamsSchema), validateBody(rejectMaterialReturnSchema), materialReturnController.reject);
