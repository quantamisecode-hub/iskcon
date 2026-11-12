import type { CookieOptions } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getAuthenticatedUser, getSessionId } from '../middleware/auth.middleware.js';
import { buildSessionCookieOptions } from '../config/security.js';
import { env } from '../config/env.js';

/**
 * AUTH CONTROLLER
 * HTTP in/out only; all logic lives in authService.
 * The session token lives ONLY in an HttpOnly cookie - never in the body.
 */
export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await authService.login(
        { email, password },
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      );

      const options: CookieOptions = {
        ...buildSessionCookieOptions(),
        maxAge: env.SESSION_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      };
      res.cookie(env.SESSION_COOKIE_NAME, result.token, options);

      sendSuccess(res, { user: result.user }, 'Login successful');
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.logout({
        token: req.cookies?.[env.SESSION_COOKIE_NAME],
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.clearCookie(env.SESSION_COOKIE_NAME, buildSessionCookieOptions());
      sendSuccess(res, {}, 'Logout successful');
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // authUser was attached server-side by authenticateSession.
      sendSuccess(res, { user: req.authUser }, 'Current user');
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { firstName, lastName, email, currentPassword } = req.body as {
        firstName?: string;
        lastName?: string;
        email?: string;
        currentPassword?: string;
      };
      const user = await authService.updateProfile(
        actor.id,
        { firstName, lastName, email, currentPassword },
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
      );
      sendSuccess(res, { user }, 'Profile updated');
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      await authService.changePassword(actor.id, getSessionId(req), { currentPassword, newPassword }, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, {}, 'Password changed. Other sessions have been signed out.');
    } catch (error) {
      next(error);
    }
  },

  async setAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getAuthenticatedUser(req);
      const { avatarUrl } = req.body as { avatarUrl: string | null };
      const user = await authService.setAvatar(actor.id, avatarUrl, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { user }, avatarUrl === null ? 'Avatar removed' : 'Avatar updated');
    } catch (error) {
      next(error);
    }
  },
};
