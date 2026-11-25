import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, getAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import { sendRouteError } from '../middleware/routeError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { eventExpenseService } from '../services/eventExpense.service.js';
import {
  createEventExpenseSchema,
  updateEventExpenseSchema,
  eventExpenseIdParamsSchema,
  eventExpenseEventParamsSchema,
  type CreateEventExpenseInput,
  type UpdateEventExpenseInput,
} from '../validators/eventExpense.validator.js';

/** ADMIN-only. All financial data is derived server-side; the client never sends totals. */
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];
const listQuerySchema = z
  .object({ eventId: z.string().uuid() })
  .strict();

export const eventExpenseRouter = Router();

eventExpenseRouter.get('/', adminOnly, validateQuery(listQuerySchema), async (_req: Request, res: Response) => {
  try {
    const { eventId } = res.locals['validatedQuery'] as { eventId: string };
    const actor = getAuthenticatedUser(_req);
    sendSuccess(res, await eventExpenseService.list(actor, eventId), 'Event expenses retrieved');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

eventExpenseRouter.post('/', adminOnly, validateBody(createEventExpenseSchema), async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    const created = await eventExpenseService.create(actor, req.body as CreateEventExpenseInput, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, created, 'Event expense recorded', 201);
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

eventExpenseRouter.patch('/:id', adminOnly, validateParams(eventExpenseIdParamsSchema), validateBody(updateEventExpenseSchema), async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    const { id } = res.locals['validatedParams'] as { id: string };
    const updated = await eventExpenseService.update(actor, id, req.body as UpdateEventExpenseInput, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, updated, 'Event expense updated');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

eventExpenseRouter.delete('/:id', adminOnly, validateParams(eventExpenseIdParamsSchema), async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    const { id } = res.locals['validatedParams'] as { id: string };
    await eventExpenseService.remove(actor, id, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    sendSuccess(res, {}, 'Event expense deleted');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

// Convenience nested read: GET /api/v1/events/:eventId/expenses is provided by
// the financial router; this params schema documents the same validated id.
export const eventExpenseEventIdSchema = eventExpenseEventParamsSchema;
