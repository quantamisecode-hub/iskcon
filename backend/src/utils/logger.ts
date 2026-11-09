import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Structured JSON logger.
 *
 * ALWAYS log through this module. Sensitive values (passwords, tokens,
 * cookies, database URLs) are automatically redacted if they ever
 * appear in a log object under a matching key.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'cookie',
      'cookies',
      'authorization',
      'databaseUrl',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});
