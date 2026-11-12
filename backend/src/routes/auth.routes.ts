import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  avatarUpdateSchema,
  changePasswordSchema,
  loginSchema,
  profileUpdateSchema,
} from '../validators/auth.validator.js';

/**
 * AUTH ROUTES (/api/v1/auth).
 * /login carries the STRICT auth rate limiter (brute-force protection).
 */
export const authRouter = Router();

authRouter.post('/login', authLimiter, validateBody(loginSchema), authController.login);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.patch('/profile', authenticate, validateBody(profileUpdateSchema), authController.updateProfile);
authRouter.post('/change-password', authenticate, authLimiter, validateBody(changePasswordSchema), authController.changePassword);
authRouter.post('/avatar', authenticate, validateBody(avatarUpdateSchema), authController.setAvatar);
