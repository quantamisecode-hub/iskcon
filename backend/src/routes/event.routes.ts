import { Router } from 'express';
import { eventController } from '../controllers/event.controller.js';
import { materialRequestController } from '../controllers/materialRequest.controller.js';
import { materialReturnController } from '../controllers/materialReturn.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import { createAdditionalMaterialRequestSchema } from '../validators/materialRequest.validator.js';
import { createMaterialReturnSchema, eventReturnParamsSchema } from '../validators/materialReturn.validator.js';
import {
  cancelEventSchema,
  changeEventStatusSchema,
  createEventDishSchema,
  createEventMaterialSchema,
  createEventSchema,
  eventDishMaterialParamsSchema,
  eventDishParamsSchema,
  eventDishesMaterialParamsSchema,
  eventIdParamsSchema,
  eventNestedParamsSchema,
  listEventsQuerySchema,
  updateEventDishSchema,
  updateEventMaterialSchema,
  updateEventSchema,
} from '../validators/event.validator.js';

/**
 * EVENT + EVENT-DISH + EVENT-MATERIAL ROUTES.
 * Planning ONLY - NO route in this file can deduct inventory stock.
 * Every route requires an authenticated session; role + scope are enforced
 * server-side in eventService (ADMIN: own events / EXECUTOR: assigned scope).
 */
export const eventRouter = Router();

const anyRole = [authenticate];
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];
const executorOnly = [authenticate, requireRole(ROLES.EXECUTOR)];

// --- Events CRUD ---
eventRouter.get('/', anyRole, validateQuery(listEventsQuerySchema), eventController.list);
eventRouter.post('/', anyRole, validateBody(createEventSchema), eventController.create);
eventRouter.get('/:id', anyRole, validateParams(eventIdParamsSchema), eventController.getById);
eventRouter.patch('/:id', anyRole, validateParams(eventIdParamsSchema), validateBody(updateEventSchema), eventController.update);
eventRouter.patch('/:id/status', anyRole, validateParams(eventIdParamsSchema), validateBody(changeEventStatusSchema), eventController.changeStatus);
// Phase 7 extension: cancellation with a mandatory reason (ADMIN only — service enforces).
eventRouter.post('/:id/cancel', adminOnly, validateParams(eventIdParamsSchema), validateBody(cancelEventSchema), eventController.cancel);
// Phase 7 extension: computed §39/§40 material summary (never stored).
eventRouter.get('/:id/material-summary', anyRole, validateParams(eventIdParamsSchema), eventController.materialSummary);
// Phase 7 extension: additional material request — EXECUTOR creates (service enforces).
eventRouter.post(
  '/:eventId/material-requests',
  executorOnly,
  validateParams(eventNestedParamsSchema),
  validateBody(createAdditionalMaterialRequestSchema),
  materialRequestController.createAdditional,
);
// Phase 7 extension: returns are raised by the EXECUTOR for actually-issued material.
eventRouter.post(
  '/:eventId/returns',
  executorOnly,
  validateParams(eventReturnParamsSchema),
  validateBody(createMaterialReturnSchema),
  materialReturnController.create,
);
// Live returnable lines for the "Return Materials" modal (issued - acceptedReturned).
eventRouter.get(
  '/:eventId/returns/returnable',
  anyRole,
  validateParams(eventReturnParamsSchema),
  materialReturnController.returnable,
);
eventRouter.delete('/:id', anyRole, validateParams(eventIdParamsSchema), eventController.remove);

// --- Event dishes ---
eventRouter.get('/:id/dishes', anyRole, validateParams(eventIdParamsSchema), eventController.listDishes);
eventRouter.post('/:id/dishes', anyRole, validateParams(eventIdParamsSchema), validateBody(createEventDishSchema), eventController.addDish);
eventRouter.patch('/:id/dishes/:eventDishId', anyRole, validateParams(eventDishParamsSchema), validateBody(updateEventDishSchema), eventController.updateDish);
eventRouter.delete('/:id/dishes/:eventDishId', anyRole, validateParams(eventDishParamsSchema), eventController.removeDish);

/**
 * EVENT-MATERIAL ROUTES (mounted at /api/v1/event-dishes).
 * Nested under event-dishes so the parent eventDish scope is always resolvable.
 */
export const eventMaterialRouter = Router();

eventMaterialRouter.get('/:eventDishId/materials', anyRole, validateParams(eventDishesMaterialParamsSchema), eventController.listMaterials);
eventMaterialRouter.post('/:eventDishId/materials', anyRole, validateParams(eventDishesMaterialParamsSchema), validateBody(createEventMaterialSchema), eventController.addMaterial);
eventMaterialRouter.patch('/:eventDishId/materials/:id', anyRole, validateParams(eventDishMaterialParamsSchema), validateBody(updateEventMaterialSchema), eventController.updateMaterial);
eventMaterialRouter.delete('/:eventDishId/materials/:id', anyRole, validateParams(eventDishMaterialParamsSchema), eventController.removeMaterial);
