import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import type { Role } from '../constants/roles.js';

/**
 * PLACEHOLDER - full authentication and authorization arrive in Phase 2.
 *
 * This file establishes the CENTRAL authorization architecture so that
 * later phases never hand-roll their own checks in controllers.
 *
 * Planned strategy:
 *  - Secure HTTP-only session cookie ("fis_session"), validated against
 *    the backend session store on every request.
 *  - Password checking will use Argon2id (fallback: bcrypt).
 *  - `requireAuthentication` guards any route needing a logged-in user.
 *  - `requireRole` enforces ADMIN / EXECUTOR / Admin->Executor scope.
 *
 * Nothing here performs fake authentication: each middleware refuses
 * to run until the real session system exists.
 */
export function requireAuthentication(_req: Request, _res: Response, next: NextFunction): void {
  next(
    new ApiError({
      statusCode: 501,
      code: ERROR_CODES.NOT_IMPLEMENTED,
      message: 'Authentication will be enabled in Phase 2.',
    }),
  );
}

export function requireRole(_allowedRoles: readonly Role[]) {
  return (_req: Request, _res: Response, _next?: NextFunction): void => {
    void _next;
    throw new ApiError({
      statusCode: 501,
      code: ERROR_CODES.NOT_IMPLEMENTED,
      message: 'Role authorization will be enabled in Phase 2.',
    });
  };
}
