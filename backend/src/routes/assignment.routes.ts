import { Router } from 'express';
import { assignmentController } from '../controllers/assignment.controller.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware.js';
import { ROLES } from '../constants/roles.js';
import {
  createAssignmentSchema,
} from '../validators/assignment.validator.js';
import { idParamsSchema } from '../validators/user.validator.js';
import { listAssignmentsQuerySchema } from '../validators/assignment.validator.js';

/**
 * ASSIGNMENT ROUTES (/api/v1/assignments). Admin-only.
 * DELETE ends an assignment WITHOUT destroying history.
 */
export const assignmentRouter = Router();

const adminOnly = [authenticate, requireRole(ROLES.ADMIN)];

assignmentRouter.use(...adminOnly);

assignmentRouter.get('/', validateQuery(listAssignmentsQuerySchema), assignmentController.list);
assignmentRouter.post('/', validateBody(createAssignmentSchema), assignmentController.create);
assignmentRouter.delete('/:id', validateParams(idParamsSchema), assignmentController.end);
