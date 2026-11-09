import { Router } from 'express';
import { healthRouter } from './health.routes.js';

/**
 * API v1 route registry.
 * Future route groups (users, events, dishes, inventory, requests, ...)
 * are mounted here. When authentication routes are added they MUST be
 * mounted together with the stricter `authLimiter`.
 */
export const apiV1Router = Router();

apiV1Router.use(healthRouter);
