import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { eventRepository } from '../repositories/event.repository.js';
import { eventDishRepository } from '../repositories/eventDish.repository.js';
import { eventMaterialRepository } from '../repositories/eventMaterial.repository.js';
import { dishRepository } from '../repositories/dish.repository.js';
import { foodItemRepository } from '../repositories/foodItem.repository.js';
import { unitRepository } from '../repositories/unit.repository.js';
import { assignmentRepository } from '../repositories/assignment.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { auditLogService } from './auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { emitNotification, emitToUser, SOCKET_EVENT } from '../lib/socket.js';
import { transactionWithRetry, withDeadlockRetry } from '../lib/dbRetry.js';
import { logger } from '../utils/logger.js';

/**
 * EVENT SERVICE (Phase 4)
 *
 * Planning ONLY. No stock is deducted, reserved, or transacted here - ever.
 * Every read/write is scoped:
 *   ADMIN    -> own events (adminId = actor.id)
 *   EXECUTOR -> events within the assigned Admin's scope (plus anything they created)
 *
 * Status machine: DRAFT -> PLANNING -> READY -> COMPLETED ; DRAFT/PLANNING/READY -> CANCELLED.
 * COMPLETED and CANCELLED are terminal. All other transitions are rejected.
 */

export type Actor = { id: string; role: 'ADMIN' | 'EXECUTOR' | string };

const EVENT_EDITABLE_STATUSES = new Set(['DRAFT', 'PLANNING']);

/** Allowed status transitions. Everything else is DENIED. */
const STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PLANNING', 'CANCELLED'],
  PLANNING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const SORTABLE = new Set(['eventDate', 'name', 'createdAt', 'status', 'numberOfPeople', 'eventCode']);

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function serializeDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function notFound(message = 'Event not found.'): ApiError {
  return new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message });
}

function forbidden(message = 'You do not have permission to access this event.'): ApiError {
  return new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message });
}

function conflict(message: string): ApiError {
  return new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message });
}

function badRequest(message: string): ApiError {
  return new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message });
}

/** Scope filter for lists/calendar/counts. Executor with no assignment sees nothing. */
async function resolveScope(user: Actor): Promise<Prisma.EventWhereInput> {
  if (user.role === 'ADMIN') {
    return { adminId: user.id };
  }
  const assignment = await assignmentRepository.findActiveByExecutor(user.id);
  if (!assignment) {
    return { adminId: '__unassigned__' }; // matches no row
  }
  return { OR: [{ adminId: assignment.adminId }, { createdBy: user.id }] };
}

function isInScope(scope: Prisma.EventWhereInput, event: { adminId: string; createdBy: string }): boolean {
  const or = (scope as { OR?: { adminId?: string; createdBy?: string }[] }).OR;
  if (or) {
    return or.some((clause) => clause.adminId === event.adminId || clause.createdBy === event.createdBy);
  }
  return (scope as { adminId?: string }).adminId === event.adminId;
}

/**
 * Loads an event and verifies the actor may access it.
 * Throws 404 when it does not exist (no existence leak), 403 when out of scope.
 */
async function loadEventForActor(user: Actor, id: string) {
  const event = await eventRepository.findById(id);
  if (!event) throw notFound();
  const scope = await resolveScope(user);
  if (!isInScope(scope, event)) throw forbidden();
  return event;
}

/** Enforces the "planning fields editable" rule (DRAFT/PLANNING only). */
function assertEditableForPlanning(event: { status: string; name?: string }) {
  if (!EVENT_EDITABLE_STATUSES.has(event.status)) {
    throw new ApiError({
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: `This event can no longer be edited while it is ${event.status}.`,
    });
  }
}

function summaryOf(event: { dishes: { materials: unknown[] }[] }) {
  const totalDishes = event.dishes.length;
  const totalMaterialLines = event.dishes.reduce((sum, d) => sum + d.materials.length, 0);
  return { totalDishes, totalMaterialLines };
}

/** Statuses an event may be cancelled from. COMPLETED / CANCELLED are terminal. */
const CANCELLABLE_STATUSES = new Set(['DRAFT', 'PLANNING', 'READY']);

/** Requests with no physical issue yet — these become CANCELLED_BY_EVENT. */
const UNISSUED_REQUEST_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] as const;

/** Statuses that still represent live demand in the material summary. */
const LIVE_REQUEST_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PARTIALLY_ISSUED',
  'ISSUED',
  'REJECTED',
] as const;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatEventDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Post-commit realtime for event lifecycle notifications (§49 matrix).
 * Same payload shape as EVENT_CANCELLED so every client sees one consistent
 * notification:new event. Emission is best-effort: a socket hiccup can never
 * fail the business operation that already committed.
 */
function emitEventLifecycleNotifications(rows: Awaited<ReturnType<typeof notificationRepository.createMany>>): void {
  for (const row of rows) {
    emitNotification(row.userId, {
      id: row.id,
      type: row.type,
      category: row.category,
      priority: row.priority,
      title: row.title,
      message: row.message,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    });
  }
}

/**
 * Delivers an event lifecycle notification batch AFTER the business operation
 * has committed. Retried on deadlock, then logged — never thrown: a transient
 * notification-insert conflict must not turn an already-committed operation
 * into a 500 (the client would retry a request that already succeeded).
 */
async function deliverEventNotifications(
  recipientIds: Set<string>,
  data: Parameters<typeof notificationRepository.createMany>[1],
): Promise<void> {
  try {
    const rows = await withDeadlockRetry(() => notificationRepository.createMany([...recipientIds], data));
    emitEventLifecycleNotifications(rows);
  } catch (err) {
    logger.warn({ err, type: data.type, referenceId: data.referenceId }, 'Event notification delivery failed after commit');
  }
}

export const eventService = {
  // ---------------------------------------------------------------
  // EVENTS
  // ---------------------------------------------------------------

  async list(user: Actor, query: {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    adminId?: string;
    createdBy?: string;
    page: number;
    pageSize: number;
    sort: string;
    order: 'asc' | 'desc';
  }) {
    const scope = await resolveScope(user);

    const filters: Prisma.EventWhereInput[] = [scope];
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search } },
          { eventCode: { contains: query.search } },
        ],
      });
    }
    if (query.status) filters.push({ status: query.status as never });
    if (query.dateFrom) filters.push({ eventDate: { gte: toDateOnly(query.dateFrom) } });
    if (query.dateTo) filters.push({ eventDate: { lte: toDateOnly(query.dateTo) } });
    if (query.adminId) filters.push({ adminId: query.adminId });
    if (query.createdBy) filters.push({ createdBy: query.createdBy });

    const where: Prisma.EventWhereInput = { AND: filters };
    const sortField = SORTABLE.has(query.sort) ? query.sort : 'eventDate';
    const orderBy = { [sortField]: query.order } as Prisma.EventOrderByWithRelationInput;

    const [events, total] = await Promise.all([
      eventRepository.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy }),
      eventRepository.count(where),
    ]);

    const ids = events.map((e) => e.id);
    const [dishGroups, materialLines] = ids.length
      ? await Promise.all([
          prisma.eventDish.groupBy({ by: ['eventId'], where: { eventId: { in: ids } }, _count: { id: true } }),
          prisma.eventDish.findMany({
            where: { eventId: { in: ids } },
            select: { eventId: true, _count: { select: { materials: true } } },
          }),
        ])
      : [[], []];

    const dishCount = new Map(dishGroups.map((g) => [g.eventId, g._count.id]));
    const materialCount = new Map<string, number>();
    for (const row of materialLines) {
      materialCount.set(row.eventId, (materialCount.get(row.eventId) ?? 0) + row._count.materials);
    }

    return {
      events: events.map((event) => ({
        id: event.id,
        eventCode: event.eventCode,
        name: event.name,
        eventDate: serializeDateOnly(event.eventDate),
        startTime: event.startTime,
        endTime: event.endTime,
        numberOfPeople: event.numberOfPeople,
        location: event.location,
        status: event.status,
        createdAt: event.createdAt,
        admin: event.admin,
        creator: event.creator,
        dishCount: dishCount.get(event.id) ?? 0,
        materialLineCount: materialCount.get(event.id) ?? 0,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getById(user: Actor, id: string) {
    const event = await loadEventForActor(user, id);
    return {
      ...serializeEvent(event),
      summary: summaryOf(event),
    };
  },

  async create(user: Actor, input: {
    name: string;
    description?: string | null;
    eventDate: string;
    startTime: string;
    endTime?: string | null;
    numberOfPeople: number;
    location?: string | null;
    notes?: string | null;
    status?: 'DRAFT' | 'PLANNING';
  }, context: { ipAddress?: string; userAgent?: string }) {
    let adminId: string;
    if (user.role === 'ADMIN') {
      adminId = user.id;
    } else {
      const assignment = await assignmentRepository.findActiveByExecutor(user.id);
      if (!assignment) {
        throw new ApiError({
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: 'You are not assigned to an admin yet. Ask an administrator to assign you first.',
        });
      }
      adminId = assignment.adminId;
    }

    const event = await transactionWithRetry(async (tx) => {
      const year = new Date().getUTCFullYear();
      const eventCode = await eventRepository.nextEventCode(year, tx);
      return tx.event.create({
        data: {
          eventCode,
          name: input.name,
          description: input.description ?? null,
          eventDate: toDateOnly(input.eventDate),
          startTime: input.startTime,
          endTime: input.endTime ?? null,
          numberOfPeople: input.numberOfPeople,
          location: input.location ?? null,
          notes: input.notes ?? null,
          status: input.status ?? 'DRAFT',
          adminId,
          createdBy: user.id,
        },
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, email: true } },
          creator: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
    });

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE_EVENT,
      entityType: 'EVENT',
      entityId: event.id,
      newValues: { eventCode: event.eventCode, name: event.name, eventDate: input.eventDate, numberOfPeople: event.numberOfPeople, adminId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    // §49 EVENT_CREATED — notify the OTHER side, never the actor:
    //   ADMIN creates    -> the admin's assigned executors
    //   EXECUTOR creates -> the event's admin
    const recipientIds = new Set<string>();
    if (user.role === 'ADMIN') {
      const assigned = await assignmentRepository.findManyForAdmin(adminId, { activeOnly: true });
      for (const row of assigned) recipientIds.add(row.executorId);
    } else {
      recipientIds.add(adminId);
    }
    recipientIds.delete(user.id);
    await deliverEventNotifications(recipientIds, {
      type: 'EVENT_CREATED',
      title: `New event: ${event.name}`,
      message:
        user.role === 'ADMIN'
          ? `${event.name} (${event.eventCode}) is scheduled for ${formatEventDate(event.eventDate)} and is open for planning and material requests.`
          : `${event.name} (${event.eventCode}) was created for ${formatEventDate(event.eventDate)} and needs your review.`,
      referenceType: 'EVENT',
      referenceId: event.id,
      category: 'EVENT',
      priority: 'NORMAL',
    });

    return serializeEvent({ ...event, dishes: [] });
  },

  async update(user: Actor, id: string, input: {
    name?: string;
    description?: string | null;
    eventDate?: string;
    startTime?: string;
    endTime?: string | null;
    numberOfPeople?: number;
    location?: string | null;
    notes?: string | null;
  }, context: { ipAddress?: string; userAgent?: string }) {
    const event = await loadEventForActor(user, id);
    assertEditableForPlanning(event);

    const data: Prisma.EventUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description ?? null;
    if (input.eventDate !== undefined) data.eventDate = toDateOnly(input.eventDate);
    if (input.startTime !== undefined) data.startTime = input.startTime;
    if (input.endTime !== undefined) data.endTime = input.endTime ?? null;
    if (input.numberOfPeople !== undefined) data.numberOfPeople = input.numberOfPeople;
    if (input.location !== undefined) data.location = input.location ?? null;
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    const effectiveStart = input.startTime ?? event.startTime;
    const effectiveEnd = input.endTime !== undefined ? input.endTime : event.endTime;
    if (effectiveEnd && effectiveEnd < effectiveStart) {
      throw new ApiError({
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'endTime must be greater than or equal to startTime.',
      });
    }

    await eventRepository.update(id, data);

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE_EVENT,
      entityType: 'EVENT',
      entityId: id,
      oldValues: { name: event.name, eventDate: serializeDateOnly(event.eventDate), startTime: event.startTime, endTime: event.endTime, numberOfPeople: event.numberOfPeople, location: event.location },
      newValues: { ...input, eventDate: input.eventDate },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const updated = await eventService.getById(user, id);
    return updated;
  },

  async changeStatus(user: Actor, id: string, status: string, context: { ipAddress?: string; userAgent?: string }, reason?: string) {
    // Cancellation is a lifecycle of its own (reason + cascade + notifications),
    // so PATCH /events/:id/status { CANCELLED } delegates to cancel().
    if (status === 'CANCELLED') {
      return eventService.cancel(user, id, { reason: reason ?? 'Cancelled by admin.' }, context);
    }
    const event = await loadEventForActor(user, id);
    const allowed = STATUS_TRANSITIONS[event.status] ?? [];
    if (!allowed.includes(status)) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: `Cannot move event from ${event.status} to ${status}.`,
      });
    }

    await eventRepository.update(id, { status: status as never });

    await auditLogService.createAuditLog({
      userId: user.id,
      action: status === 'CANCELLED' ? AUDIT_ACTIONS.CANCEL_EVENT : AUDIT_ACTIONS.CHANGE_EVENT_STATUS,
      entityType: 'EVENT',
      entityId: id,
      oldValues: { status: event.status },
      newValues: { status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    // §49 milestones — READY and COMPLETED notify creator + event admin +
    // assigned executors (minus the actor). CANCELLED has its own matrix in
    // cancel(); other transitions are internal planning moves, no notification.
    if (status === 'READY' || status === 'COMPLETED') {
      const recipientIds = new Set<string>([event.createdBy, event.adminId]);
      const assigned = await assignmentRepository.findManyForAdmin(event.adminId, { activeOnly: true });
      for (const row of assigned) recipientIds.add(row.executorId);
      recipientIds.delete(user.id);
      await deliverEventNotifications(recipientIds, {
        type: status === 'READY' ? 'EVENT_READY' : 'EVENT_COMPLETED',
        title: status === 'READY' ? `Event ready: ${event.name}` : `Event completed: ${event.name}`,
        message:
          status === 'READY'
            ? `${event.name} (${event.eventCode}) scheduled for ${formatEventDate(event.eventDate)} is ready — material requests can now be approved and issued.`
            : `${event.name} (${event.eventCode}) has been completed. Outstanding material returns can still be submitted and reconciled.`,
        referenceType: 'EVENT',
        referenceId: event.id,
        category: 'EVENT',
        priority: 'NORMAL',
      });
    }

    return eventService.getById(user, id);
  },

  /**
   * EVENT CANCELLATION (Phase 7 extension, §28–§34).
   * ADMIN only. A reason is mandatory. Inside ONE transaction:
   *   1. lock the event row,
   *   2. flip status -> CANCELLED + stamp reason/actor/timestamp,
   *   3. cascade every request with ZERO issued quantity to CANCELLED_BY_EVENT
   *      (requests that already issued material stay untouched — their issued
   *      history must remain visible so the executor can still return stock),
   *   4. append timeline rows + audit.
   * Notifications and socket events fire only after a successful commit.
   * Cancellation NEVER moves inventory.
   */
  async cancel(
    user: Actor,
    id: string,
    input: { reason: string },
    context: { ipAddress?: string; userAgent?: string },
  ) {
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can cancel an event.');
    const reason = input.reason.trim();
    if (!reason) throw badRequest('A cancellation reason is required.');

    const preloaded = await loadEventForActor(user, id);
    if (preloaded.adminId !== user.id) {
      throw forbidden('You can only cancel events within your own scope.');
    }
    if (!CANCELLABLE_STATUSES.has(preloaded.status)) {
      throw conflict(`This event can no longer be cancelled while it is ${preloaded.status}.`);
    }

    const { event: cancelled, cascadedRequests, notifications } = await transactionWithRetry(async (tx) => {
      // Serialise concurrent cancellation / status change on the same event.
      await tx.$queryRaw`SELECT id FROM \`Event\` WHERE id = ${id} FOR UPDATE`;

      const current = await tx.event.findUnique({
        where: { id },
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, email: true } },
          creator: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      if (!current) throw notFound();
      if (!CANCELLABLE_STATUSES.has(current.status)) {
        throw conflict(`This event can no longer be cancelled while it is ${current.status}.`);
      }

      const now = new Date();
      await tx.event.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledAt: now,
          cancelledById: user.id,
        },
      });

      // Cascade only requests with zero issued quantity.
      const unissued = await tx.materialRequest.findMany({
        where: { eventId: id, status: { in: [...UNISSUED_REQUEST_STATUSES] } },
        select: { id: true, requestCode: true, status: true, requestedById: true },
      });

      for (const request of unissued) {
        await tx.materialRequest.update({
          where: { id: request.id },
          data: { status: 'CANCELLED_BY_EVENT' },
        });
        await tx.materialRequestItem.updateMany({
          where: { requestId: request.id, status: { in: ['REQUESTED', 'APPROVED'] } },
          data: { status: 'CANCELLED_BY_EVENT' },
        });
        await tx.materialRequestTimeline.create({
          data: {
            requestId: request.id,
            actorId: user.id,
            action: 'CANCELLED_BY_EVENT',
            fromStatus: request.status,
            toStatus: 'CANCELLED_BY_EVENT',
            message: `Request cancelled because the event was cancelled. Reason: ${reason}`,
            metadata: { eventId: id, eventCode: current.eventCode },
          },
        });
      }

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.CANCEL_EVENT,
          entityType: 'EVENT',
          entityId: id,
          oldValues: { status: current.status },
          newValues: {
            status: 'CANCELLED',
            reason,
            cancelledRequestCount: unissued.length,
            cancelledRequestCodes: unissued.map((r) => r.requestCode),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      // §50 EVENT_CANCELLED (HIGH / EVENT): requesters of the cancelled
      // requests -> event creator (if an executor) -> assigned executors.
      const recipientIds = new Set<string>();
      for (const request of unissued) recipientIds.add(request.requestedById);
      if (current.createdBy !== user.id) recipientIds.add(current.createdBy);
      const assigned = await assignmentRepository.findManyForAdmin(current.adminId, { activeOnly: true });
      for (const row of assigned) recipientIds.add(row.executorId);
      recipientIds.delete(user.id);

      const eventDate = formatEventDate(current.eventDate);
      const rows = await notificationRepository.createMany(
        [...recipientIds],
        {
          type: 'EVENT_CANCELLED',
          title: `Event cancelled: ${current.name}`,
          message: `The event ${current.name} (${current.eventCode}) scheduled for ${eventDate} has been cancelled. Reason: ${reason}${
            unissued.length > 0 ? ` ${unissued.length} material request(s) linked to it were cancelled automatically.` : ''
          }`,
          referenceType: 'EVENT',
          referenceId: current.id,
          category: 'EVENT',
          priority: 'HIGH',
        },
        tx,
      );

      const updated = await tx.event.findUnique({
        where: { id },
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, email: true } },
          creator: { select: { id: true, firstName: true, lastName: true, email: true } },
          cancelledBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });
      if (!updated) throw notFound();
      return { event: updated, cascadedRequests: unissued, notifications: rows };
    });

    // Post-commit realtime: notifications first, then the lifecycle event.
    emitEventLifecycleNotifications(notifications);
    for (const row of notifications) {
      emitToUser(SOCKET_EVENT.EVENT_CANCELLED, row.userId, {
        eventId: cancelled.id,
        eventCode: cancelled.eventCode,
        name: cancelled.name,
        status: cancelled.status,
        reason,
      });
    }

    return {
      ...serializeEvent(cancelled),
      cancelledRequests: cascadedRequests.map((r) => ({ id: r.id, requestCode: r.requestCode })),
    };
  },

  /**
   * EVENT MATERIAL SUMMARY (Phase 7 extension, §39/§40/§47).
   * Purely computed from EventMaterial + MaterialRequest(Item) + MaterialReturn
   * rows — NEVER stored, so it can never drift from the source tables.
   * Per food item: Planned / Requested / Approved / Rejected / Issued /
   * Returned + pendingIssue / pendingApproval / returnable, plus a derived
   * lifecycle status. Approval never deducts; only issue and accepted returns
   * move the stock columns.
   */
  async materialSummary(user: Actor, id: string) {
    const event = await loadEventForActor(user, id);

    // 1) Planned: committed (non-draft) event material lines, per food item.
    const plannedByFood = new Map<string, { quantity: number; unitId: string; unitSymbol: string; unitName: string; name: string; dishIds: Set<string> }>();
    for (const eventDish of event.dishes) {
      for (const material of eventDish.materials) {
        if (material.isDraft) continue; // draft lines are not committed demand
        const key = material.foodItemId;
        const existing = plannedByFood.get(key);
        const quantity = Number(material.plannedQuantity);
        if (existing) {
          existing.quantity = round3(existing.quantity + quantity);
          existing.dishIds.add(eventDish.dishId);
        } else {
          plannedByFood.set(key, {
            quantity,
            unitId: material.unitId,
            unitSymbol: material.unit.symbol,
            unitName: material.unit.name,
            name: material.foodItem.name,
            dishIds: new Set([eventDish.dishId]),
          });
        }
      }
    }

    // 2) Requested / Approved / Rejected / Issued from request items.
    //    Requested excludes CANCELLED / CANCELLED_BY_EVENT demand.
    //    Issued NEVER excludes anything (history is immutable).
    const requestItems = await prisma.materialRequestItem.findMany({
      where: { request: { eventId: id } },
      select: {
        foodItemId: true,
        requestedQuantity: true,
        approvedQuantity: true,
        rejectedQuantity: true,
        issuedQuantity: true,
        status: true,
        request: { select: { status: true, requestType: true, requestCode: true } },
      },
    });

    const agg = new Map<string, { requested: number; approved: number; rejected: number; issued: number; pendingApproval: number; pendingIssue: number }>();
    const seed = (foodItemId: string) => {
      let row = agg.get(foodItemId);
      if (!row) {
        row = { requested: 0, approved: 0, rejected: 0, issued: 0, pendingApproval: 0, pendingIssue: 0 };
        agg.set(foodItemId, row);
      }
      return row;
    };
    for (const item of requestItems) {
      const row = seed(item.foodItemId);
      const requestStatus = item.request.status;
      const excluded = !LIVE_REQUEST_STATUSES.includes(
        requestStatus as (typeof LIVE_REQUEST_STATUSES)[number],
      );
      if (!excluded) {
        row.requested = round3(row.requested + Number(item.requestedQuantity));
        row.approved = round3(row.approved + Number(item.approvedQuantity));
        row.rejected = round3(row.rejected + Number(item.rejectedQuantity));
        if (requestStatus === 'PENDING_APPROVAL') {
          row.pendingApproval = round3(row.pendingApproval + Number(item.requestedQuantity));
        }
        const pending = round3(Number(item.approvedQuantity) - Number(item.issuedQuantity));
        if (pending > 0) row.pendingIssue = round3(row.pendingIssue + pending);
      }
      row.issued = round3(row.issued + Number(item.issuedQuantity));
    }

    // 3) Returned: ACCEPTED + PARTIALLY_ACCEPTED returns only (never DRAFT/PENDING/REJECTED).
    const returnItems = await prisma.materialReturnItem.findMany({
      where: { return: { eventId: id, status: { in: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'COMPLETED'] } } },
      select: { foodItemId: true, acceptedReturnQuantity: true },
    });
    const returnedByFood = new Map<string, number>();
    for (const item of returnItems) {
      returnedByFood.set(
        item.foodItemId,
        round3((returnedByFood.get(item.foodItemId) ?? 0) + Number(item.acceptedReturnQuantity)),
      );
    }

    // 4) Join every food item that appears in plan OR demand OR stock movement.
    const foodIds = new Set<string>([
      ...plannedByFood.keys(),
      ...agg.keys(),
      ...returnedByFood.keys(),
    ]);
    const foods = foodIds.size
      ? await prisma.foodItem.findMany({
          where: { id: { in: [...foodIds] } },
          select: {
            id: true,
            name: true,
            isActive: true,
            unit: { select: { symbol: true, name: true } },
            inventory: { select: { currentQuantity: true } },
          },
        })
      : [];
    const foodById = new Map(foods.map((f) => [f.id, f]));

    const lines = [...foodIds].map((foodItemId) => {
      const planned = plannedByFood.get(foodItemId);
      const demand = agg.get(foodItemId) ?? { requested: 0, approved: 0, rejected: 0, issued: 0, pendingApproval: 0, pendingIssue: 0 };
      const returned = returnedByFood.get(foodItemId) ?? 0;
      const food = foodById.get(foodItemId);
      // returnable = issued - acceptedReturned (never negative)
      const returnable = Math.max(0, round3(demand.issued - returned));
      return {
        foodItemId,
        foodItemName: food?.name ?? planned?.name ?? 'Unknown material',
        unitSymbol: food?.unit.symbol ?? planned?.unitSymbol ?? '',
        unitName: food?.unit.name ?? planned?.unitName ?? '',
        dishIds: planned ? [...planned.dishIds] : [],
        plannedQuantity: planned?.quantity ?? 0,
        requestedQuantity: demand.requested,
        approvedQuantity: demand.approved,
        rejectedQuantity: demand.rejected,
        issuedQuantity: demand.issued,
        returnedQuantity: returned,
        pendingApprovalQuantity: demand.pendingApproval,
        pendingIssueQuantity: Math.max(0, round3(demand.approved - demand.issued)),
        /** §39 label: "Unreturned Issued Quantity" — physical stock out there. */
        returnableQuantity: returnable,
        availableStock: food?.inventory?.currentQuantity ?? 0,
        isActive: food?.isActive ?? true,
        hasPlan: Boolean(planned),
      };
    });
    lines.sort((a, b) => a.foodItemName.localeCompare(b.foodItemName));

    const totals = lines.reduce(
      (acc, line) => ({
        plannedQuantity: round3(acc.plannedQuantity + line.plannedQuantity),
        requestedQuantity: round3(acc.requestedQuantity + line.requestedQuantity),
        approvedQuantity: round3(acc.approvedQuantity + line.approvedQuantity),
        rejectedQuantity: round3(acc.rejectedQuantity + line.rejectedQuantity),
        issuedQuantity: round3(acc.issuedQuantity + line.issuedQuantity),
        returnedQuantity: round3(acc.returnedQuantity + line.returnedQuantity),
        pendingApprovalQuantity: round3(acc.pendingApprovalQuantity + line.pendingApprovalQuantity),
        pendingIssueQuantity: round3(acc.pendingIssueQuantity + line.pendingIssueQuantity),
        returnableQuantity: round3(acc.returnableQuantity + line.returnableQuantity),
      }),
      {
        plannedQuantity: 0,
        requestedQuantity: 0,
        approvedQuantity: 0,
        rejectedQuantity: 0,
        issuedQuantity: 0,
        returnedQuantity: 0,
        pendingApprovalQuantity: 0,
        pendingIssueQuantity: 0,
        returnableQuantity: 0,
      },
    );

    // §47 derived lifecycle status (never stored). Precedence follows the
    // next action an operator must take: cancel → approve → issue → reconcile
    // returns → done.
    const lifecycleStatus =
      event.status === 'CANCELLED'
        ? 'CANCELLED'
        : totals.pendingApprovalQuantity > 0
          ? 'APPROVAL_PENDING'
          : totals.pendingIssueQuantity > 0
            ? 'ISSUE_PENDING'
            : totals.returnableQuantity > 0
              ? 'RETURN_RECONCILIATION_PENDING'
              : totals.issuedQuantity > 0
                ? 'FULLY_ISSUED'
                : totals.requestedQuantity > 0
                  ? 'REQUESTED'
                  : 'PLANNED';

    return {
      eventId: event.id,
      eventCode: event.eventCode,
      eventName: event.name,
      eventDate: serializeDateOnly(event.eventDate),
      eventStatus: event.status,
      lifecycleStatus,
      cancellation: {
        reason: event.cancellationReason ?? null,
        cancelledAt: event.cancelledAt ?? null,
      },
      lines,
      totals,
      generatedAt: new Date().toISOString(),
    };
  },

  async remove(user: Actor, id: string, context: { ipAddress?: string; userAgent?: string }) {
    const event = await loadEventForActor(user, id);
    assertEditableForPlanning(event); // terminal events cannot be deleted - history
    await eventRepository.delete(id);
    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE_EVENT,
      entityType: 'EVENT',
      entityId: id,
      oldValues: { eventCode: event.eventCode, name: event.name, status: event.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return { deleted: true };
  },

  // ---------------------------------------------------------------
  // EVENT DISHES
  // ---------------------------------------------------------------

  async addDish(user: Actor, eventId: string, input: { dishId: string; notes?: string | null; displayOrder?: number }, context: { ipAddress?: string; userAgent?: string }) {
    const event = await loadEventForActor(user, eventId);
    assertEditableForPlanning(event);

    const dish = await dishRepository.findById(input.dishId);
    if (!dish) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Dish not found.' });
    }
    if (!dish.isActive) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This dish is deactivated and cannot be added to an event.',
      });
    }

    const existing = await eventDishRepository.findExisting(eventId, input.dishId);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This dish is already in the event.',
      });
    }

    const displayOrder = input.displayOrder ?? (await eventDishRepository.maxDisplayOrder(eventId)) + 1;
    await eventDishRepository.create({
      eventId,
      dishId: dish.id,
      displayOrder,
      notes: input.notes ?? null,
    });

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.ADD_EVENT_DISH,
      entityType: 'EVENT',
      entityId: eventId,
      newValues: { dish: dish.name, displayOrder },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return eventService.getById(user, eventId);
  },

  async updateEventDish(user: Actor, eventId: string, eventDishId: string, input: { displayOrder?: number; notes?: string | null }, context: { ipAddress?: string; userAgent?: string }) {
    const event = await loadEventForActor(user, eventId);
    assertEditableForPlanning(event);

    const eventDish = await eventDishRepository.findById(eventDishId);
    if (!eventDish || eventDish.event.id !== eventId) {
      throw notFound('Dish not found in this event.');
    }

    const data: { displayOrder?: number; notes?: string | null } = {};
    if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    await eventDishRepository.update(eventDishId, data);

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE_EVENT_DISH,
      entityType: 'EVENT',
      entityId: eventId,
      oldValues: { displayOrder: eventDish.displayOrder, notes: eventDish.notes },
      newValues: { ...input },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return eventService.getById(user, eventId);
  },

  async removeDish(user: Actor, eventId: string, eventDishId: string, context: { ipAddress?: string; userAgent?: string }) {
    const event = await loadEventForActor(user, eventId);
    assertEditableForPlanning(event);

    const eventDish = await eventDishRepository.findById(eventDishId);
    if (!eventDish || eventDish.event.id !== eventId) {
      throw notFound('Dish not found in this event.');
    }

    await eventDishRepository.delete(eventDishId);

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.REMOVE_EVENT_DISH,
      entityType: 'EVENT',
      entityId: eventId,
      oldValues: { dish: eventDish.dish.name },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return eventService.getById(user, eventId);
  },

  // ---------------------------------------------------------------
  // EVENT MATERIALS (planning only - no inventory deduction)
  // ---------------------------------------------------------------

  async addMaterial(user: Actor, eventDishId: string, input: {
    foodItemId: string;
    plannedQuantity: number;
    unitId?: string;
    notes?: string | null;
    isDraft?: boolean;
  }, context: { ipAddress?: string; userAgent?: string }) {
    const eventDish = await eventDishRepository.findById(eventDishId);
    if (!eventDish) throw notFound('Event dish not found.');

    const event = await loadEventForActor(user, eventDish.event.id);
    assertEditableForPlanning(event);

    const food = await foodItemRepository.findById(input.foodItemId);
    if (!food) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Food item not found.' });
    }
    if (!food.isActive) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This food item is deactivated and cannot be planned.',
      });
    }

    const duplicate = await eventMaterialRepository.findExisting(eventDishId, input.foodItemId);
    if (duplicate) {
      throw new ApiError({
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'This food item is already planned for this dish.',
      });
    }

    // Adding to the plan requires the stock to cover it. Shortfall lines must be
    // parked as drafts and committed by an ADMIN once the item is stocked in.
    const isDraft = input.isDraft === true;
    if (!isDraft) {
      const stock = await prisma.inventory.findUnique({ where: { foodItemId: food.id } });
      const available = stock?.currentQuantity ?? 0;
      if (available < input.plannedQuantity) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: `Not enough stock for ${food.name} — ${available} available. Save it to the draft instead and add it once stock arrives.`,
        });
      }
    }

    const unitId = input.unitId ?? food.unitId;
    const unit = await unitRepository.findById(unitId);
    if (!unit) {
      throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid unit.' });
    }

    const material = await eventMaterialRepository.create({
      eventDishId,
      foodItemId: food.id,
      plannedQuantity: input.plannedQuantity,
      unitId: unit.id,
      notes: input.notes ?? null,
      isDraft,
    });

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.ADD_EVENT_MATERIAL,
      entityType: 'EVENT_MATERIAL',
      entityId: material.id,
      newValues: { eventDishId, foodItem: food.name, plannedQuantity: input.plannedQuantity, unit: unit.symbol, isDraft },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return eventService.getById(user, eventDish.event.id);
  },

  async updateMaterial(user: Actor, eventDishId: string, materialId: string, input: {
    plannedQuantity?: number;
    unitId?: string;
    notes?: string | null;
    isDraft?: boolean;
  }, context: { ipAddress?: string; userAgent?: string }) {
    const eventDish = await eventDishRepository.findById(eventDishId);
    if (!eventDish) throw notFound('Event dish not found.');

    const event = await loadEventForActor(user, eventDish.event.id);
    assertEditableForPlanning(event);

    const material = await eventMaterialRepository.findById(materialId);
    if (!material || material.eventDishId !== eventDishId) {
      throw notFound('Material line not found.');
    }

    const data: { plannedQuantity?: number; unitId?: string; notes?: string | null; isDraft?: boolean } = {};
    if (input.plannedQuantity !== undefined) data.plannedQuantity = input.plannedQuantity;
    if (input.notes !== undefined) data.notes = input.notes ?? null;
    if (input.unitId !== undefined) {
      const unit = await unitRepository.findById(input.unitId);
      if (!unit) {
        throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid unit.' });
      }
      data.unitId = unit.id;
    }

    // Committing a draft -> planned line. ADMIN-only, and only once stock covers it.
    const isCommit = input.isDraft === false && material.isDraft;
    if (isCommit) {
      if (user.role !== 'ADMIN') {
        throw new ApiError({
          statusCode: 403,
          code: ERROR_CODES.FORBIDDEN,
          message: 'Only an ADMIN can add a draft material once stock is available.',
        });
      }
      const targetQty = input.plannedQuantity ?? Number(material.plannedQuantity);
      const stockRow = await prisma.inventory.findUnique({ where: { foodItemId: material.foodItemId } });
      const available = stockRow?.currentQuantity ?? 0;
      if (available < targetQty) {
        throw new ApiError({
          statusCode: 409,
          code: ERROR_CODES.CONFLICT,
          message: `Still short — ${available} in stock vs ${targetQty} planned. Stock in the item first, then add it.`,
        });
      }
      data.isDraft = false;
    } else if (input.isDraft === true && !material.isDraft) {
      data.isDraft = true;
    }

    await eventMaterialRepository.update(materialId, data);

    await auditLogService.createAuditLog({
      userId: user.id,
      action: isCommit ? AUDIT_ACTIONS.COMMIT_EVENT_MATERIAL : AUDIT_ACTIONS.UPDATE_EVENT_MATERIAL,
      entityType: 'EVENT_MATERIAL',
      entityId: materialId,
      oldValues: { plannedQuantity: material.plannedQuantity, notes: material.notes, isDraft: material.isDraft },
      newValues: { ...input },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return eventService.getById(user, eventDish.event.id);
  },

  async removeMaterial(user: Actor, eventDishId: string, materialId: string, context: { ipAddress?: string; userAgent?: string }) {
    const eventDish = await eventDishRepository.findById(eventDishId);
    if (!eventDish) throw notFound('Event dish not found.');

    const event = await loadEventForActor(user, eventDish.event.id);
    assertEditableForPlanning(event);

    const material = await eventMaterialRepository.findById(materialId);
    if (!material || material.eventDishId !== eventDishId) {
      throw notFound('Material line not found.');
    }

    await eventMaterialRepository.delete(materialId);

    await auditLogService.createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.REMOVE_EVENT_MATERIAL,
      entityType: 'EVENT_MATERIAL',
      entityId: materialId,
      oldValues: { foodItem: material.foodItem.name, plannedQuantity: material.plannedQuantity },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return eventService.getById(user, eventDish.event.id);
  },

  async listMaterials(user: Actor, eventDishId: string) {
    const eventDish = await eventDishRepository.findById(eventDishId);
    if (!eventDish) throw notFound('Event dish not found.');

    await loadEventForActor(user, eventDish.event.id);
    const materials = await eventMaterialRepository.listByEventDish(eventDishId);
    return materials.map((material) => ({
      id: material.id,
      plannedQuantity: Number(material.plannedQuantity),
      notes: material.notes,
      isDraft: material.isDraft,
      unit: material.unit,
      createdAt: material.createdAt,
      foodItem: {
        id: material.foodItem.id,
        name: material.foodItem.name,
        minimumStock: material.foodItem.minimumStock,
        reorderLevel: material.foodItem.reorderLevel,
        isActive: material.foodItem.isActive,
        unit: material.foodItem.unit,
        currentStock: material.foodItem.inventory?.currentQuantity ?? 0,
      },
    }));
  },

  // ---------------------------------------------------------------
  // CALENDAR
  // ---------------------------------------------------------------

  async calendar(user: Actor, query: { from: string; to: string }) {
    const scope = await resolveScope(user);
    const where: Prisma.EventWhereInput = {
      AND: [
        scope,
        { eventDate: { gte: toDateOnly(query.from), lte: toDateOnly(query.to) } },
      ],
    };

    const events = await eventRepository.findForCalendar(where);
    return events.map((event) => ({
      id: event.id,
      eventCode: event.eventCode,
      name: event.name,
      date: serializeDateOnly(event.eventDate),
      startTime: event.startTime,
      endTime: event.endTime,
      numberOfPeople: event.numberOfPeople,
      status: event.status,
      location: event.location,
      dishCount: event._count.dishes,
    }));
  },
};

/** Serializes an event (with nested dishes/materials) to API output. */
function serializeEvent(event: {
  id: string;
  eventCode: string;
  name: string;
  description: string | null;
  eventDate: Date;
  startTime: string;
  endTime: string | null;
  numberOfPeople: number;
  location: string | null;
  notes: string | null;
  status: string;
  adminId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  cancellationReason?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: string | null;
  admin?: { id: string; firstName: string; lastName: string; email: string };
  creator?: { id: string; firstName: string; lastName: string; email: string };
  cancelledBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  dishes?: {
    id: string;
    dishId: string;
    displayOrder: number;
    notes: string | null;
    dish: { id: string; name: string; description: string | null; isActive: boolean };
    materials: {
      id: string;
      plannedQuantity: { toString(): string } | number;
      notes: string | null;
      isDraft: boolean;
      unit: { id: string; symbol: string; name: string };
      foodItem: {
        id: string;
        name: string;
        minimumStock: number;
        reorderLevel: number;
        isActive: boolean;
        unit: { symbol: string; name: string };
        inventory: { currentQuantity: number } | null;
      };
    }[];
  }[];
}) {
  return {
    id: event.id,
    eventCode: event.eventCode,
    name: event.name,
    description: event.description,
    eventDate: serializeDateOnly(event.eventDate),
    startTime: event.startTime,
    endTime: event.endTime,
    numberOfPeople: event.numberOfPeople,
    location: event.location,
    notes: event.notes,
    status: event.status,
    cancellationReason: event.cancellationReason ?? null,
    cancelledAt: event.cancelledAt ?? null,
    cancelledBy: event.cancelledBy ?? null,
    adminId: event.adminId,
    createdBy: event.createdBy,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    admin: event.admin,
    creator: event.creator,
    dishes: (event.dishes ?? []).map((eventDish) => ({
      id: eventDish.id,
      dishId: eventDish.dishId,
      displayOrder: eventDish.displayOrder,
      notes: eventDish.notes,
      dish: eventDish.dish,
      materials: eventDish.materials.map((material) => ({
        id: material.id,
        plannedQuantity: Number(material.plannedQuantity),
        notes: material.notes,
        isDraft: material.isDraft,
        unit: material.unit,
        foodItem: {
          id: material.foodItem.id,
          name: material.foodItem.name,
          minimumStock: material.foodItem.minimumStock,
          reorderLevel: material.foodItem.reorderLevel,
          isActive: material.foodItem.isActive,
          unit: material.foodItem.unit,
          currentStock: material.foodItem.inventory?.currentQuantity ?? 0,
        },
      })),
    })),
  };
}
