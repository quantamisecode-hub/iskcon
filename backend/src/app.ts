import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachSecurityPipeline } from './middleware/security.middleware.js';
import { globalLimiter } from './middleware/rateLimit.middleware.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware.js';
import { originValidationMiddleware } from './middleware/originValidation.middleware.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { apiV1Router } from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Built frontend (vite build output) — served same-origin in production. */
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');

/**
 * Express application assembly.
 *
 * Middleware order (deliberate, see docs/security-baseline.md):
 *   Request ID -> Security headers -> CORS -> Body size limits
 *   -> Cookies -> principals (cookie-parser)
 *   -> Global rate limit -> CSRF origin validation -> Request logging
 *   -> Routes (/api/v1)
 *   -> Static frontend (same-origin deployment) + SPA fallback
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

  // Same-origin production deployment: serve the built SPA and fall back to
  // index.html for client-side routes (GET requests that accept HTML).
  const hasFrontendBuild = existsSync(path.join(FRONTEND_DIST, 'index.html'));
  if (hasFrontendBuild) {
    // Hashed assets are immutable; index.html is never cached.
    app.use(
      express.static(FRONTEND_DIST, {
        index: false,
        setHeaders(res, filePath) {
          if (/\.(js|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(filePath) && filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api')) return next();
      // Paths that look like files fall through to the 404 handler.
      if (/\.[a-zA-Z0-9]{1,10}$/.test(req.path)) return next();
      const accepts = req.headers.accept ?? '';
      if (accepts && !accepts.includes('text/html') && !accepts.includes('*/*')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
