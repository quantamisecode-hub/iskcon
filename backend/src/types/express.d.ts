import type { Request } from 'express';

/** Express request augmentation: every request carries a request ID. */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Ensures this file is a module (required for global augmentation).
export type { Request };
