import type { Request } from 'express';

/**
 * Express request augmentation.
 *  - requestId: attribution/correlation id (Phase 1 middleware).
 *  - authUser:  safe authenticated-user context, attached ONLY by
 *               authenticateSession after server-side session validation.
 *               Never populated from client input.
 *  - sessionId: current database session id (used for logout revocation).
 */
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      authUser?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        role: 'ADMIN' | 'EXECUTOR';
        isActive: boolean;
      };
      sessionId?: string;
    }
  }
}

// Ensures this file is a module (required for global augmentation).
export type { Request };
