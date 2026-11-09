import { prisma } from '../config/database.js';
import { userRepository, type DbClient } from '../repositories/user.repository.js';
import { assignmentRepository } from '../repositories/assignment.repository.js';
import { auditLogRepository } from '../repositories/auditLog.repository.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { toSafeUser, type AuthenticatedUser } from '../utils/safeUser.js';

/**
 * ADMIN -> EXECUTOR ASSIGNMENT SERVICE
 *
 * Business rules enforced HERE (server-side):
 *  1. Only ADMIN can assign (route contract + service usage).
 *  2. Only EXECUTOR users can be assigned as executors.
 *  3. An ADMIN can never be assigned as an executor.
 *  4. An inactive user cannot be newly assigned.
 *  5. Duplicate ACTIVE assignments are impossible: each attempt takes a
 *     row-lock on the executor's user row inside a transaction, so two
 *     concurrent requests cannot both pass the check.
 *  6. History is never destroyed (unassignment = isActive=false + timestamp).
 *  7. The adminId ALWAYS comes from the authenticated session - the client
 *     cannot choose, and therefore cannot assign for another admin.
 */
export const assignmentService = {
  async listAssignments(actor: AuthenticatedUser, activeOnly: boolean) {
    const rows = await assignmentRepository.findManyForAdmin(actor.id, { activeOnly });
    return rows.map((row) => ({
      id: row.id,
      assignedAt: row.assignedAt,
      unassignedAt: row.unassignedAt,
      isActive: row.isActive,
      executor: toSafeUser(row.executor),
    }));
  },

  async createAssignment(
    actor: AuthenticatedUser,
    executorId: string,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const executor = await userRepository.findById(executorId);
    if (!executor) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Executor not found.' });
    }
    if (executor.role !== 'EXECUTOR') {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Only EXECUTOR users can be assigned.',
      });
    }
    if (!executor.isActive) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Inactive users cannot be assigned.',
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      // Row lock on the executor's user row serializes concurrent assignments.
      await prisma.$queryRaw`SELECT id FROM user WHERE id = ${executorId} FOR UPDATE`;

      const existing = await assignmentRepository.findActiveByExecutor(
        executorId,
        tx as unknown as DbClient,
      );
      if (existing) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: 'This executor already has an active assignment to an admin.',
        });
      }

      const assignment = await assignmentRepository.create(
        { adminId: actor.id, executorId },
        tx as unknown as DbClient,
      );
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: AUDIT_ACTIONS.ASSIGN_EXECUTOR,
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
          newValues: { adminId: actor.id, executorId, isActive: true },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx as unknown as DbClient,
      );
      return assignment;
    });

    return {
      id: created.id,
      assignedAt: created.assignedAt,
      isActive: created.isActive,
      executor: toSafeUser(executor),
    };
  },

  async endAssignment(
    actor: AuthenticatedUser,
    assignmentId: string,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const assignment = await assignmentRepository.findById(assignmentId);
    if (!assignment) {
      throw new ApiError({
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Assignment not found.',
      });
    }
    // Rule 7: an admin may only manage THEIR OWN assignments.
    if (assignment.adminId !== actor.id) {
      throw new ApiError({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'You can only manage your own assignments.',
      });
    }
    if (!assignment.isActive) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This assignment has already been ended.',
      });
    }

    const ended = await prisma.$transaction(async (tx) => {
      const updated = await assignmentRepository.endAssignment(assignment.id, tx as unknown as DbClient);
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: AUDIT_ACTIONS.UNASSIGN_EXECUTOR,
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
          oldValues: { isActive: true, unassignedAt: assignment.unassignedAt },
          newValues: { isActive: false, unassignedAt: updated.unassignedAt },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx as unknown as DbClient,
      );
      return updated;
    });

    return { id: ended.id, assignedAt: ended.assignedAt, unassignedAt: ended.unassignedAt, isActive: ended.isActive };
  },
};
