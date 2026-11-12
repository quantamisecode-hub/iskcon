import { Router } from 'express';
import { eventController } from '../controllers/event.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validation.middleware.js';
import { calendarQuerySchema } from '../validators/event.validator.js';

/**
 * CALENDAR ROUTE (/api/v1/calendar).
 * Read-only feed of authorized events inside a date range.
 */
export const calendarRouter = Router();

const anyRole = [authenticate];

calendarRouter.get('/events', anyRole, validateQuery(calendarQuerySchema), eventController.calendar);
