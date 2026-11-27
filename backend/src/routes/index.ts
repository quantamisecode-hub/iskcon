import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { userRouter } from './user.routes.js';
import { assignmentRouter } from './assignment.routes.js';
import { categoryRouter } from './category.routes.js';
import { unitRouter } from './unit.routes.js';
import { vendorRouter } from './vendor.routes.js';
import { foodItemRouter } from './foodItem.routes.js';
import { eventRouter, eventMaterialRouter } from './event.routes.js';
import { dishRouter } from './dish.routes.js';
import { calendarRouter } from './calendar.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { ledgerRouter } from './ledger.routes.js';
import { materialRequestRouter } from './materialRequest.routes.js';
import { materialReturnRouter } from './materialReturn.routes.js';
import { notificationRouter } from './notification.routes.js';
import { stockLotRouter, fifoRouter, inventoryRouter } from './stockLot.routes.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { eventExpenseRouter } from './eventExpense.routes.js';
import { financialRouter } from './financial.routes.js';

/**
 * API v1 route registry.
 */
export const apiV1Router = Router();

/**
 * EVENT_CREATOR is a create + view-events-only role. It is denied at the
 * router boundary on every module except /events (allowed routes only),
 * /calendar/events and self-service /auth. This is defence in depth on top of
 * the service-level scopes.
 */
const staffOnly = [authenticate, requireRole(ROLES.ADMIN, ROLES.EXECUTOR)];

apiV1Router.use(healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/users', ...staffOnly, userRouter);
apiV1Router.use('/assignments', ...staffOnly, assignmentRouter);
apiV1Router.use('/categories', ...staffOnly, categoryRouter);
apiV1Router.use('/units', ...staffOnly, unitRouter);
apiV1Router.use('/vendors', ...staffOnly, vendorRouter);
apiV1Router.use('/food-items', ...staffOnly, foodItemRouter);
// Event and calendar routers enforce the create/view subset per route.
apiV1Router.use('/events', eventRouter);
apiV1Router.use('/event-dishes', eventMaterialRouter);
apiV1Router.use('/dishes', ...staffOnly, dishRouter);
apiV1Router.use('/calendar', calendarRouter);
apiV1Router.use('/dashboard', ...staffOnly, dashboardRouter);
apiV1Router.use('/ledger', ...staffOnly, ledgerRouter);
apiV1Router.use('/material-requests', ...staffOnly, materialRequestRouter);
apiV1Router.use('/returns', ...staffOnly, materialReturnRouter);
apiV1Router.use('/notifications', ...staffOnly, notificationRouter);
// FIFO lot-based inventory read APIs (all ADMIN-only at the router layer).
apiV1Router.use('/stock-lots', ...staffOnly, stockLotRouter);
apiV1Router.use('/fifo', ...staffOnly, fifoRouter);
apiV1Router.use('/inventory', ...staffOnly, inventoryRouter);
// ADMIN-only financial classification, event expenses and P&L-style reporting.
apiV1Router.use('/event-expenses', ...staffOnly, eventExpenseRouter);
apiV1Router.use('/financial', ...staffOnly, financialRouter);
