import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { ERROR_CODES, type ErrorCode } from '../constants/errorCodes.js';

/**
 * CENTRALIZED ERROR HANDLING.
 *
 * Guarantees:
 *  1. ONE consistent error response shape for the whole API.
 *  2. Users never see stack traces, file paths, SQL, or secrets.
 *  3. Developers still get full detail in server logs.
 *
 * Standard error envelope (Phase 2):
 *   { success: false, error: { code, message }, requestId }
 */

/** The only error type intended to be thrown across the application. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: ErrorCode;

  constructor(input: { statusCode: number; code: ErrorCode; message: string }) {
    super(input.message);
    this.name = 'ApiError';
    this.statusCode = input.statusCode;
    this.errorCode = input.code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 404 for unknown routes - kept in the same standard envelope. */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: 'The requested resource was not found.',
    },
    requestId: req.requestId,
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  // FULL detail goes to server logs only (redaction built into the logger).
  logger.error(
    {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      err: error,
    },
    'Request failed',
  );

  const response = describeError(error);
  res.status(response.statusCode).json({
    success: false,
    error: {
      code: response.code,
      message: response.message,
    },
    requestId: req.requestId,
  });
}

interface ErrorDescriptor {
  statusCode: number;
  code: ErrorCode;
  message: string;
}

function describeError(error: unknown): ErrorDescriptor {
  if (isApiError(error)) {
    // Messages on ApiError are authored by us and safe to show.
    return { statusCode: error.statusCode, code: error.errorCode, message: error.message };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid request data.',
    };
  }

  // Anything unknown is intentionally generic on the wire.
  return {
    statusCode: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Something went wrong. Please try again.',
  };
}
