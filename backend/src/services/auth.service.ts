import { transactionWithRetry } from '../lib/dbRetry.js';
import { disconnectSession, disconnectUser } from '../lib/socket.js';
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
    // BUG-DB-002 fix: replays the whole transaction on InnoDB deadlocks (P2034)
    // so a contended audit write can never 500 a valid login.
    const safe = await transactionWithRetry(async (tx) => {
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

    await transactionWithRetry(async (tx) => {
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
    disconnectSession(session.id);
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

  /**
   * Update own profile (first/last name, email).
   * Changing the login email requires the current password (account-takeover guard).
   */
  async updateProfile(
    userId: string,
    input: { firstName?: string; lastName?: string; email?: string; currentPassword?: string },
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }

    const data: { firstName?: string; lastName?: string; email?: string } = {};
    if (input.firstName !== undefined) data.firstName = input.firstName.trim();
    if (input.lastName !== undefined) data.lastName = input.lastName.trim();

    if (input.email !== undefined) {
      const nextEmail = input.email.toLowerCase();
      if (nextEmail !== user.email) {
        if (!input.currentPassword) {
          throw new ApiError({
            statusCode: 400,
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Your current password is required to change the login email.',
          });
        }
        const passwordValid = await verifyPassword(user.passwordHash, input.currentPassword);
        if (!passwordValid) {
          throw new ApiError({
            statusCode: 401,
            code: ERROR_CODES.INVALID_CREDENTIALS,
            message: 'Current password is incorrect.',
          });
        }
        const existing = await userRepository.findByEmail(nextEmail);
        if (existing && existing.id !== user.id) {
          throw new ApiError({
            statusCode: 409,
            code: ERROR_CODES.CONFLICT,
            message: 'A user with this email already exists.',
          });
        }
        data.email = nextEmail;
      }
    }

    const updated = await userRepository.update(user.id, data);

    await auditLogRepository.create({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE_PROFILE,
      entityType: 'USER',
      entityId: user.id,
      oldValues: { firstName: user.firstName, lastName: user.lastName, email: user.email },
      newValues: { firstName: updated.firstName, lastName: updated.lastName, email: updated.email },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return toSafeUser(updated);
  },

  /**
   * Change own password. Verifies the current password, enforces the policy,
   * rehashes, and revokes every OTHER session (current session stays valid).
   */
  async changePassword(
    userId: string,
    sessionId: string | undefined,
    input: { currentPassword: string; newPassword: string },
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }

    const passwordValid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!passwordValid) {
      throw new ApiError({
        statusCode: 401,
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Current password is incorrect.',
      });
    }
    if (input.currentPassword === input.newPassword) {
      throw new ApiError({
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'New password must differ from the current password.',
      });
    }

    const policy = checkPasswordPolicy(input.newPassword);
    if (!policy.ok) {
      throw new ApiError({
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: policy.reason,
      });
    }

    const passwordHash = await hashPassword(input.newPassword);
    // BUG-DB-002 fix: same deadlock-replay protection as login/logout.
    await transactionWithRetry(async (tx) => {
      await userRepository.update(user.id, { passwordHash }, tx);
      await sessionRepository.revokeOthersForUser(user.id, sessionId, tx);
      await auditLogRepository.create(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.CHANGE_PASSWORD,
          entityType: 'USER',
          entityId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
    disconnectUser(user.id, sessionId);
  },

  /** Set or remove the own avatar (data URL). Size/format validated in the route schema. */
  async setAvatar(
    userId: string,
    avatarUrl: string | null,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }

    const updated = await userRepository.update(userId, { avatarUrl });

    await auditLogRepository.create({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE_AVATAR,
      entityType: 'USER',
      entityId: user.id,
      newValues: { hasAvatar: avatarUrl !== null },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return toSafeUser(updated);
  },
};
