import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Input validation middleware (Zod).
 *
 * PERMISSION RULE: client data (body, query, params) is NEVER trusted.
 * Attach validators to routes BEFORE handlers. On success the parsed,
 * typed result replaces the raw value, so handlers only ever receive
 * clean data. Clients receive a generic VALIDATION_ERROR, never the
 * internal message.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(createValidationError());
      return;
    }
    Object.assign(req, { body: result.data });
    next();
  };
}

export function validateQuery(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(createValidationError());
      return;
    }
    Object.assign(req, { query: result.data });
    next();
  };
}

export function validateParams(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(createValidationError());
      return;
    }
    Object.assign(req, { params: result.data });
    next();
  };
}

function createValidationError(): ApiError {
  return new ApiError({
    statusCode: 400,
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Invalid request data.',
  });
}
