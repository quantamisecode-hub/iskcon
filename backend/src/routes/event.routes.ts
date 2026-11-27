import { Router } from 'express';
import { eventController } from '../controllers/event.controller.js';
import { materialRequestController } from '../controllers/materialRequest.controller.js';
import { materialReturnController } from '../controllers/materialReturn.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
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
  dispatchEventSchema,
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

/** Staff only — used for operational endpoints */
const anyRole = [authenticate, requireRole(ROLES.ADMIN, ROLES.EXECUTOR)];
const executorOnly = [authenticate, requireRole(ROLES.EXECUTOR)];

// --- Events CRUD ---
eventRouter.get('/', authenticate, requirePermission('events:read'), validateQuery(listEventsQuerySchema), eventController.list);
eventRouter.post('/', authenticate, requirePermission('events:create'), validateBody(createEventSchema), eventController.create);
eventRouter.get('/:id', authenticate, requirePermission('events:read'), validateParams(eventIdParamsSchema), eventController.getById);
eventRouter.patch('/:id', authenticate, requirePermission('events:update'), validateParams(eventIdParamsSchema), validateBody(updateEventSchema), eventController.update);
eventRouter.patch('/:id/status', authenticate, requirePermission('events:update'), validateParams(eventIdParamsSchema), validateBody(changeEventStatusSchema), eventController.changeStatus);
// Phase 7 extension: cancellation with a mandatory reason.
eventRouter.post('/:id/cancel', authenticate, requirePermission('events:delete'), validateParams(eventIdParamsSchema), validateBody(cancelEventSchema), eventController.cancel);
// Ready for Dispatch: record dispatch details (ADMIN + EXECUTOR or events:update).
eventRouter.post('/:id/dispatch', authenticate, requirePermission('events:update'), validateParams(eventIdParamsSchema), validateBody(dispatchEventSchema), eventController.dispatch);
// Verifier dropdown options: active executors in the event's admin scope.
eventRouter.get('/:id/dispatch/verifiers', authenticate, requirePermission('events:read'), validateParams(eventIdParamsSchema), eventController.dispatchVerifiers);
// Phase 7 extension: computed §39/§40 material summary (never stored).
eventRouter.get('/:id/material-summary', authenticate, requirePermission('events:read'), validateParams(eventIdParamsSchema), eventController.materialSummary);
// UNDO the last lifecycle move (READY -> PLANNING, COMPLETED -> READY).
eventRouter.post('/:id/undo', authenticate, requirePermission('events:update'), validateParams(eventIdParamsSchema), eventController.undo);
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
eventRouter.delete('/:id', authenticate, requirePermission('events:delete'), validateParams(eventIdParamsSchema), eventController.remove);

// --- Event dishes ---
eventRouter.get('/:id/dishes', authenticate, requirePermission('events:read'), validateParams(eventIdParamsSchema), eventController.listDishes);
eventRouter.post('/:id/dishes', authenticate, requirePermission('events:update'), validateParams(eventIdParamsSchema), validateBody(createEventDishSchema), eventController.addDish);
eventRouter.patch('/:id/dishes/:eventDishId', authenticate, requirePermission('events:update'), validateParams(eventDishParamsSchema), validateBody(updateEventDishSchema), eventController.updateDish);
eventRouter.delete('/:id/dishes/:eventDishId', authenticate, requirePermission('events:update'), validateParams(eventDishParamsSchema), eventController.removeDish);

/**
 * EVENT-MATERIAL ROUTES (mounted at /api/v1/event-dishes).
 * Nested under event-dishes so the parent eventDish scope is always resolvable.
 */
export const eventMaterialRouter = Router();

eventMaterialRouter.get('/:eventDishId/materials', authenticate, requirePermission('events:read'), validateParams(eventDishesMaterialParamsSchema), eventController.listMaterials);
eventMaterialRouter.post('/:eventDishId/materials', authenticate, requirePermission('events:update'), validateParams(eventDishesMaterialParamsSchema), validateBody(createEventMaterialSchema), eventController.addMaterial);
eventMaterialRouter.patch('/:eventDishId/materials/:id', authenticate, requirePermission('events:update'), validateParams(eventDishMaterialParamsSchema), validateBody(updateEventMaterialSchema), eventController.updateMaterial);
eventMaterialRouter.delete('/:eventDishId/materials/:id', authenticate, requirePermission('events:update'), validateParams(eventDishMaterialParamsSchema), eventController.removeMaterial);
