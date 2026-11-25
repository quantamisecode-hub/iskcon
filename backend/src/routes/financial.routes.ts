import { Router, type Request, type Response } from 'express';
import { authenticate, getAuthenticatedUser, requireRole } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import { sendRouteError } from '../middleware/routeError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { financialService } from '../services/financial.service.js';
import {
  financialSummaryQuerySchema,
  financialEventParamsSchema,
  type FinancialSummaryQuery,
} from '../validators/financial.validator.js';

/**
 * ADMIN-only Inventory & Financial Ledger. Read-only: every number is derived
 * from authoritative StockAllocation / EventExpense / Event records. The
 * browser can never submit a cost, valuation, surplus or P&L figure.
 */
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

export const financialRouter = Router();

financialRouter.get('/summary', adminOnly, validateQuery(financialSummaryQuerySchema), async (req: Request, res: Response) => {
  try {
    const query = res.locals['validatedQuery'] as FinancialSummaryQuery;
    const result = await financialService.getLedgerSummary(getAuthenticatedUser(req), query);
    sendSuccess(res, result, 'Financial ledger summary');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

financialRouter.get('/events/:eventId', adminOnly, validateParams(financialEventParamsSchema), async (req: Request, res: Response) => {
  try {
    const { eventId } = res.locals['validatedParams'] as { eventId: string };
    const result = await financialService.getEventFinancialStatement(getAuthenticatedUser(req), eventId);
    sendSuccess(res, result, 'Event financial statement');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

financialRouter.get('/inventory', adminOnly, async (_req: Request, res: Response) => {
  try {
    const result = await financialService.getInventoryTypeSummary();
    sendSuccess(res, result, 'Inventory stock-type summary');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});
