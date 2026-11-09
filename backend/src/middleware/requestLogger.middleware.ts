import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Structured HTTP request logging.
 * Logs: timestamp (pino), level, request id, method, path, status, duration.
 * The query string is intentionally NOT logged (may contain sensitive data).
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'HTTP request',
    );
  });

  next();
}
