import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { stockLotService } from '../services/stockLot.service.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import { sendRouteError } from '../middleware/routeError.js';
import { sendSuccess } from '../utils/apiResponse.js';

/**
 * ADMIN-only FIFO lot read APIs.
 *  - /api/v1/stock-lots          (list + detail)
 *  - /api/v1/fifo/preview        (non-mutating allocation preview)
 *  - /api/v1/inventory/valuation (current stock value from active lots)
 *
 * All three routers are registered in routes/index.ts.
 */
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

const listQuerySchema = z
  .object({
    foodItemId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    status: z.string().max(30).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const previewQuerySchema = z
  .object({
    foodItemId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
  })
  .strict();

const idParamsSchema = z.object({ id: z.string().uuid() }).strict();

type ListQuery = z.infer<typeof listQuerySchema>;
type PreviewQuery = z.infer<typeof previewQuerySchema>;

export const stockLotRouter = Router();

stockLotRouter.get(
  '/',
  adminOnly,
  validateQuery(listQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const query = res.locals['validatedQuery'] as ListQuery;
      const result = await stockLotService.list(query);
      sendSuccess(res, result, 'Stock lots retrieved');
    } catch (error: unknown) {
      sendRouteError(res, error);
    }
  },
);

stockLotRouter.get(
  '/:id',
  adminOnly,
  validateParams(idParamsSchema),
  async (_req: Request, res: Response) => {
    try {
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await stockLotService.getById(id);
      sendSuccess(res, result, 'Stock lot retrieved');
    } catch (error: unknown) {
      sendRouteError(res, error);
    }
  },
);

export const fifoRouter = Router();

fifoRouter.get(
  '/preview',
  adminOnly,
  validateQuery(previewQuerySchema),
  async (_req: Request, res: Response) => {
    try {
      const { foodItemId, quantity } = res.locals['validatedQuery'] as PreviewQuery;
      const result = await stockLotService.preview(foodItemId, quantity);
      sendSuccess(res, result, 'FIFO allocation preview');
    } catch (error: unknown) {
      sendRouteError(res, error);
    }
  },
);

export const inventoryRouter = Router();

inventoryRouter.get(
  '/valuation',
  adminOnly,
  async (_req: Request, res: Response) => {
    try {
      const result = await stockLotService.valuation();
      sendSuccess(res, result, 'Inventory valuation retrieved');
    } catch (error: unknown) {
      sendRouteError(res, error);
    }
  },
);
