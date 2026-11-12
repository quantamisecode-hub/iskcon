import { Router } from 'express';
import { ledgerService } from '../services/ledger.service.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { listLedgerQuerySchema } from '../validators/ledger.validator.js';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

/**
 * INVENTORY LEDGER ROUTES (/api/v1/ledger). ADMIN only, read-only.
 * The ledger is written exclusively by stock operations — never by hand.
 */
export const ledgerRouter = Router();

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

ledgerRouter.get(
  '/',
  adminOnly,
  validateQuery(listLedgerQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as {
        itemId?: string;
        type?: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'RETURN';
        dateFrom?: string;
        dateTo?: string;
        userId?: string;
        page: number;
        pageSize: number;
      };
      const result = await ledgerService.list(query);
      sendSuccess(res, result, 'Ledger retrieved');
    } catch (error) {
      next(error);
    }
  },
);

const transactionIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

ledgerRouter.get(
  '/:id',
  adminOnly,
  validateParams(transactionIdParamsSchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = res.locals['validatedParams'] as { id: string };
      const result = await ledgerService.getById(id);
      if (!result) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaction not found.' } });
        return;
      }
      sendSuccess(res, result, 'Transaction retrieved');
    } catch (error) {
      next(error);
    }
  },
);
