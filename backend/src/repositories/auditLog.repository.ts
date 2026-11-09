import type { AuditLog, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { DbClient } from './user.repository.js';

/**
 * AUDIT LOG REPOSITORY
 * Append-only: audit entries are created, never updated or deleted.
 */
export interface CreateAuditEntry {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const auditLogRepository = {
  async create(entry: CreateAuditEntry, client: DbClient = prisma): Promise<AuditLog> {
    return client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        oldValues: entry.oldValues ? (entry.oldValues as Prisma.InputJsonValue) : undefined,
        newValues: entry.newValues ? (entry.newValues as Prisma.InputJsonValue) : undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  },
};
