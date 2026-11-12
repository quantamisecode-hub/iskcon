import type { FoodItem } from '@prisma/client';
import { foodItemRepository } from '../repositories/foodItem.repository.js';
import { categoryRepository } from '../repositories/category.repository.js';
import { unitRepository } from '../repositories/unit.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { inventoryTransactionRepository } from '../repositories/inventoryTransaction.repository.js';
import { auditLogService } from '../services/auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { prisma } from '../config/database.js';
import type { Prisma } from '@prisma/client';
import { emitNotification, emitToRole, SOCKET_EVENT } from '../lib/socket.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { transactionWithRetry } from '../lib/dbRetry.js';
import { logger } from '../utils/logger.js';

/**
 * Persist a stock-health alert as an inbox notification for every active ADMIN
 * and emit it live (notification:new + stock:alert). Never throws — alerts are
 * best-effort and must not break the stock movement that triggered them.
 *
 * Exported so the Phase 7 material-issue path raises the SAME alarms as a
 * manual stock-out (issue is the largest stock-out in the system).
 */
type FoodWithUnit = NonNullable<Awaited<ReturnType<typeof foodItemRepository.findById>>>;
export async function maybeEmitStockAlert(food: FoodWithUnit | null, balanceAfter: number) {
  try {
    const unitSymbol = food?.unit?.symbol ?? 'units';
    const name = food?.name ?? 'Item';
    let type: string | null = null;
    let severity: 'danger' | 'warning' | 'info' = 'info';
    let title = '';
    let detail = '';
    if (balanceAfter === 0) {
      type = 'OUT_OF_STOCK';
      severity = 'danger';
      title = `${name} is out of stock`;
      detail = `Current stock 0 ${unitSymbol}. Reorder immediately.`;
    } else if (balanceAfter <= (food?.minimumStock ?? 0)) {
      type = 'LOW_STOCK';
      severity = 'warning';
      title = `${name} is at or below minimum stock`;
      detail = `${balanceAfter} ${unitSymbol} remaining — minimum ${food?.minimumStock ?? 0} ${unitSymbol}.`;
    } else if (balanceAfter <= (food?.reorderLevel ?? 0)) {
      type = 'REORDER_REQUIRED';
      severity = 'info';
      title = `${name} needs reorder`;
      detail = `${balanceAfter} ${unitSymbol} remaining — reorder level ${food?.reorderLevel ?? 0} ${unitSymbol}.`;
    }
    if (!type) return;

    const payload = { severity, type, title, detail, foodItemId: food?.id, quantity: balanceAfter, unit: unitSymbol, at: new Date().toISOString() };
    // Live broadcast for any admin dashboard listening
    emitToRole('ADMIN', SOCKET_EVENT.STOCK_ALERT, payload);

    // Persist to every active admin's inbox so it survives refresh and deep-links to the item.
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
    const created = await notificationRepository.createMany(
      admins.map((a) => a.id),
      {
        type,
        title,
        message: detail,
        referenceType: 'FOOD_ITEM',
        referenceId: food?.id ?? null,
      },
    );
    for (const row of created) {
      emitNotification(row.userId, {
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        isRead: row.isRead,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      });
    }
  } catch {
    // best-effort — do not fail stock movements for notification errors
  }
}

export interface FoodItemListFilters {
  isActive?: boolean;
  categoryId?: string;
  unitId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export const foodItemService = {
  async list(filters: FoodItemListFilters) {
    const where: Prisma.FoodItemWhereInput = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      // MySQL: no `mode` option (Postgres-only); the default collation is already case-insensitive.
      ...(filters.search ? { name: { contains: filters.search } } : {}),
    };
    const [foodItems, total] = await Promise.all([
      foodItemRepository.findAll({ where, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
      foodItemRepository.count(where),
    ]);
    return {
      foodItems,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  },

  async getById(id: string): Promise<FoodItem> {
    const food = await foodItemRepository.findById(id);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    return food;
  },

  async create(actor: { id: string; role: string }, input: {
    name: string;
    description?: string;
    categoryName: string;
    unitSymbol: string;
    minimumStock: number;
    reorderLevel: number;
    isActive?: string;
  }, context: { ipAddress?: string; userAgent?: string }): Promise<FoodItem> {
    const category = await categoryRepository.findByName(input.categoryName);
    if (!category || !category.isActive) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid or inactive category. Create the category first.' });
    }
    const unit = await unitRepository.findBySymbol(input.unitSymbol);
    if (!unit || !unit.isActive) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid or inactive unit.' });
    }

    const existing = await foodItemRepository.findByName(input.name);
    if (existing) {
      throw new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message: 'A food item with this name already exists.' });
    }

    const food = await foodItemRepository.create({
      name: input.name,
      description: input.description,
      categoryId: category.id,
      unitId: unit.id,
      minimumStock: input.minimumStock,
      reorderLevel: input.reorderLevel,
      isActive: input.isActive === undefined ? true : input.isActive === 'true',
    });

    // Create the initial inventory record at ZERO — stock must enter only via the audited Stock In flow.
    await inventoryRepository.updateQuantity(food.id, 0);

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_FOOD_ITEM,
      entityType: 'FOOD_ITEM',
      entityId: food.id,
      newValues: { name: food.name, category: category.name, unit: unit.symbol, minimumStock: food.minimumStock, reorderLevel: food.reorderLevel },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return food;
  },

  async update(id: string, actor: { id: string; role: string }, input: {
    name?: string;
    description?: string;
    categoryName?: string;
    unitSymbol?: string;
    minimumStock?: number;
    reorderLevel?: number;
    isActive?: string;
  }, context: { ipAddress?: string; userAgent?: string }): Promise<FoodItem> {
    const food = await foodItemRepository.findById(id);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }

    const data: Parameters<typeof foodItemRepository.update>[1] = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.minimumStock !== undefined) data.minimumStock = input.minimumStock;
    if (input.reorderLevel !== undefined) data.reorderLevel = input.reorderLevel;
    if (input.isActive !== undefined) data.isActive = input.isActive === 'true';

    if (input.categoryName !== undefined) {
      const category = await categoryRepository.findByName(input.categoryName);
      if (!category || !category.isActive) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid or inactive category.' });
      }
      data.categoryId = category.id;
    }
    if (input.unitSymbol !== undefined) {
      const unit = await unitRepository.findBySymbol(input.unitSymbol);
      if (!unit || !unit.isActive) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid or inactive unit.' });
      }
      data.unitId = unit.id;
    }

    const updated = await foodItemRepository.update(id, data);

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_FOOD_ITEM,
      entityType: 'FOOD_ITEM',
      entityId: updated.id,
      oldValues: { name: food.name, category: food.category?.name, unit: food.unit?.symbol, minimumStock: food.minimumStock, reorderLevel: food.reorderLevel },
      newValues: { name: updated.name, category: updated.category?.name, unit: updated.unit?.symbol, minimumStock: updated.minimumStock, reorderLevel: updated.reorderLevel },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  },

  async delete(id: string, actor: { id: string; role: string }, context: { ipAddress?: string; userAgent?: string }): Promise<void> {
    const food = await foodItemRepository.findById(id);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    await foodItemRepository.update(id, { isActive: false });

    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.DEACTIVATE_FOOD_ITEM,
      entityType: 'FOOD_ITEM',
      entityId: food.id,
      oldValues: { name: food.name, isActive: food.isActive },
      newValues: { name: food.name, isActive: false },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  },

  /** Stock In operation — concurrency-safe with row locking, idempotency, and deadlock retry. */
  async addStock(foodItemId: string, quantity: number, performedBy: string, context: { ipAddress?: string; userAgent?: string }, referenceType?: string, referenceId?: string, idempotencyKey?: string) {
    const food = await foodItemRepository.findById(foodItemId);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Quantity must be positive.' });
    }

    const result = await transactionWithRetry(async (tx) => {
      // Row lock: serialize all mutations on this inventory record.
      await tx.$queryRaw`SELECT currentQuantity FROM \`Inventory\` WHERE foodItemId = ${foodItemId} FOR UPDATE`;

      // Idempotency: duplicate request with the same key returns the existing result.
      if (idempotencyKey) {
        const existing = await tx.inventoryTransaction.findFirst({
          where: { foodItemId, idempotencyKey },
        });
        if (existing) {
          const inventory = await tx.inventory.findUnique({ where: { foodItemId } });
          logger.info({
            requestId: context.ipAddress,
            foodItemId,
            movementType: 'STOCK_IN',
            requestedQuantity: quantity,
            previousQuantity: inventory?.currentQuantity ?? 0,
            resultingQuantity: inventory?.currentQuantity ?? 0,
            status: 'IDEMPOTENT_REPLAY',
            idempotencyKey,
            performedBy,
          }, 'Stock-in idempotent replay — movement already applied');
          return { foodItem: food, inventory, transaction: existing, idempotent: true };
        }
      }

      const inventory = await tx.inventory.findUnique({ where: { foodItemId } });
      const balanceBefore = inventory?.currentQuantity ?? 0;
      const newQuantity = balanceBefore + quantity;

      const updatedInventory = await tx.inventory.upsert({
        where: { foodItemId },
        update: { currentQuantity: newQuantity },
        create: { foodItemId, currentQuantity: newQuantity },
      });

      const transaction = await tx.inventoryTransaction.create({
        data: {
          foodItemId,
          transactionType: 'STOCK_IN',
          quantity,
          balanceBefore,
          balanceAfter: newQuantity,
          referenceType,
          referenceId,
          performedBy,
          idempotencyKey,
        },
      });

      return { foodItem: food, inventory: updatedInventory, transaction, idempotent: false };
    });

    // Post-commit side effects (run once, never retried).
    if (!result.idempotent) {
      await auditLogService.createAuditLog({
        userId: performedBy,
        action: AUDIT_ACTIONS.STOCK_IN,
        entityType: 'INVENTORY',
        entityId: result.transaction.id,
        newValues: { foodItemId: food.id, quantity, balanceAfter: result.inventory!.currentQuantity },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      await maybeEmitStockAlert(food, result.inventory!.currentQuantity);

      logger.info({
        foodItemId,
        movementType: 'STOCK_IN',
        requestedQuantity: quantity,
        previousQuantity: result.transaction.balanceBefore,
        resultingQuantity: result.transaction.balanceAfter,
        status: 'COMMITTED',
        transactionId: result.transaction.id,
        idempotencyKey,
        performedBy,
      }, 'Stock-in committed');
    }

    return result;
  },

  /** Stock Out operation with negative stock protection. Concurrency-safe with row locking, idempotency, and deadlock retry. */
  async removeStock(foodItemId: string, quantity: number, performedBy: string, context: { ipAddress?: string; userAgent?: string },
    options: { referenceType?: string | null; referenceId?: string | null; remarks?: string | null } = {}, idempotencyKey?: string) {
    const food = await foodItemRepository.findById(foodItemId);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Quantity must be positive.' });
    }

    const result = await transactionWithRetry(async (tx) => {
      // Row lock: serialize all mutations on this inventory record.
      await tx.$queryRaw`SELECT currentQuantity FROM \`Inventory\` WHERE foodItemId = ${foodItemId} FOR UPDATE`;

      // Idempotency: duplicate request with the same key returns the existing result.
      if (idempotencyKey) {
        const existing = await tx.inventoryTransaction.findFirst({
          where: { foodItemId, idempotencyKey },
        });
        if (existing) {
          const inventory = await tx.inventory.findUnique({ where: { foodItemId } });
          logger.info({
            requestId: context.ipAddress,
            foodItemId,
            movementType: 'STOCK_OUT',
            requestedQuantity: quantity,
            previousQuantity: inventory?.currentQuantity ?? 0,
            resultingQuantity: inventory?.currentQuantity ?? 0,
            status: 'IDEMPOTENT_REPLAY',
            idempotencyKey,
            performedBy,
          }, 'Stock-out idempotent replay — movement already applied');
          return { foodItem: food, inventory, transaction: existing, idempotent: true };
        }
      }

      const inventory = await tx.inventory.findUnique({ where: { foodItemId } });
      const balanceBefore = inventory?.currentQuantity ?? 0;

      if (balanceBefore < quantity) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: `Insufficient inventory. Requested ${quantity} units, but only ${balanceBefore} units are available.`,
        });
      }

      const newQuantity = balanceBefore - quantity;

      const updatedInventory = await tx.inventory.upsert({
        where: { foodItemId },
        update: { currentQuantity: newQuantity },
        create: { foodItemId, currentQuantity: newQuantity },
      });

      const transaction = await tx.inventoryTransaction.create({
        data: {
          foodItemId,
          transactionType: 'STOCK_OUT',
          quantity,
          balanceBefore,
          balanceAfter: newQuantity,
          referenceType: options.referenceType ?? null,
          referenceId: options.referenceId ?? null,
          remarks: options.remarks?.trim() || null,
          performedBy,
          idempotencyKey,
        },
      });

      return { foodItem: food, inventory: updatedInventory, transaction, idempotent: false };
    });

    // Post-commit side effects (run once, never retried).
    if (!result.idempotent) {
      await auditLogService.createAuditLog({
        userId: performedBy,
        action: AUDIT_ACTIONS.STOCK_OUT,
        entityType: 'INVENTORY',
        entityId: result.transaction.id,
        newValues: { foodItemId: food.id, quantity, balanceAfter: result.inventory!.currentQuantity },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      await maybeEmitStockAlert(food, result.inventory!.currentQuantity);

      logger.info({
        foodItemId,
        movementType: 'STOCK_OUT',
        requestedQuantity: quantity,
        previousQuantity: result.transaction.balanceBefore,
        resultingQuantity: result.transaction.balanceAfter,
        status: 'COMMITTED',
        transactionId: result.transaction.id,
        idempotencyKey,
        performedBy,
      }, 'Stock-out committed');
    }

    return result;
  },

  /** Stock Adjustment — concurrency-safe with row locking, idempotency, and deadlock retry. */
  async adjustStock(foodItemId: string, direction: 'IN' | 'OUT', quantity: number, reason: string, performedBy: string, context: { ipAddress?: string; userAgent?: string }, idempotencyKey?: string) {
    const food = await foodItemRepository.findById(foodItemId);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Quantity must be positive.' });
    }

    const result = await transactionWithRetry(async (tx) => {
      // Row lock: serialize all mutations on this inventory record.
      await tx.$queryRaw`SELECT currentQuantity FROM \`Inventory\` WHERE foodItemId = ${foodItemId} FOR UPDATE`;

      // Idempotency: duplicate request with the same key returns the existing result.
      if (idempotencyKey) {
        const existing = await tx.inventoryTransaction.findFirst({
          where: { foodItemId, idempotencyKey },
        });
        if (existing) {
          const inventory = await tx.inventory.findUnique({ where: { foodItemId } });
          logger.info({
            requestId: context.ipAddress,
            foodItemId,
            movementType: `ADJUSTMENT_${direction}`,
            requestedQuantity: quantity,
            previousQuantity: inventory?.currentQuantity ?? 0,
            resultingQuantity: inventory?.currentQuantity ?? 0,
            status: 'IDEMPOTENT_REPLAY',
            idempotencyKey,
            performedBy,
          }, 'Stock adjustment idempotent replay — movement already applied');
          return { foodItem: food, inventory, transaction: existing, idempotent: true };
        }
      }

      const inventory = await tx.inventory.findUnique({ where: { foodItemId } });
      const balanceBefore = inventory?.currentQuantity ?? 0;

      let newQuantity: number;
      if (direction === 'IN') {
        newQuantity = balanceBefore + quantity;
      } else {
        if (balanceBefore < quantity) {
          throw new ApiError({
            statusCode: 409,
            code: ERROR_CODES.CONFLICT,
            message: `Insufficient inventory. Requested ${quantity} units, but only ${balanceBefore} units are available.`,
          });
        }
        newQuantity = balanceBefore - quantity;
      }

      const updatedInventory = await tx.inventory.upsert({
        where: { foodItemId },
        update: { currentQuantity: newQuantity },
        create: { foodItemId, currentQuantity: newQuantity },
      });

      const transaction = await tx.inventoryTransaction.create({
        data: {
          foodItemId,
          transactionType: 'ADJUSTMENT',
          quantity: direction === 'IN' ? quantity : -Math.abs(quantity),
          balanceBefore,
          balanceAfter: newQuantity,
          performedBy,
          remarks: reason,
          idempotencyKey,
        },
      });

      return { foodItem: food, inventory: updatedInventory, transaction, idempotent: false };
    });

    // Post-commit side effects (run once, never retried).
    if (!result.idempotent) {
      const actionName = direction === 'IN' ? AUDIT_ACTIONS.STOCK_IN : AUDIT_ACTIONS.STOCK_OUT;
      await auditLogService.createAuditLog({
        userId: performedBy,
        action: actionName,
        entityType: 'INVENTORY',
        entityId: result.transaction.id,
        newValues: { foodItemId: food.id, quantity, direction, balanceAfter: result.inventory!.currentQuantity },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      await maybeEmitStockAlert(food, result.inventory!.currentQuantity);

      logger.info({
        foodItemId,
        movementType: `ADJUSTMENT_${direction}`,
        requestedQuantity: quantity,
        previousQuantity: result.transaction.balanceBefore,
        resultingQuantity: result.transaction.balanceAfter,
        status: 'COMMITTED',
        transactionId: result.transaction.id,
        idempotencyKey,
        performedBy,
      }, 'Stock adjustment committed');
    }

    return result;
  },

  /** Get current stock status */
  async getStockStatus(foodItemId: string) {
    const food = await foodItemRepository.findById(foodItemId);
    if (!food) {
      return { status: 'NOT_FOUND' as const, food };
    }

    const inventory = await inventoryRepository.findByFoodItemId(foodItemId);
    const currentQty = inventory?.currentQuantity ?? 0;
    const minStock = food.minimumStock;
    const reorderLvl = food.reorderLevel;

    let status: 'NORMAL' | 'LOW' | 'CRITICAL' | 'OUT_OF_STOCK' = 'NORMAL';
    if (currentQty === 0) status = 'OUT_OF_STOCK';
    else if (currentQty <= minStock) status = 'CRITICAL';
    else if (currentQty <= reorderLvl) status = 'LOW';

    return { status, currentQty, minStock, reorderLvl };
  },

  /** Get ledger transactions for a food item */
  async getLedger(foodItemId: string, input: { page: number; pageSize: number }) {
    const transactions = await inventoryTransactionRepository.findByFoodItemId(foodItemId, { take: input.pageSize, skip: (input.page - 1) * input.pageSize });
    const total = await prisma.inventoryTransaction.count({ where: { foodItemId } });
    return { transactions, total, page: input.page, pageSize: input.pageSize };
  },

  /** Detail for /inventory/items/:id — stock summary, recent ledger, related events/requests. Scoped to the actor's admin scope. */
  async getDetail(foodItemId: string, actor?: { id: string; role: string }) {
    const food = await foodItemRepository.findById(foodItemId);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    const [inventory, recentTransactions, relatedEventMaterials, relatedRequests, status] = await Promise.all([
      inventoryRepository.findByFoodItemId(foodItemId),
      prisma.inventoryTransaction.findMany({
        where: { foodItemId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.eventMaterial.findMany({
        where: { foodItemId, isDraft: false },
        include: { eventDish: { include: { event: { select: { id: true, name: true, eventCode: true, eventDate: true, adminId: true, createdBy: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.materialRequestItem.findMany({
        where: { foodItemId },
        include: { request: { select: { id: true, requestCode: true, status: true, createdAt: true, adminId: true, requestedById: true } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.getStockStatus(foodItemId),
    ]);
    // Scope related events/requests to the actor (P2 IDOR fix): only events in the actor's admin scope.
    let inScopeEvents = relatedEventMaterials;
    let inScopeRequests = relatedRequests;
    if (actor) {
      if (actor.role === 'ADMIN') {
        inScopeEvents = relatedEventMaterials.filter((m) => m.eventDish.event.adminId === actor.id);
        inScopeRequests = relatedRequests.filter((r) => r.request.adminId === actor.id);
      } else {
        // EXECUTOR: only events they created (assigned scope needs assignment lookup — keep conservative: own events only).
        inScopeEvents = relatedEventMaterials.filter((m) => m.eventDish.event.createdBy === actor.id);
        inScopeRequests = relatedRequests.filter((r) => r.request.requestedById === actor.id);
      }
    }
    const currentQty = inventory?.currentQuantity ?? 0;
    return {
      foodItem: food,
      inventory,
      currentQuantity: currentQty,
      status: status.status,
      stockSummary: {
        currentQuantity: currentQty,
        minimumStock: food.minimumStock,
        reorderLevel: food.reorderLevel,
      },
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        transactionType: tx.transactionType,
        quantity: tx.quantity,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        referenceType: tx.referenceType,
        referenceId: tx.referenceId,
        remarks: tx.remarks,
        performedBy: tx.performedBy,
        createdAt: tx.createdAt.toISOString(),
      })),
      relatedEvents: inScopeEvents.map((m) => ({
        eventId: m.eventDish.event.id,
        eventName: m.eventDish.event.name,
        eventCode: m.eventDish.event.eventCode,
        eventDate: m.eventDish.event.eventDate.toISOString().slice(0, 10),
        plannedQuantity: Number(m.plannedQuantity),
      })),
      relatedRequests: inScopeRequests.map((r) => ({
        requestId: r.request.id,
        requestCode: r.request.requestCode,
        status: r.request.status,
        createdAt: r.request.createdAt.toISOString(),
        quantity: Number(r.plannedQuantity),
      })),
    };
  },

  /** KPIs for Current Stock header (deterministic, backend-calculated). */
  async stockSummary() {
    const rows = await prisma.inventory.findMany({
      include: { foodItem: { select: { isActive: true, minimumStock: true, reorderLevel: true } } },
    });
    let totalItems = 0;
    let totalStockLines = 0;
    let lowStock = 0;
    let reorderRequired = 0;
    let outOfStock = 0;
    let healthy = 0;
    for (const row of rows) {
      if (row.foodItem.isActive) totalItems += 1;
      totalStockLines += 1;
      const qty = row.currentQuantity;
      if (qty === 0) outOfStock += 1;
      else if (qty <= row.foodItem.minimumStock) lowStock += 1;
      else if (qty <= row.foodItem.reorderLevel) reorderRequired += 1;
      else healthy += 1;
    }
    return { totalItems, totalStockLines, lowStock, reorderRequired, outOfStock, healthy };
  },

  /** Reconciliation: verifies inventory.currentQuantity equals the ledger-derived balance.
   *  Returns the computed expected quantity, the actual quantity, and whether they match.
   *
   *  Expected = openingBalance + SUM(signed ledger changes)
   *  where openingBalance = balanceBefore of the oldest transaction (or 0 if none).
   *  STOCK_IN / RETURN add (+quantity); STOCK_OUT removes (−quantity);
   *  ADJUSTMENT is already signed.
   */
  async reconcileInventory(foodItemId: string) {
    const inventory = await prisma.inventory.findUnique({ where: { foodItemId } });
    const actual = inventory?.currentQuantity ?? 0;

    const transactions = await prisma.inventoryTransaction.findMany({
      where: { foodItemId },
      select: { quantity: true, transactionType: true, balanceBefore: true },
      orderBy: { createdAt: 'asc' },
    });

    const openingBalance = Number(transactions[0]?.balanceBefore ?? 0);

    const signedSum = transactions.reduce((acc, t) => {
      const q = Number(t.quantity);
      if (t.transactionType === 'STOCK_OUT') return acc - q;
      return acc + q;
    }, 0);

    const expected = openingBalance + signedSum;

    return {
      foodItemId,
      openingQuantityAssumed: openingBalance,
      expectedQuantity: expected,
      actualQuantity: actual,
      reconciled: expected === actual,
      difference: actual - expected,
      transactionCount: transactions.length,
    };
  },
};