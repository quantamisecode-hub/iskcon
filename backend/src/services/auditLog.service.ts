import type { DbClient } from '../repositories/user.repository.js';
import { auditLogRepository, type CreateAuditEntry } from '../repositories/auditLog.repository.js';
import { logger } from '../utils/logger.js';

/**
 * AUDIT LOG SERVICE
 *
 * Single entry point for the whole application's audit trail.
 * IMPORTANT: callers running inside a transaction should pass their
 * transaction client so the audit entry commits (or rolls back) TOGETHER
 * with the action it describes - audit integrity by construction.
 *
 * SECURITY: entries must never contain passwords, password hashes,
 * raw tokens, cookies, or environment secrets. Callers pass only
 * field-level old/new value objects (safeUser-style projections).
 */
export const auditLogService = {
  async createAuditLog(entry: CreateAuditEntry, client?: DbClient): Promise<void> {
    try {
      await auditLogRepository.create(entry, client);
    } catch (error) {
      // Audit failures must not break the primary action, but MUST be loud.
      logger.error({ err: error, action: entry.action }, 'Failed to write audit log');
    }
  },
};
