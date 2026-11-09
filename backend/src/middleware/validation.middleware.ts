import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Input validation middleware (Zod).
 *
 * PERMISSION RULE: client data (body, query, params) is NEVER trusted.
 * - body: on success the parsed (typed, stripped) result replaces the raw value.
 * - query/params: Express 5 exposes these read-only, so validated results are
 *   stored on res.locals and handlers read them via getValidatedQuery() /
 *   getValidatedParams(). Raw values are only used after validation + result.
 * Clients always receive a generic VALIDATION_ERROR, never internal details.
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(createValidationError());
      return;
    }
    Object.assign(res.locals, { validatedQuery: result.data });
    next();
  };
}

export function validateParams(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(createValidationError());
      return;
    }
    Object.assign(res.locals, { validatedParams: result.data });
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
