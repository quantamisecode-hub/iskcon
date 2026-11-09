import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { env } from '../config/env.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { hashSessionToken } from '../utils/tokens.js';
import { toSafeUser, type AuthenticatedUser } from '../utils/safeUser.js';
import type { Role } from '../constants/roles.js';

/**
 * AUTHENTICATION + ROLE-BASED AUTHORIZATION MIDDLEWARE.
 *
 * RULES:
 *  - Identity and role come ONLY from the validated session in the database.
 *    `userId` / `role` / anything sent by the frontend is never trusted.
 *  - Inactive users are rejected on every request, even with a live session.
 *  - requireRole(...roles) composes to one or many allowed roles.
 */

interface RequestWithSession extends Request {
  authUser?: AuthenticatedUser;
  sessionId?: string;
}

export async function authenticateSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || token.length === 0) {
      throw new ApiError({
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required.',
      });
    }

    const session = await sessionRepository.findValidByTokenHash(hashSessionToken(token));
    if (!session || !session.user.isActive) {
      throw new ApiError({
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Authentication required.',
      });
    }

    (req as RequestWithSession).authUser = toSafeUser(session.user);
    (req as RequestWithSession).sessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: Role[]) {
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
    if (!allowedRoles.includes(user.role)) {
      next(
        new ApiError({
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: 'You do not have permission to perform this action.',
        }),
      );
      return;
    }
    next();
  };
}

/** Typed accessor for controllers - guaranteed present after authenticateSession. */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  const user = (req as RequestWithSession).authUser;
  if (!user) {
    throw new ApiError({
      statusCode: 401,
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Authentication required.',
    });
  }
  return user;
}

export function getSessionId(req: Request): string | undefined {
  return (req as RequestWithSession).sessionId;
}

/** Alias kept stable for route composition (Phase 1 name). */
export const authenticate = authenticateSession;
