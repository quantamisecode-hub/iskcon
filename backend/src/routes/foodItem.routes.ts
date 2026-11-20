import { Router, type Request, type Response } from 'express';
import { foodItemService } from '../services/foodItem.service.js';
import { authenticate, requireRole, getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { sendRouteError } from '../middleware/routeError.js';
import { vendorRepository } from '../repositories/vendor.repository.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

const foodItemRouter = Router();

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];
// Any authenticated role may READ the master (dropdowns, planning screens).
const anyRole = [authenticate];

const badRequest = (res: Response, message: string): void => {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
};

const asNonNegativeNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeIsActive = (isActive?: string | boolean): 'true' | 'false' | undefined => {
  if (isActive === undefined) return undefined;
  return typeof isActive === 'boolean' ? (isActive ? 'true' : 'false') : String(isActive).toLowerCase() === 'true' ? 'true' : 'false';
};

foodItemRouter.get('/', anyRole, async (req: Request, res: Response) => {
  try {
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const isActiveParam = req.query.isActive;
    const isActive = isActiveParam === undefined ? undefined : String(isActiveParam).toLowerCase() === 'true';
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : undefined;
    const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await foodItemService.list({ page, pageSize, isActive, categoryId, unitId, search });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, description, categoryName, unitSymbol, minimumStock, reorderLevel, isActive } = req.body as {
      name: string;
      description?: string;
      categoryName: string;
      unitSymbol: string;
      minimumStock: number;
      reorderLevel: number;
      isActive?: string | boolean;
    };
    // Mandatory inputs cannot be omitted — an item cannot be created without a category (or unit).
    const nameTrim = typeof name === 'string' ? name.trim() : '';
    if (!nameTrim) { return badRequest(res, 'Name is required.'); }
    const categoryTrim = typeof categoryName === 'string' ? categoryName.trim() : '';
    if (!categoryTrim) { return badRequest(res, 'Category is required. Create a category first.'); }
    const unitTrim = typeof unitSymbol === 'string' ? unitSymbol.trim() : '';
    if (!unitTrim) { return badRequest(res, 'Unit is required.'); }
    const minNum = asNonNegativeNumber(minimumStock ?? 10);
    if (minNum === null) { return badRequest(res, 'minimumStock must be a number of zero or greater.'); }
    const reorderNum = asNonNegativeNumber(reorderLevel ?? 20);
    if (reorderNum === null) { return badRequest(res, 'reorderLevel must be a number of zero or greater.'); }
    const actor = getAuthenticatedUser(req);
    const result = await foodItemService.create(actor, {
      name: nameTrim,
      description: description ?? undefined,
      categoryName: categoryTrim,
      unitSymbol: unitTrim,
      minimumStock: minNum,
      reorderLevel: reorderNum,
      isActive: normalizeIsActive(isActive),
    }, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.get('/stock/summary', anyRole, async (_req: Request, res: Response) => {
  try {
    const result = await foodItemService.stockSummary();
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.get('/:id', anyRole, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const result = await foodItemService.getById(id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.get('/:id/detail', anyRole, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actor = getAuthenticatedUser(req);
    const result = await foodItemService.getDetail(id, { id: actor.id, role: actor.role });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.patch('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const { name, description, categoryName, unitSymbol, minimumStock, reorderLevel, isActive } = req.body as {
      name?: string;
      description?: string;
      categoryName?: string;
      unitSymbol?: string;
      minimumStock?: number;
      reorderLevel?: number;
      isActive?: string | boolean;
    };
    const actor = getAuthenticatedUser(req);
    // Reject empty-string masters / invalid thresholds instead of silently applying them.
    if (name !== undefined && !String(name).trim()) { return badRequest(res, 'Name cannot be empty.'); }
    if (categoryName !== undefined && !String(categoryName).trim()) { return badRequest(res, 'Category cannot be empty.'); }
    if (unitSymbol !== undefined && !String(unitSymbol).trim()) { return badRequest(res, 'Unit cannot be empty.'); }
    let minNum: number | undefined;
    if (minimumStock !== undefined) {
      const parsed = asNonNegativeNumber(minimumStock);
      if (parsed === null) { return badRequest(res, 'minimumStock must be a number of zero or greater.'); }
      minNum = parsed;
    }
    let reorderNum: number | undefined;
    if (reorderLevel !== undefined) {
      const parsed = asNonNegativeNumber(reorderLevel);
      if (parsed === null) { return badRequest(res, 'reorderLevel must be a number of zero or greater.'); }
      reorderNum = parsed;
    }
    const result = await foodItemService.update(id, actor, { name: name === undefined ? undefined : String(name).trim(), description: description ?? undefined, categoryName, unitSymbol, minimumStock: minNum, reorderLevel: reorderNum, isActive: normalizeIsActive(isActive) }, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actor = getAuthenticatedUser(req);
    await foodItemService.delete(id, actor, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: {} });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

// Stock In
foodItemRouter.post('/:id/stock-in', adminOnly, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      quantity?: unknown;
      vendorId?: unknown;
      purchaseDate?: unknown;
      receivedDate?: unknown;
      unitCost?: unknown;
      referenceNumber?: unknown;
      notes?: unknown;
    };
    const quantity = body.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      return badRequest(res, 'Quantity must be a positive number.');
    }

    // Optional supplier attribution. Reject malformed ids and any vendor that
    // is missing or deactivated so the ledger never records a dead supplier.
    let linkedVendorId: string | null = null;
    if (body.vendorId !== undefined && body.vendorId !== null) {
      const trimmed = String(body.vendorId).trim();
      if (!UUID_REGEX.test(trimmed)) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'vendorId must be a valid UUID.' });
      }
      const vendor = await vendorRepository.findById(trimmed);
      if (!vendor || !vendor.isActive) {
        throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Active vendor not found.' });
      }
      linkedVendorId = trimmed;
    }

    // Lot provenance. Dates are calendar dates (YYYY-MM-DD); the total cost is
    // ALWAYS recomputed server-side from quantity × unitCost — never trusted
    // from the client.
    const parseDate = (value: unknown, label: string): string | null => {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: `${label} must be a valid YYYY-MM-DD date.` });
      }
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: `${label} must be a valid YYYY-MM-DD date.` });
      }
      return value;
    };

    const purchaseDate = parseDate(body.purchaseDate, 'purchaseDate');
    const receivedDate = parseDate(body.receivedDate, 'receivedDate') ?? new Date().toISOString().slice(0, 10);

    let unitCost: number | null = null;
    if (body.unitCost !== undefined && body.unitCost !== null && body.unitCost !== '') {
      const cost = Number(body.unitCost);
      if (!Number.isFinite(cost) || cost < 0) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'unitCost must be a non-negative number.' });
      }
      unitCost = cost;
    }

    const referenceNumber = body.referenceNumber === undefined || body.referenceNumber === null
      ? null
      : String(body.referenceNumber).trim();
    if (referenceNumber !== null && referenceNumber.length > 100) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'referenceNumber must be 100 characters or fewer.' });
    }
    const notes = body.notes === undefined || body.notes === null ? null : String(body.notes).trim();
    if (notes !== null && notes.length > 500) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'notes must be 500 characters or fewer.' });
    }

    const actor = getAuthenticatedUser(req).id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const result = await foodItemService.addStock(
      String(req.params.id ?? '').trim(),
      quantity,
      actor,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
      undefined,
      undefined,
      idempotencyKey,
      linkedVendorId,
      purchaseDate,
      receivedDate,
      unitCost,
      referenceNumber || null,
      notes || null,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

foodItemRouter.post('/:id/stock-out', adminOnly, async (req: Request, res: Response) => {
  try {
    const { quantity, reason, referenceType, referenceId } = req.body as {
      quantity?: unknown;
      reason?: unknown;
      referenceType?: unknown;
      referenceId?: unknown;
    };
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) { return badRequest(res, 'Quantity must be a positive number.'); }
    if (typeof reason !== 'string' || !reason.trim()) { return badRequest(res, 'A reason is required for Stock Out.'); }
    const refType = referenceType === undefined || referenceType === null ? null : String(referenceType).trim().toUpperCase();
    if (refType && refType !== 'EVENT') { return badRequest(res, 'Invalid reference type.'); }
    const refId = referenceId === undefined || referenceId === null ? null : String(referenceId).trim();
    if (refId && !refType) { return badRequest(res, 'A reference requires a type.'); }
    const actor = getAuthenticatedUser(req).id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const result = await foodItemService.removeStock(
      String(req.params.id ?? '').trim(),
      qty,
      actor,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
      { referenceType: refType, referenceId: refId, remarks: reason.trim() },
      idempotencyKey,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

// Adjustment
foodItemRouter.post('/:id/adjustment', adminOnly, async (req: Request, res: Response) => {
  try {
    const { quantity, reason } = req.body as { quantity: number; reason: string };
    if (!Number.isFinite(quantity) || quantity <= 0) { return badRequest(res, 'Quantity must be a positive number.'); }
    if (typeof reason !== 'string' || !reason.trim()) { return badRequest(res, 'A reason is required for an adjustment.'); }
    const actor = getAuthenticatedUser(req).id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const result = await foodItemService.adjustStock(String(req.params.id ?? '').trim(), 'OUT', quantity, reason.trim(), actor, { ipAddress: req.ip, userAgent: req.headers['user-agent'] }, idempotencyKey);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

export { foodItemRouter };
