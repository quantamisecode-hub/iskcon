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
 *  1. Only an ADMIN may assign executors (route contract + service usage).
 *  2. Only EXECUTOR users can be assigned as executors.
 *  3. An ADMIN can never be assigned as an executor.
 *  4. An inactive user cannot be newly assigned.
 *  5. Duplicate ACTIVE assignments are impossible: each attempt takes a
 *     row-lock on the executor's user row inside a transaction, so two
 *     concurrent requests cannot both pass the check.
 *  6. History is never destroyed (unassignment = isActive=false + timestamp).
 *  7. The default admin side is the authenticated session (backward compatible).
 *     An explicit `adminId` lets an ADMIN place an executor under ANY active
 *     admin - cross-admin assignment is an administrative capability, is
 *     audited with both actor and target admin, and preserves history.
 */
export const assignmentService = {
  async listAssignments(actor: AuthenticatedUser, query: { activeOnly: boolean; page: number; pageSize: number }) {
    if (actor.role !== 'ADMIN') {
      throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'You do not have permission to perform this action.' });
    }
    const { activeOnly, page, pageSize } = query;
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      assignmentRepository.findManyGlobal({ activeOnly, skip, take: pageSize }),
      assignmentRepository.countGlobal({ activeOnly }),
    ]);
    return {
      assignments: rows.map((row) => ({
        id: row.id,
        assignedAt: row.assignedAt,
        unassignedAt: row.unassignedAt,
        isActive: row.isActive,
        admin: toSafeUser(row.admin),
        executor: toSafeUser(row.executor),
      })),
      total,
      page,
      pageSize,
    };
  },

  async createAssignment(
    actor: AuthenticatedUser,
    executorId: string,
    context: { ipAddress?: string; userAgent?: string },
    targetAdminId?: string,
  ) {
    if (actor.role !== 'ADMIN') {
      throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'You do not have permission to perform this action.' });
    }

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

    const adminId = targetAdminId ?? actor.id;
    const targetAdmin = await userRepository.findById(adminId);
    if (!targetAdmin || targetAdmin.role !== 'ADMIN') {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Target must be an ADMIN user.' });
    }
    if (!targetAdmin.isActive) {
      throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'An inactive admin cannot receive assignments.' });
    }

    const created = await prisma.$transaction(async (tx) => {
      // Row lock on the executor's user row serializes concurrent assignments.
      await prisma.$queryRaw`SELECT id FROM user WHERE id = ${executorId} FOR UPDATE`;

      // End any existing ACTIVE assignment (any admin) - history is preserved.
      const existing = await assignmentRepository.findActiveByExecutor(
        executorId,
        tx as unknown as DbClient,
      );
      if (existing) {
        if (existing.adminId === adminId) {
          throw new ApiError({
            statusCode: 409,
            code: ERROR_CODES.CONFLICT,
            message: 'This executor is already assigned to this admin.',
          });
        }
        await assignmentRepository.endAssignment(existing.id, tx as unknown as DbClient);
        await auditLogRepository.create(
          {
            userId: actor.id,
            action: AUDIT_ACTIONS.UNASSIGN_EXECUTOR,
            entityType: 'ASSIGNMENT',
            entityId: existing.id,
            oldValues: { isActive: true, adminId: existing.adminId },
            newValues: { isActive: false, unassignedAt: new Date(), reassignedTo: adminId },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          tx as unknown as DbClient,
        );
      }

      const assignment = await assignmentRepository.create(
        { adminId, executorId },
        tx as unknown as DbClient,
      );
      await auditLogRepository.create(
        {
          userId: actor.id,
          action: AUDIT_ACTIONS.ASSIGN_EXECUTOR,
          entityType: 'ASSIGNMENT',
          entityId: assignment.id,
          newValues: {
            adminId,
            executorId,
            isActive: true,
            actorAdminId: actor.id,
            isCrossAdmin: adminId !== actor.id,
            isReassignment: Boolean(existing),
          },
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
      admin: toSafeUser(targetAdmin),
      executor: toSafeUser(executor),
    };
  },

  async endAssignment(
    actor: AuthenticatedUser,
    assignmentId: string,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    if (actor.role !== 'ADMIN') {
      throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'You do not have permission to perform this action.' });
    }

    const assignment = await assignmentRepository.findById(assignmentId);
    if (!assignment) {
      throw new ApiError({
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Assignment not found.',
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
          oldValues: { isActive: true, unassignedAt: assignment.unassignedAt, adminId: assignment.adminId },
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
