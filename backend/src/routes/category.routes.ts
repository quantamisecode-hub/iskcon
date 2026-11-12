import { Router, type Request, type Response } from 'express';
import { categoryService } from '../services/category.service.js';
import { authenticate, requireRole, getAuthenticatedUser } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { sendRouteError } from '../middleware/routeError.js';

const categoryRouter = Router();

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

const badRequest = (res: Response, message: string): void => {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
};

const normalizeIsActive = (isActive?: string | boolean): 'true' | 'false' | undefined => {
  if (isActive === undefined) return undefined;
  return typeof isActive === 'boolean' ? (isActive ? 'true' : 'false') : String(isActive).toLowerCase() === 'true' ? 'true' : 'false';
};

categoryRouter.get('/', adminOnly, async (req: Request, res: Response) => {
  try {
const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);
    const isActiveParam = req.query.isActive;
    const isActive = isActiveParam === undefined ? undefined : String(isActiveParam).toLowerCase() === 'true';
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await categoryService.list({ page, pageSize, isActive, search });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

categoryRouter.post('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body as { name: string; description?: string };
    const actor = getAuthenticatedUser(req);
    const nameTrim = typeof name === 'string' ? name.trim() : '';
    if (!nameTrim) { return badRequest(res, 'Name is required.'); }
    const result = await categoryService.create(actor, { name: nameTrim, description: description ?? undefined }, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

categoryRouter.get('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const result = await categoryService.getById(id);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

categoryRouter.patch('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const { name, description, isActive } = req.body as { name?: string; description?: string; isActive?: string | boolean };
    const actor = getAuthenticatedUser(req);
    if (name !== undefined && !String(name).trim()) { return badRequest(res, 'Name cannot be empty.'); }
    const result = await categoryService.update(id, actor, { name: name === undefined ? undefined : String(name).trim(), description: description ?? undefined, isActive: normalizeIsActive(isActive) }, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

categoryRouter.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? '').trim();
    const actor = getAuthenticatedUser(req);
    await categoryService.delete(id, actor, { ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, data: {} });
  } catch (error: unknown) {
    sendRouteError(res, error);
  }
});

export { categoryRouter };
