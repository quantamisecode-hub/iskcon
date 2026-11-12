import type { Response } from 'express';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * Consistent JSON error envelope for the hand-rolled (non-Zod) master-data routes.
 * ApiError instances keep their status/code; everything else is a sanitized 500.
 */
export function sendRouteError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.errorCode, message: error.message },
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong. Please try again.' },
  });
}
