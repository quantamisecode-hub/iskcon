import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { userRouter } from './user.routes.js';
import { assignmentRouter } from './assignment.routes.js';

/**
 * API v1 route registry.
 * Future route groups (events, dishes, inventory, requests, ...) mount here.
 */
export const apiV1Router = Router();

apiV1Router.use(healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/users', userRouter);
apiV1Router.use('/assignments', assignmentRouter);
