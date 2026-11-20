import { Router, type Request, type Response } from 'express';
import { vendorService } from '../services/vendor.service.js';
import { vendorSchema, vendorUpdateSchema } from '../validators/vendor.validator.js';
import { authenticate, requireRole, getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { requireVendorAdmin } from '../policies/vendor.policy.js';
import { sendRouteError } from '../middleware/routeError.js';
import { sendSuccess } from '../utils/apiResponse.js';

const vendorRouter = Router();

// Vendors are master data with supplier/payment information — ADMIN only,
// including reads (same policy as category.routes.ts).
const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

const badRequest = (res: Response, message: string): void => {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
};

const validationMessage = (error: { issues: Array<{ message: string }> }): string =>
  error.issues.map((issue) => issue.message).join('; ') || 'Invalid input.';

/** Accept both JSON booleans and the string form used by the other master-data routes. */
const normalizeBody = (body: unknown): unknown => {
  if (typeof body !== 'object' || body === null) return body;
  const raw = body as Record<string, unknown>;
  const cleaned: Record<string, unknown> = { ...raw };
  if ('isActive' in cleaned) {
    const value = cleaned.isActive;
    cleaned.isActive = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
  }
  return cleaned;
};

vendorRouter.get('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);

    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const isActiveParam = req.query.isActive;
    const isActive = isActiveParam === undefined ? undefined : String(isActiveParam).toLowerCase() === 'true';
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await vendorService.list(actor, { page, pageSize, isActive, search });
    sendSuccess(res, result, 'Vendors retrieved');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

// NOTE: '/audit' must be registered before '/:id' so Express does not treat
// 'audit' as a vendor id.
vendorRouter.get('/audit', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const result = await vendorService.getAuditHistory(actor);
    sendSuccess(res, result, 'Vendor audit history retrieved');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.get('/:id/audit', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const id = String(req.params.id ?? '').trim();
    const result = await vendorService.getAuditHistory(actor, id);
    sendSuccess(res, result, 'Vendor audit history retrieved');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.post('/:id/activate', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const id = String(req.params.id ?? '').trim();
    const result = await vendorService.activate(actor, id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, result, 'Vendor activated');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.post('/:id/deactivate', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const id = String(req.params.id ?? '').trim();
    const result = await vendorService.deactivate(actor, id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, result, 'Vendor deactivated');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.get('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const id = String(req.params.id ?? '').trim();
    const result = await vendorService.getById(actor, id);
    sendSuccess(res, result, 'Vendor retrieved');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const parsed = vendorSchema.safeParse(normalizeBody(req.body));
    if (!parsed.success) return badRequest(res, validationMessage(parsed.error));
    const result = await vendorService.create(actor, parsed.data, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, result, 'Vendor created', 201);
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.patch('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const id = String(req.params.id ?? '').trim();
    const parsed = vendorUpdateSchema.safeParse(normalizeBody(req.body));
    if (!parsed.success) return badRequest(res, validationMessage(parsed.error));
    const result = await vendorService.update(id, actor, parsed.data, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, result, 'Vendor updated');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

vendorRouter.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const actor = getAuthenticatedUser(req);
    requireVendorAdmin(actor);
    const id = String(req.params.id ?? '').trim();
    await vendorService.delete(id, actor, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendSuccess(res, {}, 'Vendor deactivated');
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

export { vendorRouter };
