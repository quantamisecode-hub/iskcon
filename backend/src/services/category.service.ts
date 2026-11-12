import type { Category } from '@prisma/client';
import { categoryRepository } from '../repositories/category.repository.js';
import { foodItemRepository } from '../repositories/foodItem.repository.js';
import { auditLogService } from '../services/auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

export interface CategoryListFilters {
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export const categoryService = {
  async list(filters: CategoryListFilters) {
    const where = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' } }
        : {}),
    };
    const [categories, total] = await Promise.all([
      categoryRepository.findAll({ where, take: filters.pageSize, skip: (filters.page - 1) * filters.pageSize }),
      categoryRepository.count(where),
    ]);
    return {
      categories,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  },

  async getById(id: string): Promise<Category> {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Category not found.' });
    }
    return category;
  },

  async create(actor: { id: string; role: string }, input: { name: string; description?: string }, context: { ipAddress?: string; userAgent?: string }): Promise<Category> {
    const existing = await categoryRepository.findByName(input.name);
    if (existing) {
      throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'A category with this name already exists.' });
    }
    const created = await categoryRepository.create({ name: input.name, description: input.description, isActive: true });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_CATEGORY,
      entityType: 'CATEGORY',
      entityId: created.id,
      newValues: { name: created.name, description: created.description, isActive: created.isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return created;
  },

  async update(id: string, actor: { id: string; role: string }, input: { name?: string; description?: string; isActive?: string }, context: { ipAddress?: string; userAgent?: string }): Promise<Category> {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Category not found.' });
    }

    // Deactivating is refused while any food item references the category —
    // dropdowns would then contain a dead category and stock reporting would lie.
    if (input.isActive === 'false' && category.isActive) {
      const linked = await foodItemRepository.count({ categoryId: id });
      if (linked > 0) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: `“${category.name}” is linked to ${linked} food item(s) and cannot be deactivated. Move those items to another category first.`,
        });
      }
    }

    const data: Parameters<typeof categoryRepository.update>[1] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.isActive !== undefined) data.isActive = input.isActive === 'true';

    const updated = await categoryRepository.update(id, data);
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_CATEGORY,
      entityType: 'CATEGORY',
      entityId: updated.id,
      oldValues: { name: category.name, description: category.description, isActive: category.isActive },
      newValues: { name: updated.name, description: updated.description, isActive: updated.isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return updated;
  },

  async delete(id: string, actor: { id: string; role: string }, context: { ipAddress?: string; userAgent?: string }): Promise<void> {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Category not found.' });
    }
    // Hard delete is refused while any food item references the category.
    const linked = await foodItemRepository.count({ categoryId: id });
    if (linked > 0) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: `“${category.name}” is linked to ${linked} food item(s) and cannot be deleted. Move those items to another category first.`,
      });
    }
    await categoryRepository.delete(id);
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.DELETE_CATEGORY,
      entityType: 'CATEGORY',
      entityId: category.id,
      oldValues: { name: category.name, description: category.description, isActive: category.isActive },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  },
};