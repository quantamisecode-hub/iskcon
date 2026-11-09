import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';

/**
 * ROUTE LAYER - route definitions only.
 * No business logic belongs in this file.
 */
export const healthRouter = Router();

// Public liveness probe
healthRouter.get('/health', healthController.check);

// Internal readiness probe (add authentication middleware in Phase 2)
healthRouter.get('/health/db', healthController.checkDatabase);
