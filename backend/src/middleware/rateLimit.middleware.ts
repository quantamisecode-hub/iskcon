import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Rate limiting - configured through environment values, not fixed numbers.
 *
 * globalLimiter : protects the whole API from flooding.
 * authLimiter   : much stricter; MUST be applied to /api/v1/auth/* when
 *                 authentication routes are added in Phase 2, to stop
 *                 password brute-force attempts.
 */
const standardOptions = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again later.',
    code: ERROR_CODES.RATE_LIMITED,
  },
};

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  ...standardOptions,
});

export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  // Stricter limiter used only on authentication routes.
  ...standardOptions,
});
