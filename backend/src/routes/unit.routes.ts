import { Router, type Request, type Response } from 'express';
import { unitService } from '../services/unit.service.js';
import { authenticate, requireRole, getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { sendRouteError } from '../middleware/routeError.js';

const unitRouter = Router();

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];
// Any authenticated role may READ the master (dropdowns, planning screens).
const anyRole = [authenticate];

const badRequest = (res: Response, message: string): void => {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
};

const normalizeIsActive = (isActive?: string | boolean): 'true' | 'false' | undefined => {
  if (isActive === undefined) return undefined;
  return typeof isActive === 'boolean' ? (isActive ? 'true' : 'false') : String(isActive).toLowerCase() === 'true' ? 'true' : 'false';
};

unitRouter.get('/', anyRole, async (req: Request, res: Response) => {
  try {
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const isActiveParam = req.query.isActive;
    const isActive = isActiveParam === undefined ? undefined : String(isActiveParam).toLowerCase() === 'true';
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await unitService.list({ page, pageSize, isActive, search });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

unitRouter.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, symbol, unitType, isActive } = req.body as { name: string; symbol: string; unitType: string; isActive?: string | boolean };
    const actor = getAuthenticatedUser(req);
    if (!name?.trim() || !symbol?.trim() || !unitType?.trim()) {
      return badRequest(res, 'Name, symbol and unit type are required.');
    }
    const result = await unitService.create(actor, { name: name.trim(), symbol: symbol.trim(), unitType: unitType.trim(), isActive: normalizeIsActive(isActive) }, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

unitRouter.get('/:id', anyRole, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const result = await unitService.getById(id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

unitRouter.patch('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const { name, symbol, unitType, isActive } = req.body as { name?: string; symbol?: string; unitType?: string; isActive?: string | boolean };
    const actor = getAuthenticatedUser(req);
    if (name !== undefined && !String(name).trim()) { return badRequest(res, 'Name cannot be empty.'); }
    if (symbol !== undefined && !String(symbol).trim()) { return badRequest(res, 'Symbol cannot be empty.'); }
    const result = await unitService.update(id, actor, { name, symbol, unitType, isActive: normalizeIsActive(isActive) }, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

unitRouter.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actor = getAuthenticatedUser(req);
    await unitService.delete(id, actor, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: {} });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

export { unitRouter };
