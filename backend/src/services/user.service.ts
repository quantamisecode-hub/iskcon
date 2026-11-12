import { prisma } from '../config/database.js';
import { userRepository } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { hashPassword, checkPasswordPolicy } from '../utils/password.js';
import { toSafeUser, type AuthenticatedUser } from '../utils/safeUser.js';
import type { DbClient } from '../repositories/user.repository.js';
import { disconnectUser, setUserRoleRoom } from '../lib/socket.js';

/**
 * USER MANAGEMENT SERVICE (Admin-only by route contract).
 *
 * Rules enforced HERE (server-side, not from client input):
 *  - adminId/actor always comes from the authenticated session.
 *  - role changes & deactivations are audited and protected:
 *      * an admin cannot change their own role,
 *      * an admin cannot deactivate themselves,
 *      * the last active ADMIN can never be demoted or deactivated.
 *  - no hard delete exists in this phase (isActive=false instead).
 *  - passwordHash is never part of any audit value or API response.
 */

export interface UserListFilters {
  role?: 'ADMIN' | 'EXECUTOR';
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export const userService = {
  async listUsers(filters: UserListFilters) {
    const where = {
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search } },
              { lastName: { contains: filters.search } },
              { email: { contains: filters.search } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      userRepository.findMany({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      userRepository.count(where),
    ]);
    return { users: users.map(toSafeUser), total, page: filters.page, pageSize: filters.pageSize };
  },

  async getUser(id: string): Promise<AuthenticatedUser> {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }
    return toSafeUser(user);
  },

  async createUser(
    actor: AuthenticatedUser,
    input: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role: 'ADMIN' | 'EXECUTOR';
    },
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthenticatedUser> {
    const email = input.email.toLowerCase();
    const policy = checkPasswordPolicy(input.password);
    if (!policy.ok) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: policy.reason });
    }

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'A user with this email already exists.',
      });
    }

    const passwordHash = await hashPassword(input.password);
    const created = await prisma.$transaction(async (tx) => {
      const user = await userRepository.create(
        { firstName: input.firstName, lastName: input.lastName, email, passwordHash, role: input.role },
        tx,
      );
      await auditLogRepository.create(
        {
          userId: actor.id,
          action:
            input.role === 'ADMIN' ? AUDIT_ACTIONS.CREATE_ADMIN : AUDIT_ACTIONS.CREATE_EXECUTOR,
          entityType: 'USER',
          entityId: user.id,
          newValues: { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, isActive: user.isActive },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return user;
    });
    return toSafeUser(created);
  },

  async updateUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    patch: { firstName?: string; lastName?: string; email?: string; role?: 'ADMIN' | 'EXECUTOR' },
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthenticatedUser> {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }

    if (patch.email && patch.email.toLowerCase() !== target.email) {
      const duplicate = await userRepository.findByEmail(patch.email);
      if (duplicate) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: 'A user with this email already exists.',
        });
      }
    }

    const roleChanged = patch.role !== undefined && patch.role !== target.role;
    if (roleChanged && actor.id === target.id) {
      throw new ApiError({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'You cannot change your own role.',
      });
    }

    const data = {
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.email !== undefined ? { email: patch.email.toLowerCase() } : {}),
      ...(roleChanged ? { role: patch.role } : {}),
    };

    if (roleChanged && patch.role === 'EXECUTOR') {
      // Last-admin guard: demoting an admin may never leave the system without one.
      await assertAdminRemains(target.id);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await userRepository.update(target.id, data, tx);
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: roleChanged ? AUDIT_ACTIONS.ROLE_CHANGE : AUDIT_ACTIONS.UPDATE_USER,
          entityType: 'USER',
          entityId: target.id,
          oldValues: {
            ...(patch.firstName !== undefined ? { firstName: target.firstName } : {}),
            ...(patch.lastName !== undefined ? { lastName: target.lastName } : {}),
            ...(patch.email !== undefined ? { email: target.email } : {}),
            ...(roleChanged ? { role: target.role } : {}),
          },
          newValues: {
            ...(patch.firstName !== undefined ? { firstName: user.firstName } : {}),
            ...(patch.lastName !== undefined ? { lastName: user.lastName } : {}),
            ...(patch.email !== undefined ? { email: user.email } : {}),
            ...(roleChanged ? { role: user.role } : {}),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return user;
    });
    if (roleChanged) setUserRoleRoom(updated.id, updated.role);
    return toSafeUser(updated);
  },

  async updateUserStatus(
    actor: AuthenticatedUser,
    targetUserId: string,
    status: 'ACTIVE' | 'INACTIVE',
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthenticatedUser> {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }
    const deactivate = status === 'INACTIVE';

    if (deactivate && actor.id === target.id) {
      throw new ApiError({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'You cannot deactivate your own account.',
      });
    }

    if (deactivate && target.role === 'ADMIN') {
      // Last-admin guard.
      await assertAdminRemains(target.id);
    }

    if (target.isActive === !deactivate) {
      // Already in requested state - idempotent success, no audit noise.
      return toSafeUser(target);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await userRepository.update(target.id, { isActive: !deactivate }, tx);
      // Revoke rather than rely on the isActive check alone, so reactivating
      // the account later does not silently revive old sessions.
      if (deactivate) await sessionRepository.revokeOthersForUser(target.id, undefined, tx);
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: deactivate ? AUDIT_ACTIONS.DEACTIVATE_USER : AUDIT_ACTIONS.ACTIVATE_USER,
          entityType: 'USER',
          entityId: target.id,
          oldValues: { isActive: target.isActive },
          newValues: { isActive: user.isActive },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return user;
    });

    if (deactivate) {
      // Defensive: end any active assignment rows touching this user.
      await prisma.adminExecutorAssignment.updateMany({
        where: { OR: [{ adminId: target.id }, { executorId: target.id }], isActive: true },
        data: { isActive: false, unassignedAt: new Date() },
      });
      disconnectUser(target.id);
    }
    return toSafeUser(updated);
  },

  /**
   * ADMIN override — reset a user's password without the old one.
   * Revoking ALL of the target's sessions forces a fresh login everywhere.
   */
  async resetPassword(
    actor: AuthenticatedUser,
    targetUserId: string,
    newPassword: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ reset: true }> {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }

    const policy = checkPasswordPolicy(newPassword);
    if (!policy.ok) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: policy.reason });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await userRepository.update(target.id, { passwordHash }, tx);
      await sessionRepository.revokeOthersForUser(target.id, undefined, tx);
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: AUDIT_ACTIONS.RESET_PASSWORD,
          entityType: 'USER',
          entityId: target.id,
          oldValues: { reset: true },
          newValues: { reset: true },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
    disconnectUser(target.id);
    return { reset: true };
  },

  /**
   * Hard-delete a user with audit-safe, FK-safe handling.
   * Blocked when: deleting yourself, deleting the last active admin,
   * or the user owns/created any event (business history must survive).
   */
  async deleteUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ deleted: true }> {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'User not found.' });
    }
    if (actor.id === target.id) {
      throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'You cannot delete your own account.' });
    }
    if (target.role === 'ADMIN') {
      const activeAdmins = await userRepository.countActiveAdmins();
      if (activeAdmins <= 1 && target.isActive) {
        throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'The system must always keep at least one active ADMIN.' });
      }
    }

    const eventCount = await prisma.event.count({
      where: { OR: [{ adminId: target.id }, { createdBy: target.id }] },
    });
    if (eventCount > 0) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: `This user owns ${eventCount} event(s). Delete those events first or deactivate the user instead.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // Anonymize audit entries (keep the trail, drop the identity).
      await tx.auditLog.updateMany({ where: { userId: target.id }, data: { userId: null } });
      // End + remove assignment history rows (FK restrict).
      await tx.adminExecutorAssignment.updateMany({
        where: { OR: [{ adminId: target.id }, { executorId: target.id }], isActive: true },
        data: { isActive: false, unassignedAt: new Date() },
      });
      await tx.adminExecutorAssignment.deleteMany({
        where: { OR: [{ adminId: target.id }, { executorId: target.id }] },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.user.delete({ where: { id: target.id } });
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: AUDIT_ACTIONS.DELETE_USER,
          entityType: 'USER',
          entityId: target.id,
          oldValues: { email: target.email, role: target.role, firstName: target.firstName, lastName: target.lastName },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
    disconnectUser(target.id);
    return { deleted: true };
  },
};

/** Ensures deactivating/demoting `userId` still leaves at least 1 active ADMIN. */
async function assertAdminRemains(userId: string, client: DbClient = prisma): Promise<void> {
  const activeAdmins = await userRepository.countActiveAdmins(client);
  const targetIsAdmin = false;
  void targetIsAdmin;
  const target = await userRepository.findById(userId, client);
  if (target?.role === 'ADMIN' && activeAdmins <= 1) {
    throw new ApiError({
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: 'The system must always keep at least one active ADMIN.',
    });
  }
}
