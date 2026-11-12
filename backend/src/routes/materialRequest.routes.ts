import { Router } from 'express';
import { materialRequestController } from '../controllers/materialRequest.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import {
  approveMaterialRequestSchema,
  createMaterialRequestSchema,
  issueMaterialRequestSchema,
  listMaterialRequestsQuerySchema,
  rejectMaterialRequestSchema,
  notificationParamsSchema,
} from '../validators/materialRequest.validator.js';

export const materialRequestRouter = Router();

const anyRole = [authenticate];
const executorOnly = [authenticate, requireRole(ROLES.EXECUTOR)];
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

// List / detail — both roles read within their own scope (service enforces it).
materialRequestRouter.get('/', anyRole, validateQuery(listMaterialRequestsQuerySchema), materialRequestController.list);
materialRequestRouter.get('/:id', anyRole, validateParams(notificationParamsSchema), materialRequestController.getById);

// Only an EXECUTOR may raise or submit a request. An ADMIN reviews and decides.
materialRequestRouter.post('/', executorOnly, validateBody(createMaterialRequestSchema), materialRequestController.create);

// Lifecycle
materialRequestRouter.post('/:id/submit', executorOnly, validateParams(notificationParamsSchema), materialRequestController.submit);
materialRequestRouter.post('/:id/approve', adminOnly, validateParams(notificationParamsSchema), validateBody(approveMaterialRequestSchema), materialRequestController.approve);
materialRequestRouter.post('/:id/reject', adminOnly, validateParams(notificationParamsSchema), validateBody(rejectMaterialRequestSchema), materialRequestController.reject);
materialRequestRouter.post('/:id/issue', adminOnly, validateParams(notificationParamsSchema), validateBody(issueMaterialRequestSchema), materialRequestController.issue);
materialRequestRouter.post('/:id/cancel', anyRole, validateParams(notificationParamsSchema), materialRequestController.cancel);
