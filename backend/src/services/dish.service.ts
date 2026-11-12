import type { Prisma } from '@prisma/client';
import { dishRepository } from '../repositories/dish.repository.js';
import { dishMaterialRepository } from '../repositories/dishMaterial.repository.js';
import { foodItemRepository } from '../repositories/foodItem.repository.js';
import { unitRepository } from '../repositories/unit.repository.js';
import { auditLogService } from './auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import type { Actor } from './event.service.js';

/**
 * DISH SERVICE (Phase 4)
 *  - ADMIN: full Dish Master management + DishMaterial template management.
 *  - EXECUTOR: read-only access to ACTIVE dishes (for event planning).
 *  - Inactive dishes stay valid for historical EventMaterial records.
 */
export const dishService = {
  async list(user: Actor, query: { search?: string; isActive?: boolean; page: number; pageSize: number }) {
    const where: Prisma.DishWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search ? { name: { contains: query.search } } : {}),
      // Executors only ever see active dishes.
      ...(user.role !== 'ADMIN' ? { isActive: true } : {}),
    };

    const [dishes, total] = await Promise.all([
      dishRepository.findAll({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      dishRepository.count(where),
    ]);

    return { dishes, total, page: query.page, pageSize: query.pageSize };
  },

  async getById(user: Actor, id: string) {
    const dish = await dishRepository.findById(id);
    if (!dish) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }
    if (user.role !== 'ADMIN' && !dish.isActive) {
      // Executors must not reach inactive dishes, even by direct id.
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }
    return dish;
  },

  async create(actor: Actor, input: { name: string; description?: string | null; isActive?: boolean }, context: { ipAddress?: string; userAgent?: string }) {
    const existing = await dishRepository.findByName(input.name);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'A dish with this name already exists.',
      });
    }

    const dish = await dishRepository.create({
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
    });

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_DISH,
      entityType: 'DISH',
      entityId: dish.id,
      newValues: { name: dish.name, isActive: dish.isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return dish;
  },

  async update(id: string, actor: Actor, input: { name?: string; description?: string | null }, context: { ipAddress?: string; userAgent?: string }) {
    const dish = await dishRepository.findById(id);
    if (!dish) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }

    if (input.name !== undefined) {
      const existing = await dishRepository.findByName(input.name);
      if (existing && existing.id !== id) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: 'A dish with this name already exists.',
        });
      }
    }

    const data: Prisma.DishUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description ?? null;

    const updated = await dishRepository.update(id, data);

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_DISH,
      entityType: 'DISH',
      entityId: id,
      oldValues: { name: dish.name, description: dish.description },
      newValues: { ...input },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  },

  async setStatus(id: string, actor: Actor, isActive: boolean, context: { ipAddress?: string; userAgent?: string }) {
    const dish = await dishRepository.findById(id);
    if (!dish) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }

    const updated = await dishRepository.update(id, { isActive });

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: isActive ? AUDIT_ACTIONS.ACTIVATE_DISH : AUDIT_ACTIONS.DEACTIVATE_DISH,
      entityType: 'DISH',
      entityId: id,
      oldValues: { isActive: dish.isActive },
      newValues: { isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  },

  // ---------------------------------------------------------------
  // DISH MATERIALS (recipe template mapping)
  // ---------------------------------------------------------------

  async listMaterials(dishId: string) {
    const dish = await dishRepository.findById(dishId);
    if (!dish) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }
    return dishMaterialRepository.listByDish(dishId);
  },

  async addMaterial(dishId: string, actor: Actor, input: { foodItemId: string; quantityPerPerson?: number | null; unitId?: string }, context: { ipAddress?: string; userAgent?: string }) {
    const dish = await dishRepository.findById(dishId);
    if (!dish) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }

    const food = await foodItemRepository.findById(input.foodItemId);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    if (!food.isActive) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This food item is deactivated and cannot be added.',
      });
    }

    const existing = await dishMaterialRepository.findExisting(dishId, input.foodItemId);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This food item is already mapped to the dish.',
      });
    }

    const unitId = input.unitId ?? food.unitId;
    const unit = await unitRepository.findById(unitId);
    if (!unit) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid unit.' });
    }

    const material = await dishMaterialRepository.create({
      dishId,
      foodItemId: food.id,
      quantityPerPerson: input.quantityPerPerson ?? null,
      unitId: unit.id,
    });

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_DISH_MATERIAL,
      entityType: 'DISH_MATERIAL',
      entityId: material.id,
      newValues: { dish: dish.name, foodItem: food.name, unit: unit.symbol, quantityPerPerson: input.quantityPerPerson ?? null },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return material;
  },

  async updateMaterial(dishId: string, materialId: string, actor: Actor, input: { quantityPerPerson?: number | null; unitId?: string }, context: { ipAddress?: string; userAgent?: string }) {
    const material = await dishMaterialRepository.findById(materialId);
    if (!material || material.dishId !== dishId) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Material line not found.' });
    }

    const data: { quantityPerPerson?: number | null; unitId?: string } = {};
    if (input.quantityPerPerson !== undefined) data.quantityPerPerson = input.quantityPerPerson;
    if (input.unitId !== undefined) {
      const unit = await unitRepository.findById(input.unitId);
      if (!unit) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid unit.' });
      }
      data.unitId = unit.id;
    }

    const updated = await dishMaterialRepository.update(materialId, data);

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_DISH_MATERIAL,
      entityType: 'DISH_MATERIAL',
      entityId: materialId,
      oldValues: { quantityPerPerson: material.quantityPerPerson },
      newValues: { ...input },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  },

  async removeMaterial(dishId: string, materialId: string, actor: Actor, context: { ipAddress?: string; userAgent?: string }) {
    const material = await dishMaterialRepository.findById(materialId);
    if (!material || material.dishId !== dishId) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Material line not found.' });
    }

    await dishMaterialRepository.delete(materialId);

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.REMOVE_DISH_MATERIAL,
      entityType: 'DISH_MATERIAL',
      entityId: materialId,
      oldValues: { foodItem: material.foodItem.name, dish: dishId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { deleted: true };
  },
};
