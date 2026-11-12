import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { userRouter } from './user.routes.js';
import { assignmentRouter } from './assignment.routes.js';
import { categoryRouter } from './category.routes.js';
import { unitRouter } from './unit.routes.js';
import { foodItemRouter } from './foodItem.routes.js';
import { eventRouter, eventMaterialRouter } from './event.routes.js';
import { dishRouter } from './dish.routes.js';
import { calendarRouter } from './calendar.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { ledgerRouter } from './ledger.routes.js';
import { materialRequestRouter } from './materialRequest.routes.js';
import { materialReturnRouter } from './materialReturn.routes.js';
import { notificationRouter } from './notification.routes.js';

/**
 * API v1 route registry.
 */
export const apiV1Router = Router();

apiV1Router.use(healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/users', userRouter);
apiV1Router.use('/assignments', assignmentRouter);
apiV1Router.use('/categories', categoryRouter);
apiV1Router.use('/units', unitRouter);
apiV1Router.use('/food-items', foodItemRouter);
apiV1Router.use('/events', eventRouter);
apiV1Router.use('/event-dishes', eventMaterialRouter);
apiV1Router.use('/dishes', dishRouter);
apiV1Router.use('/calendar', calendarRouter);
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/ledger', ledgerRouter);
apiV1Router.use('/material-requests', materialRequestRouter);
apiV1Router.use('/returns', materialReturnRouter);
apiV1Router.use('/notifications', notificationRouter);
