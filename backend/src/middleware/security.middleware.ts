import type { Express } from 'express';
import { applySecurityMiddleware } from '../config/security.js';
import { requestIdMiddleware } from './requestId.middleware.js';

/**
 * SECURITY MIDDLEWARE WIRING
 * Central place where the security pipeline is attached to the app.
 * Order matters (see docs/security-baseline.md):
 *   Request ID -> Security Headers -> CORS -> Body size limits
 */
export function attachSecurityPipeline(app: Express): void {
  app.use(requestIdMiddleware);
  applySecurityMiddleware(app);
}
