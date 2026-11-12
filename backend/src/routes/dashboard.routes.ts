import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

/**
 * DASHBOARD ROUTES (/api/v1/dashboard).
 * Read-only. Scope by role is enforced in the service.
 */
export const dashboardRouter = Router();

const anyRole = [authenticate];

dashboardRouter.get('/summary', anyRole, dashboardController.summary);
