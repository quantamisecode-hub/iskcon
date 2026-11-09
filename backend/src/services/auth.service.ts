import { prisma } from '../config/database.js';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { hashPassword, checkPasswordPolicy, verifyPassword } from '../utils/password.js';
import { generateSessionToken, hashSessionToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { toSafeUser, type AuthenticatedUser } from '../utils/safeUser.js';
import type { User } from '@prisma/client';

/**
 * AUTH SERVICE - login, logout, user-record creation helpers.
 * Security properties:
 *  - login failure reasons are NEVER revealed to the client.
 *  - user.lastLoginAt update + session creation + audit entry are atomic.
 *  - audit failures never break authentication (auditLogService contract).
 */

interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export const authService = {
  async login(
    input: { email: string; password: string },
    context: LoginContext,
  ): Promise<{ token: string; user: AuthenticatedUser; expiresAt: Date }> {
    const user = await userRepository.findByEmail(input.email);

    if (!user || !user.isActive) {
      await auditLogRepository.create({
        userId: null,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'AUTH',
        newValues: { reason: user ? 'inactive_user' : 'unknown_or_invalid' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new ApiError({
        statusCode: 401,
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    }

    const passwordValid = await verifyPassword(user.passwordHash, input.password);
    if (!passwordValid) {
      await auditLogRepository.create({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'AUTH',
        entityId: user.id,
        newValues: { reason: 'wrong_password' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new ApiError({
        statusCode: 401,
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    }

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + env.SESSION_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    // Atomic: session row + lastLoginAt + audit entry succeed or fail together.
    const safe = await prisma.$transaction(async (tx) => {
      const session = await sessionRepository.create(
        {
          userId: user.id,
          tokenHash,
          expiresAt,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
        tx,
      );
      const updated = await userRepository.update(user.id, { lastLoginAt: new Date() }, tx);
      await auditLogRepository.create(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.LOGIN,
          entityType: 'AUTH',
          entityId: session.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return toSafeUser(updated);
    });

    return { token, user: safe, expiresAt };
  },

  async logout(input: {
    token: string | undefined;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    if (!input.token) return;

    const session = await sessionRepository.findByTokenHash(hashSessionToken(input.token));
    if (!session || session.revokedAt) return;

    await prisma.$transaction(async (tx) => {
      await sessionRepository.revoke(session.id, tx);
      await auditLogRepository.create(
        {
          userId: session.userId,
          action: AUDIT_ACTIONS.LOGOUT,
          entityType: 'AUTH',
          entityId: session.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        tx,
      );
    });
  },

  /** Creates a user (used by the seed and the Admin user-management service). */
  async createUserRecord(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'EXECUTOR';
  }): Promise<User> {
    const policy = checkPasswordPolicy(data.password);
    if (!policy.ok) {
      throw new ApiError({
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: policy.reason,
      });
    }
    const passwordHash = await hashPassword(data.password);
    const { firstName, lastName, role } = data;
    return userRepository.create({
      firstName,
      lastName,
      email: data.email.toLowerCase(),
      passwordHash,
      role,
    });
  },
};
