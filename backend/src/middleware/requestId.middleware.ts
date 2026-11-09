import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns every incoming request a stable identifier ("req_..." style).
 * The ID is returned to clients in the X-Request-Id header and attached
 * to all log lines for that request, making problems easy to trace.
 * A client-supplied X-Request-Id is propagated when valid.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : `req_${randomUUID()}`;

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
