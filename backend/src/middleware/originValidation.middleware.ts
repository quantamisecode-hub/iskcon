import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * CSRF DEFENSE LAYER 1 (origin validation).
 *
 * Strategy (documents/see security-baseline.md):
 *   1. SameSite=lax (default) session cookie - browsers do NOT attach it on
 *      cross-site state-changing requests. This alone blocks modern CSRF.
 *   2. Origin/Referer validation on ALL state-changing requests below:
 *      - Origin header present  -> must equal the configured frontend origin.
 *      - else Referer present   -> its origin must equal the allowed origin.
 *      - neither header present -> allowed (server-to-server clients);
 *        a browser CSRF attack always sends at least a Referer/Origin,
 *        and layer 1 already blocks the cross-site cookie.
 *
 * CSRF token (double-submit cookie) remains the planned hardening for when
 * the platform grows beyond cookie-only auth (see security-baseline.md).
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function originValidationMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const allowedOrigins = env.ALLOWED_ORIGINS;
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  const requestOrigin =
    typeof originHeader === 'string' && originHeader.length > 0
      ? originHeader.toLowerCase()
      : typeof refererHeader === 'string' && refererHeader.length > 0
        ? new URL(refererHeader).origin.toLowerCase()
        : null;

  if (requestOrigin === null || allowedOrigins.includes(requestOrigin)) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Request origin is not allowed.' },
    requestId: req.requestId,
  });
}
