import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { attachSecurityPipeline } from './middleware/security.middleware.js';
import { globalLimiter } from './middleware/rateLimit.middleware.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware.js';
import { originValidationMiddleware } from './middleware/originValidation.middleware.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { apiV1Router } from './routes/index.js';

/**
 * Express application assembly.
 *
 * Middleware order (deliberate, see docs/security-baseline.md):
 *   Request ID -> Security headers -> CORS -> Body size limits
 *   -> Cookies -> principals (cookie-parser)
 *   -> Global rate limit -> CSRF origin validation -> Request logging
 *   -> Routes (/api/v1)
 *   -> 404 handler -> Central error handler
 */
export function createApp(): Express {
  const app = express();

  attachSecurityPipeline(app);
  app.use(cookieParser());

  app.use(globalLimiter);
  app.use(originValidationMiddleware);
  app.use(requestLoggerMiddleware);

  // All API surface is versioned under /api/v1.
  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
