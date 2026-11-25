import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from './error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { logger } from '../utils/logger.js';

/**
 * Consistent JSON error envelope for routes.
 * Handles ApiError, Prisma database errors, and sanitizes/reports issues.
 */
export function sendRouteError(res: Response, error: unknown): void {
  logger.error({ err: error }, 'Route error occurred');

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.errorCode, message: error.message },
    });
    return;
  }

  // Handle Prisma Database Errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[])?.join(', ') || 'field';
      res.status(409).json({
        success: false,
        error: {
          code: ERROR_CODES.CONFLICT,
          message: `A record with this ${target} already exists.`,
        },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'The requested record was not found.',
        },
      });
      return;
    }
    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Operation failed due to a related record constraint (foreign key).',
        },
      });
      return;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid data format provided for database operation.',
      },
    });
    return;
  }

  if (error instanceof Error && error.message) {
    res.status(500).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: error.message },
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong. Please try again.' },
  });
}

