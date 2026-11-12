import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { listNotificationsQuerySchema, notificationParamsSchema } from '../validators/materialRequest.validator.js';
import { env } from '../config/env.js';

export const notificationRouter = Router();

notificationRouter.get('/', authenticate, validateQuery(listNotificationsQuerySchema), notificationController.list);
notificationRouter.get('/unread-count', authenticate, notificationController.unreadCount);
// Dev/QA trigger only — never exposed in production.
if (env.NODE_ENV !== 'production') {
  notificationRouter.post('/test', authenticate, notificationController.testCreate);
}
notificationRouter.patch('/:id/read', authenticate, validateParams(notificationParamsSchema), notificationController.markRead);
notificationRouter.post('/mark-all-read', authenticate, notificationController.markAllRead);
