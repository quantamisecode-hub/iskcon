import type { AdminExecutorAssignment, User } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { DbClient } from './user.repository.js';

/**
 * ASSIGNMENT REPOSITORY
 * History is append-only: `endAssignment` never deletes rows, it marks
 * isActive=false and stamps unassignedAt (transfer history preserved).
 */
export const assignmentRepository = {
  async create(
    data: { adminId: string; executorId: string },
    client: DbClient = prisma,
  ): Promise<AdminExecutorAssignment> {
    return client.adminExecutorAssignment.create({ data });
  },

  async findById(id: string, client: DbClient = prisma): Promise<AdminExecutorAssignment | null> {
    return client.adminExecutorAssignment.findUnique({ where: { id } });
  },

  async findActiveByExecutor(
    executorId: string,
    client: DbClient = prisma,
  ): Promise<AdminExecutorAssignment | null> {
    return client.adminExecutorAssignment.findFirst({ where: { executorId, isActive: true } });
  },

  async findManyForAdmin(
    adminId: string,
    options: { activeOnly: boolean },
  ): Promise<(AdminExecutorAssignment & { executor: User })[]> {
    return prisma.adminExecutorAssignment.findMany({
      where: {
        adminId,
        ...(options.activeOnly ? { isActive: true } : {}),
      },
      include: { executor: true },
      orderBy: { assignedAt: 'desc' },
    });
  },

  async findManyForExecutor(
    executorId: string,
  ): Promise<(AdminExecutorAssignment & { admin: User })[]> {
    return prisma.adminExecutorAssignment.findMany({
      where: { executorId, isActive: true },
      include: { admin: true },
      orderBy: { assignedAt: 'desc' },
    });
  },

  async endAssignment(
    id: string,
    client: DbClient = prisma,
  ): Promise<AdminExecutorAssignment> {
    return client.adminExecutorAssignment.update({
      where: { id },
      data: { isActive: false, unassignedAt: new Date() },
    });
  },
};
