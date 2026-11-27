import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import type { AuthenticatedUser } from '../utils/safeUser.js';

interface RequestWithSession extends Request {
  authUser?: AuthenticatedUser;
}

/**
 * Checks whether an authenticated user holds the required permission(s).
 * - Wildcard '*' grants access to all operations.
 * - Admin users without explicit custom restrictions default to all permissions.
 * - Otherwise, user.permissions must include every required permission.
 */
export function hasUserPermission(
  user: AuthenticatedUser | null | undefined,
  required: string | string[],
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const userPerms = user.permissions ?? [];
  if (userPerms.includes('*')) return true;

  const reqList = Array.isArray(required) ? required : [required];
  return reqList.every((p) => userPerms.includes(p));
}

/**
 * Middleware that guards an endpoint by requiring one or more permissions.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as RequestWithSession).authUser;
    if (!user) {
      next(
        new ApiError({
          statusCode: 401,
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Authentication required.',
        }),
      );
      return;
    }

    if (hasUserPermission(user, requiredPermissions)) {
      return next();
    }

    next(
      new ApiError({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'You do not have permission to perform this action.',
      }),
    );
  };
}
