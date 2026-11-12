import type { Unit } from '@prisma/client';
import { unitRepository } from '../repositories/unit.repository.js';
import { auditLogService } from '../services/auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export interface UnitListFilters {
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export const unitService = {
  async list(filters: UnitListFilters) {
    const where = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
    };
    const [units, total] = await Promise.all([
      unitRepository.findAll({ where, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
      unitRepository.count(where),
    ]);
    return {
      units,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  },

  async getById(id: string): Promise<Unit> {
    const unit = await unitRepository.findById(id);
    if (!unit) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Unit not found.' });
    }
    return unit;
  },

  async create(actor: { id: string; role: string }, input: { name: string; symbol: string; unitType: string; isActive?: string }, context: { ipAddress?: string; userAgent?: string }): Promise<Unit> {
    const existingByName = await unitRepository.findByName(input.name);
    if (existingByName) {
      throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'A unit with this name already exists.' });
    }
    const existingBySymbol = await unitRepository.findBySymbol(input.symbol);
    if (existingBySymbol) {
      throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'A unit with this symbol already exists.' });
    }
    // BUG-VAL-001 fix: a unit created without an explicit isActive flag is
    // ACTIVE (matches categoryService.create). The old `isActive === 'true'`
    // coerced undefined to false, so every UI-created unit was born inactive,
    // hidden from default lists and rejected by food-item creation.
    const created = await unitRepository.create({ name: input.name, symbol: input.symbol, unitType: input.unitType, isActive: input.isActive === undefined ? true : input.isActive === 'true' });

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_UNIT,
      entityType: 'UNIT',
      entityId: created.id,
      newValues: { name: created.name, symbol: created.symbol, unitType: created.unitType, isActive: created.isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return created;
  },

  async update(id: string, actor: { id: string; role: string }, input: { name?: string; symbol?: string; unitType?: string; isActive?: string }, context: { ipAddress?: string; userAgent?: string }): Promise<Unit> {
    const unit = await unitRepository.findById(id);
    if (!unit) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Unit not found.' });
    }

    const data: Parameters<typeof unitRepository.update>[1] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.symbol !== undefined) data.symbol = input.symbol;
    if (input.unitType !== undefined) data.unitType = input.unitType;
    if (input.isActive !== undefined) data.isActive = input.isActive === 'true';

    const updated = await unitRepository.update(id, data);

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_UNIT,
      entityType: 'UNIT',
      entityId: updated.id,
      oldValues: { name: unit.name, symbol: unit.symbol, unitType: unit.unitType, isActive: unit.isActive },
      newValues: { name: updated.name, symbol: updated.symbol, unitType: updated.unitType, isActive: updated.isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  },

  async delete(id: string, actor: { id: string; role: string }, context: { ipAddress?: string; userAgent?: string }): Promise<void> {
    const unit = await unitRepository.findById(id);
    if (!unit) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Unit not found.' });
    }
    await unitRepository.update(id, { isActive: false });

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.DEACTIVATE_UNIT,
      entityType: 'UNIT',
      entityId: unit.id,
      oldValues: { name: unit.name, symbol: unit.symbol, isActive: unit.isActive },
      newValues: { name: unit.name, symbol: unit.symbol, isActive: false },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  },
};