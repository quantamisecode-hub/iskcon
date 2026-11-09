import type { CookieOptions } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
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
};
