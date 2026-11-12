import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { materialReturnRepository, type SerializedMaterialReturn } from '../repositories/materialReturn.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { assignmentRepository } from '../repositories/assignment.repository.js';
import { auditLogService } from './auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { emitNotification, emitToUser, SOCKET_EVENT } from '../lib/socket.js';
import { transactionWithRetry } from '../lib/dbRetry.js';
import type { Actor } from './event.service.js';

/**
 * MATERIAL RETURN SERVICE (Phase 7 extension).
 *
 * GOLDEN RULES ENFORCED HERE:
 *  - Only an EXECUTOR creates a return; only an ADMIN accepts/rejects it.
 *  - Approval/creation NEVER move stock. Inventory is incremented ONLY inside
 *    an ACCEPTED return's transaction (atomic + concurrency-safe).
 *  - No over-return: accepted quantity is capped at the LIVE returnable
 *    (issued - acceptedReturned) recomputed under row locks at accept time.
 *  - No negative inventory: the balance is read FOR UPDATE and validated
 *    before the increment.
 *  - Returns exist only for actually issued material (§5/§41): eligibility is
 *    issued - acceptedReturned > 0, with NO event-status restriction.
 *  - Notifications/audit are emitted only after a successful commit.
 *  - Timelines are append-only; historical records are never rewritten.
 *
 * LOCK ORDER (deadlock-free vs. the issue path):
 *   return row -> the event's material-request rows -> inventory rows
 *   (inventory locked in ascending foodItemId order).
 */

const REVIEWABLE_STATUSES = ['PENDING_ADMIN_REVIEW'] as const;
const ACCEPTED_RETURN_STATUSES = ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'COMPLETED'] as const;

function notFound(message = 'Material return not found.'): ApiError {
  return new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message });
}

function forbidden(message = 'You do not have permission to access this material return.'): ApiError {
  return new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message });
}

function conflict(message: string): ApiError {
  return new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message });
}

function badRequest(message: string): ApiError {
  return new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * LIVE returnable per food item for one event:
 *   returnable = issued - acceptedReturned
 * Only ACCEPTED / PARTIALLY_ACCEPTED / COMPLETED returns reduce it.
 */
async function computeLiveReturnable(
  eventId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  excludeReturnId?: string,
): Promise<Map<string, number>> {
  const [issuedItems, returnedItems] = await Promise.all([
    client.materialRequestItem.findMany({
      where: { request: { eventId } },
      select: { foodItemId: true, issuedQuantity: true },
    }),
    client.materialReturnItem.findMany({
      where: {
        return: {
          eventId,
          status: { in: [...ACCEPTED_RETURN_STATUSES] },
          ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}),
        },
      },
      select: { foodItemId: true, acceptedReturnQuantity: true },
    }),
  ]);

  const issued = new Map<string, number>();
  for (const item of issuedItems) {
    issued.set(item.foodItemId, round3((issued.get(item.foodItemId) ?? 0) + Number(item.issuedQuantity)));
  }
  for (const item of returnedItems) {
    issued.set(item.foodItemId, round3((issued.get(item.foodItemId) ?? 0) - Number(item.acceptedReturnQuantity)));
  }
  const returnable = new Map<string, number>();
  for (const [foodItemId, value] of issued) returnable.set(foodItemId, Math.max(0, value));
  return returnable;
}

async function appendTimeline(
  tx: Prisma.TransactionClient,
  input: {
    returnId: string;
    actorId: string | null;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    message: string;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  await tx.materialReturnTimeline.create({
    data: {
      returnId: input.returnId,
      actorId: input.actorId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      message: input.message,
      metadata: input.metadata ?? undefined,
    },
  });
}

function serializeNotification(n: {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    referenceType: n.referenceType,
    referenceId: n.referenceId,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

function emitCreated(userId: string, rows: Array<Parameters<typeof serializeNotification>[0]>) {
  for (const row of rows) emitNotification(userId, serializeNotification(row));
}

async function loadReturnForActor(user: Actor, id: string): Promise<SerializedMaterialReturn> {
  const row = await materialReturnRepository.findById(id);
  if (!row) throw notFound();
  if (user.role === 'ADMIN') {
    if (row.adminId !== user.id) throw forbidden();
  } else if (row.requesterId !== user.id) {
    // Executors read their own returns; scope peers are covered by the event scope.
    const assignment = await assignmentRepository.findActiveByExecutor(user.id);
    if (!assignment || assignment.adminId !== row.adminId) throw forbidden();
  }
  return row;
}

export const materialReturnService = {
  /**
   * CREATE RETURN (executor only). Persists PENDING_ADMIN_REVIEW in one step
   * (DRAFT/SUBMITTED are reserved enum values — never faked).
   * Requested quantities are validated against the LIVE returnable computed
   * from issue + accepted-return history. No stock moves here.
   */
  async create(
    user: Actor,
    eventId: string,
    input: {
      reason?: string | null;
      reasonNote?: string | null;
      notes?: string | null;
      items: Array<{ foodItemId: string; quantity: number; reason?: string | null }>;
    },
    context: { ipAddress?: string; userAgent?: string },
  ) {
    if (user.role !== 'EXECUTOR') throw forbidden('Only an executor can create a material return.');

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, eventCode: true, status: true, adminId: true, createdBy: true },
    });
    if (!event) throw notFound('Event not found.');
    const assignment = await assignmentRepository.findActiveByExecutor(user.id);
    const inScope =
      event.adminId === user.id ||
      event.createdBy === user.id ||
      (assignment !== null && assignment.adminId === event.adminId);
    if (!inScope) throw forbidden('You do not have permission to access this event.');

    const reason = input.reason?.trim() || null;
    const reasonNote = input.reasonNote?.trim() || null;
    if (reason && reason.toUpperCase() === 'OTHER' && !reasonNote) {
      throw badRequest('A note is required when the reason is "Other".');
    }

    if (input.items.length === 0) throw badRequest('Select at least one material to return.');
    const seen = new Set<string>();
    for (const entry of input.items) {
      if (seen.has(entry.foodItemId)) throw badRequest('Each material can appear only once in a return.');
      seen.add(entry.foodItemId);
      const quantity = Number(entry.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw badRequest('Return quantity must be greater than zero.');
      }
    }

    const created = await transactionWithRetry(async (tx) => {
      // Serialise concurrent returns for the same event.
      await tx.$queryRaw`SELECT id FROM \`Event\` WHERE id = ${eventId} FOR UPDATE`;

      // Live returnable recomputed INSIDE the lock (over-return guard).
      const liveReturnable = await computeLiveReturnable(eventId, tx);
      const rows: Array<{ foodItemId: string; quantity: number }> = [];
      for (const entry of input.items) {
        const quantity = round3(Number(entry.quantity));
        const available = liveReturnable.get(entry.foodItemId) ?? 0;
        if (available <= 0) {
          throw conflict('Only material that has actually been issued can be returned.');
        }
        if (quantity > available) {
          throw conflict(`Only ${available} of this material is still returnable.`);
        }
        rows.push({ foodItemId: entry.foodItemId, quantity });
      }

      const year = new Date().getUTCFullYear();
      const returnCode = await materialReturnRepository.nextReturnCode(year, tx);

      // Snapshots (point-in-time) for the admin review screen.
      const issuedItems = await tx.materialRequestItem.findMany({
        where: { request: { eventId } },
        select: { foodItemId: true, unitId: true, issuedQuantity: true },
      });
      const acceptedItems = await tx.materialReturnItem.findMany({
        where: { return: { eventId, status: { in: [...ACCEPTED_RETURN_STATUSES] } } },
        select: { foodItemId: true, acceptedReturnQuantity: true },
      });
      const issuedByFood = new Map<string, number>();
      const unitByFood = new Map<string, string>();
      for (const item of issuedItems) {
        issuedByFood.set(item.foodItemId, round3((issuedByFood.get(item.foodItemId) ?? 0) + Number(item.issuedQuantity)));
        if (!unitByFood.has(item.foodItemId)) unitByFood.set(item.foodItemId, item.unitId);
      }
      const returnedByFood = new Map<string, number>();
      for (const item of acceptedItems) {
        returnedByFood.set(
          item.foodItemId,
          round3((returnedByFood.get(item.foodItemId) ?? 0) + Number(item.acceptedReturnQuantity)),
        );
      }

      const row = await tx.materialReturn.create({
        data: {
          returnCode,
          eventId,
          requesterId: user.id,
          adminId: event.adminId,
          status: 'PENDING_ADMIN_REVIEW',
          reason,
          reasonNote,
          notes: input.notes?.trim() || null,
          requestedAt: new Date(),
          items: {
            create: rows.map((entry) => {
              const unitId = unitByFood.get(entry.foodItemId);
              if (!unitId) {
                throw conflict('Only material that has actually been issued can be returned.');
              }
              return {
                foodItemId: entry.foodItemId,
                unitId,
                issuedQuantity: issuedByFood.get(entry.foodItemId) ?? 0,
                previouslyReturnedQuantity: returnedByFood.get(entry.foodItemId) ?? 0,
                requestedReturnQuantity: entry.quantity,
                reason: input.items.find((i) => i.foodItemId === entry.foodItemId)?.reason?.trim() || null,
              };
            }),
          },
        },
      });

      await appendTimeline(tx, {
        returnId: row.id,
        actorId: user.id,
        action: 'RETURN_REQUESTED',
        toStatus: 'PENDING_ADMIN_REVIEW',
        message: `Return ${returnCode} submitted for Admin review.`,
        metadata: {
          items: rows.map((entry) => ({ foodItemId: entry.foodItemId, quantity: entry.quantity })),
          reason,
          reasonNote,
        },
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.RETURN_REQUESTED,
          entityType: 'MATERIAL_RETURN',
          entityId: row.id,
          newValues: {
            returnCode,
            eventId,
            reason,
            reasonNote,
            items: rows.map((entry) => ({ foodItemId: entry.foodItemId, quantity: entry.quantity })),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      // §51 RETURN_REQUESTED -> the Admin (HIGH / RETURN).
      // A cancelled event prefixes the message so urgency is unmistakable.
      const cancelledPrefix = event.status === 'CANCELLED' ? 'Cancelled event: ' : '';
      const notifications = await notificationRepository.createMany(
        [event.adminId],
        {
          type: 'RETURN_REQUESTED',
          title: `Return ${returnCode} awaiting review`,
          message: `${cancelledPrefix}${user.id === event.adminId ? 'An executor' : 'Your executor'} requested to return issued materials for ${event.name} (${event.eventCode}). Please accept or reject it.`,
          referenceType: 'MATERIAL_RETURN',
          referenceId: row.id,
          category: 'RETURN',
          priority: 'HIGH',
        },
        tx,
      );

      const result = await materialReturnRepository.findById(row.id, tx);
      if (!result) throw notFound();
      return { result, notifications };
    });

    emitCreated(event.adminId, created.notifications);
    emitToUser(SOCKET_EVENT.MATERIAL_RETURN_CREATED, event.adminId, {
      returnId: created.result.id,
      returnCode: created.result.returnCode,
      eventId,
      status: created.result.status,
    });
    return created.result;
  },

  /** LIST — ADMIN: own events' returns. EXECUTOR: own + assigned-scope returns. */
  async list(
    user: Actor,
    filters: {
      /** Single status or comma-separated list (UI tabs). */
      status?: string;
      /** "true" → only returns whose review has completed (completedAt set). */
      completed?: 'true' | 'false';
      eventId?: string;
      search?: string;
      page: number;
      pageSize: number;
      sort: 'createdAt' | 'requestedAt' | 'status';
      order: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.MaterialReturnWhereInput = {};
    if (user.role === 'ADMIN') {
      where.adminId = user.id;
    } else {
      const assignment = await assignmentRepository.findActiveByExecutor(user.id);
      where.OR = [
        { requesterId: user.id },
        ...(assignment ? [{ adminId: assignment.adminId }] : []),
      ];
    }
    if (filters.status) {
      const statuses = filters.status.split(',').map((part) => part.trim()).filter(Boolean) as never[];
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (filters.completed === 'true') where.completedAt = { not: null };
    if (filters.completed === 'false') where.completedAt = null;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.search) {
      where.AND = [
        {
          OR: [
            { returnCode: { contains: filters.search } },
            { event: { name: { contains: filters.search } } },
          ],
        },
      ];
    }
    const orderBy: Prisma.MaterialReturnOrderByWithRelationInput =
      filters.sort === 'status'
        ? { status: filters.order }
        : filters.sort === 'requestedAt'
          ? { requestedAt: filters.order }
          : { createdAt: filters.order };
    return materialReturnRepository.list({
      where,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy,
    });
  },

  async getById(user: Actor, id: string) {
    return loadReturnForActor(user, id);
  },

  /**
   * ACCEPT (admin only, from PENDING_ADMIN_REVIEW). PARTIAL ACCEPT IS ALLOWED.
   * The ONLY stock-moving path for returns: increments inventory and writes an
   * InventoryTransaction(type = RETURN, referenceType = MATERIAL_RETURN) inside
   * the same transaction, after recomputing the live returnable under locks
   * (over-return guard). Full accept -> ACCEPTED + completedAt;
   * partial -> PARTIALLY_ACCEPTED with completedAt left null (§45 unresolved
   * remainder stays visible until the rest is accepted or rejected).
   */
  async accept(
    user: Actor,
    id: string,
    input: { items?: Array<{ itemId: string; acceptedQuantity: number }> } | undefined,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can accept a material return.');
    const existing = await loadReturnForActor(user, id);
    if (existing.adminId !== user.id) {
      throw forbidden('You can only review returns within your own scope.');
    }
    if (!REVIEWABLE_STATUSES.includes(existing.status as (typeof REVIEWABLE_STATUSES)[number])) {
      throw conflict('Only returns pending admin review can be accepted.');
    }

    // Default: accept every requested line in full. Optional per-item
    // quantities enable partial acceptance (0 rejects that line).
    const byId = new Map(existing.items.map((item) => [item.id, item]));
    const overrides = new Map<string, number>();
    for (const entry of input?.items ?? []) {
      if (overrides.has(entry.itemId)) throw badRequest('Each item can be accepted only once.');
      const item = byId.get(entry.itemId);
      if (!item) throw badRequest('One or more items do not belong to this return.');
      const quantity = Number(entry.acceptedQuantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw badRequest('Accepted quantity cannot be negative.');
      }
      if (quantity > item.requestedReturnQuantity) {
        throw badRequest('Accepted quantity cannot exceed the requested quantity.');
      }
      overrides.set(entry.itemId, round3(quantity));
    }

    const decisions = existing.items.map((item) => {
      const accepted = overrides.has(item.id) ? (overrides.get(item.id) ?? 0) : item.requestedReturnQuantity;
      return {
        itemId: item.id,
        foodItemId: item.foodItemId,
        acceptedQuantity: round3(accepted),
        rejectedQuantity: round3(item.requestedReturnQuantity - accepted),
      };
    });
    if (!decisions.some((decision) => decision.acceptedQuantity > 0)) {
      throw badRequest('At least one item must be accepted. Use Reject to decline the whole return.');
    }
    const isPartial = decisions.some((decision) => decision.rejectedQuantity > 0);

    const { result, notifications } = await transactionWithRetry(
      async (tx) => {
        // Lock order: return -> event's request rows -> inventory (by foodItemId).
        // Serializable isolation level serializes concurrent over-return checks:
        // two transactions accepting returns for the same food item will see
        // each other's committed accepted quantities on retry, preventing
        // over-return (accepting more than was ever issued).
        await tx.$queryRaw`SELECT id FROM \`MaterialReturn\` WHERE id = ${id} FOR UPDATE`;
        const current = await tx.materialReturn.findUnique({
          where: { id },
          include: { items: true, event: { select: { id: true, name: true, eventCode: true, status: true } } },
        });
      if (!current) throw notFound();
      if (!REVIEWABLE_STATUSES.includes(current.status as (typeof REVIEWABLE_STATUSES)[number])) {
        throw conflict('Only returns pending admin review can be accepted.');
      }

      await tx.$queryRaw`SELECT id FROM \`MaterialRequest\` WHERE eventId = ${current.eventId} FOR UPDATE`;
      const liveReturnable = await computeLiveReturnable(current.eventId, tx, id);

      const itemById = new Map(current.items.map((item) => [item.id, item]));
      // Inventory rows are locked in ascending foodItemId order to stay
      // deadlock-free against the issue path.
      const foodIds = [...new Set(decisions.map((d) => d.foodItemId))].sort();
      const balances = new Map<string, number>();
      for (const foodItemId of foodIds) {
        const rows = await tx.$queryRaw<Array<{ currentQuantity: number }>>`
          SELECT currentQuantity FROM \`Inventory\` WHERE foodItemId = ${foodItemId} FOR UPDATE
        `;
        balances.set(foodItemId, rows[0]?.currentQuantity ?? 0);
      }

      const posted: Array<{ foodItemId: string; quantity: number; balanceBefore: number; balanceAfter: number }> = [];
      const decisionByItem = new Map(decisions.map((d) => [d.itemId, d]));
      for (const itemId of [...byId.keys()].sort()) {
        const decision = decisionByItem.get(itemId);
        if (!decision) continue;
        if (decision.acceptedQuantity <= 0) {
          await tx.materialReturnItem.update({
            where: { id: itemId },
            data: {
              acceptedReturnQuantity: 0,
              rejectedReturnQuantity: itemById.get(itemId)?.requestedReturnQuantity ?? 0,
            },
          });
          continue;
        }
        // Over-return guard: never accept more than the LIVE returnable.
        const available = liveReturnable.get(decision.foodItemId) ?? 0;
        if (decision.acceptedQuantity > available) {
          throw conflict(`Only ${available} of this material is still returnable.`);
        }
        liveReturnable.set(decision.foodItemId, round3(available - decision.acceptedQuantity));

        const balanceBefore = balances.get(decision.foodItemId) ?? 0;
        const balanceAfter = round3(balanceBefore + decision.acceptedQuantity);
        await tx.inventory.update({
          where: { foodItemId: decision.foodItemId },
          data: { currentQuantity: balanceAfter },
        });
        await tx.inventoryTransaction.create({
          data: {
            foodItemId: decision.foodItemId,
            transactionType: 'RETURN',
            quantity: decision.acceptedQuantity,
            balanceBefore,
            balanceAfter,
            referenceType: 'MATERIAL_RETURN',
            referenceId: current.id,
            performedBy: user.id,
            remarks: `Returned against ${current.returnCode}`,
          },
        });
        balances.set(decision.foodItemId, balanceAfter);
        posted.push({
          foodItemId: decision.foodItemId,
          quantity: decision.acceptedQuantity,
          balanceBefore,
          balanceAfter,
        });

        await tx.materialReturnItem.update({
          where: { id: decision.itemId },
          data: {
            acceptedReturnQuantity: decision.acceptedQuantity,
            rejectedReturnQuantity: decision.rejectedQuantity,
          },
        });
      }

      const newStatus = isPartial ? 'PARTIALLY_ACCEPTED' : 'ACCEPTED';
      const now = new Date();
      await tx.materialReturn.update({
        where: { id },
        data: {
          status: newStatus,
          reviewedAt: current.reviewedAt ?? now,
          // §45: only a fully-reviewed return is COMPLETED; a partial keeps
          // completedAt null so the unresolved remainder stays visible.
          completedAt: isPartial ? current.completedAt : now,
        },
      });

      await appendTimeline(tx, {
        returnId: id,
        actorId: user.id,
        action: isPartial ? 'PARTIALLY_ACCEPTED' : 'ACCEPTED',
        fromStatus: current.status,
        toStatus: newStatus,
        message: isPartial
          ? `Return partially accepted. Restocked: ${posted.length} line(s). Remaining requested quantities stay unresolved.`
          : `Return accepted. Restocked: ${posted.length} line(s).`,
        metadata: { items: decisions, posted },
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: isPartial ? AUDIT_ACTIONS.RETURN_PARTIALLY_ACCEPTED : AUDIT_ACTIONS.RETURN_ACCEPTED,
          entityType: 'MATERIAL_RETURN',
          entityId: id,
          newValues: {
            status: newStatus,
            items: decisions,
            restocked: posted.map((entry) => ({ foodItemId: entry.foodItemId, quantity: entry.quantity })),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      if (posted.length > 0) {
        await auditLogService.createAuditLog(
          {
            userId: user.id,
            action: AUDIT_ACTIONS.INVENTORY_RETURN_POSTED,
            entityType: 'MATERIAL_RETURN',
            entityId: id,
            newValues: {
              returnCode: current.returnCode,
              entries: posted.map((entry) => ({
                foodItemId: entry.foodItemId,
                quantity: entry.quantity,
                balanceBefore: entry.balanceBefore,
                balanceAfter: entry.balanceAfter,
              })),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          tx,
        );
      }

      const updated = await materialReturnRepository.findById(id, tx);
      if (!updated) throw notFound();

      const rows = await notificationRepository.createMany(
        [updated.requesterId],
        {
          type: isPartial ? 'RETURN_PARTIALLY_ACCEPTED' : 'RETURN_ACCEPTED',
          title: `${updated.returnCode} ${isPartial ? 'partially accepted' : 'accepted'}`,
          message: isPartial
            ? `Your return for ${updated.event.name} was partially accepted. Some quantities remain unresolved and need another review.`
            : `Your return for ${updated.event.name} was accepted. ${posted.length} material line(s) were restocked into inventory.`,
          referenceType: 'MATERIAL_RETURN',
          referenceId: updated.id,
          category: 'RETURN',
          priority: 'NORMAL',
        },
        tx,
      );
      return { result: updated, notifications: rows };
    },
    'Serializable',
  );

    emitCreated(result.requesterId, notifications);
    emitToUser(
      isPartial ? SOCKET_EVENT.MATERIAL_RETURN_PARTIALLY_ACCEPTED : SOCKET_EVENT.MATERIAL_RETURN_ACCEPTED,
      result.requesterId,
      { returnId: result.id, returnCode: result.returnCode, status: result.status },
    );
    return result;
  },

  /**
   * REJECT (admin only, from PENDING_ADMIN_REVIEW). Whole-return decline:
   * no stock moves, every line is marked rejected, terminal REJECTED.
   */
  async reject(user: Actor, id: string, reason: string, context: { ipAddress?: string; userAgent?: string }) {
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can reject a material return.');
    const existing = await loadReturnForActor(user, id);
    if (existing.adminId !== user.id) {
      throw forbidden('You can only review returns within your own scope.');
    }
    if (!REVIEWABLE_STATUSES.includes(existing.status as (typeof REVIEWABLE_STATUSES)[number])) {
      throw conflict('Only returns pending admin review can be rejected.');
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw badRequest('A rejection reason is required.');

    const { result, notifications } = await transactionWithRetry(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`MaterialReturn\` WHERE id = ${id} FOR UPDATE`;
      const current = await tx.materialReturn.findUnique({ where: { id }, include: { items: true } });
      if (!current) throw notFound();
      if (!REVIEWABLE_STATUSES.includes(current.status as (typeof REVIEWABLE_STATUSES)[number])) {
        throw conflict('Only returns pending admin review can be rejected.');
      }

      const now = new Date();
      await tx.materialReturn.update({
        where: { id },
        data: { status: 'REJECTED', reviewedAt: current.reviewedAt ?? now, completedAt: now },
      });
      // Rejection rejects each line's requested quantity explicitly.
      for (const item of current.items) {
        await tx.materialReturnItem.update({
          where: { id: item.id },
          data: {
            acceptedReturnQuantity: 0,
            rejectedReturnQuantity: item.requestedReturnQuantity,
          },
        });
      }

      await appendTimeline(tx, {
        returnId: id,
        actorId: user.id,
        action: 'REJECTED',
        fromStatus: current.status,
        toStatus: 'REJECTED',
        message: `Return rejected. Reason: ${trimmedReason}`,
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.RETURN_REJECTED,
          entityType: 'MATERIAL_RETURN',
          entityId: id,
          newValues: { status: 'REJECTED', reason: trimmedReason },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const updated = await materialReturnRepository.findById(id, tx);
      if (!updated) throw notFound();

      const rows = await notificationRepository.createMany(
        [updated.requesterId],
        {
          type: 'RETURN_REJECTED',
          title: `${updated.returnCode} rejected`,
          message: `Your return for ${updated.event.name} was rejected. No stock was restocked. Reason: ${trimmedReason}`,
          referenceType: 'MATERIAL_RETURN',
          referenceId: updated.id,
          category: 'RETURN',
          priority: 'NORMAL',
        },
        tx,
      );
      return { result: updated, notifications: rows };
    },
    'Serializable',
  );

    emitCreated(result.requesterId, notifications);
    emitToUser(SOCKET_EVENT.MATERIAL_RETURN_REJECTED, result.requesterId, {
      returnId: result.id,
      returnCode: result.returnCode,
      status: result.status,
    });
    return result;
  },

  /**
   * Returnable lines for the "Return Materials" modal: one row per food item
   * with live issued / returned / returnable figures (§5/§41 eligibility).
   */
  async returnableLines(user: Actor, eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, eventCode: true, status: true, adminId: true, createdBy: true },
    });
    if (!event) throw notFound('Event not found.');
    const assignment = user.role === 'EXECUTOR' ? await assignmentRepository.findActiveByExecutor(user.id) : null;
    const inScope =
      user.role === 'ADMIN'
        ? event.adminId === user.id
        : event.adminId === user.id ||
          event.createdBy === user.id ||
          (assignment !== null && assignment.adminId === event.adminId);
    if (!inScope) throw forbidden('You do not have permission to access this event.');

    const returnable = await computeLiveReturnable(eventId);
    if (returnable.size === 0) {
      return { eventId, lines: [] };
    }
    const foods = await prisma.foodItem.findMany({
      where: { id: { in: [...returnable.keys()] } },
      select: {
        id: true,
        name: true,
        unit: { select: { symbol: true, name: true } },
        inventory: { select: { currentQuantity: true } },
      },
    });
    const lines = foods
      .filter((food) => (returnable.get(food.id) ?? 0) > 0)
      .map((food) => ({
        foodItemId: food.id,
        foodItemName: food.name,
        unitSymbol: food.unit.symbol,
        unitName: food.unit.name,
        availableStock: food.inventory?.currentQuantity ?? 0,
        returnableQuantity: returnable.get(food.id) ?? 0,
      }))
      .sort((a, b) => a.foodItemName.localeCompare(b.foodItemName));
    return { eventId, lines };
  },
};
