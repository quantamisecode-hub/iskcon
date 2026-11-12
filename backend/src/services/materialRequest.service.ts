import type { Prisma, Notification } from '@prisma/client';
import { prisma } from '../config/database.js';
import { materialRequestRepository, type SerializedMaterialRequest } from '../repositories/materialRequest.repository.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { eventRepository } from '../repositories/event.repository.js';
import { auditLogService } from './auditLog.service.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { assignmentRepository } from '../repositories/assignment.repository.js';
import { foodItemRepository } from '../repositories/foodItem.repository.js';
import { maybeEmitStockAlert } from './foodItem.service.js';
import { emitMaterialRequest, emitNotification, SOCKET_EVENT } from '../lib/socket.js';
import { transactionWithRetry } from '../lib/dbRetry.js';
import type { Actor } from './event.service.js';

/**
 * MATERIAL REQUEST SERVICE (Phase 6 + Phase 7 issue workflow).
 *
 * INVARIANTS:
 *  - Only an EXECUTOR creates/submits a request. An ADMIN only reviews/decides/issues.
 *  - Creating, submitting and approving NEVER touch inventory.
 *  - Only an explicit ISSUE transaction deducts stock, and it is atomic,
 *    row-locked and refuses to go negative.
 *  - Every transition appends an immutable timeline row; audit + notification
 *    are written inside the same transaction as the business state change.
 */

function serializeNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    referenceType: n.referenceType,
    referenceId: n.referenceId,
    isRead: n.isRead,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
  };
}

function emitCreated(userId: string, rows: Notification[]) {
  for (const row of rows) emitNotification(userId, serializeNotification(row));
}

const OPEN_STATUSES = ['DRAFT', 'PENDING_APPROVAL'] as const;
const ISSUABLE_STATUSES = ['APPROVED', 'PARTIALLY_ISSUED'] as const;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function notFound(message = 'Material request not found.'): ApiError {
  return new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message });
}

function forbidden(message = 'You do not have permission to access this material request.'): ApiError {
  return new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message });
}

function conflict(message: string): ApiError {
  return new ApiError({ statusCode: 409, code: ERROR_CODES.CONFLICT, message });
}

function badRequest(message: string): ApiError {
  return new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message });
}

async function resolveEventScope(user: Actor): Promise<Prisma.EventWhereInput> {
  if (user.role === 'ADMIN') return { adminId: user.id };
  const assignment = await assignmentRepository.findActiveByExecutor(user.id);
  if (!assignment) return { adminId: '__unassigned__' };
  return { OR: [{ adminId: assignment.adminId }, { createdBy: user.id }] };
}

function isEventInScope(
  scope: Prisma.EventWhereInput,
  event: { adminId: string; createdBy: string },
): boolean {
  const or = (scope as { OR?: { adminId?: string; createdBy?: string }[] }).OR;
  if (or) {
    return or.some((clause) => clause.adminId === event.adminId || clause.createdBy === event.createdBy);
  }
  return (scope as { adminId?: string }).adminId === event.adminId;
}

async function loadEventForActor(user: Actor, eventId: string) {
  const event = await eventRepository.findById(eventId);
  if (!event) throw notFound('Event not found.');
  const scope = await resolveEventScope(user);
  if (!isEventInScope(scope, event)) throw forbidden('You do not have permission to access this event.');
  return event;
}

async function loadRequestForActor(user: Actor, requestId: string): Promise<SerializedMaterialRequest> {
  const request = await materialRequestRepository.findById(requestId);
  if (!request) throw notFound();
  if (user.role === 'ADMIN') {
    if (request.adminId !== user.id) throw forbidden('You do not have permission to access this material request.');
    return request;
  }
  // EXECUTOR can only touch requests they raised themselves.
  if (request.requestedById !== user.id) throw forbidden('You do not have permission to access this material request.');
  return request;
}

async function appendTimeline(
  tx: Prisma.TransactionClient,
  input: {
    requestId: string;
    actorId: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    message: string;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  await tx.materialRequestTimeline.create({
    data: {
      requestId: input.requestId,
      actorId: input.actorId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      message: input.message,
      metadata: input.metadata ?? undefined,
    },
  });
}

export const materialRequestService = {
  async create(
    user: Actor,
    input: {
      eventId: string;
      notes?: string | null;
      items?: Array<{ eventMaterialId: string; requestedQuantity: number; remarks?: string | null }>;
    },
    context: { ipAddress?: string; userAgent?: string },
  ) {
    // Separation of duties: requests originate from an EXECUTOR only.
    if (user.role !== 'EXECUTOR') {
      throw forbidden('Only an executor can create a material request.');
    }

    const event = await loadEventForActor(user, input.eventId);

    // Phase 7 extension: cancelled or completed events never accept new demand.
    if (event.status === 'CANCELLED') {
      throw conflict('This event has been cancelled. Material requests can no longer be created for it.');
    }
    if (event.status === 'COMPLETED') {
      throw conflict('Event is completed. Material requests can no longer be created for it.');
    }

    // Committed (non-draft) plan lines, with the dish they belong to.
    const committedLines = event.dishes.flatMap((d) =>
      d.materials
        .filter((m) => !m.isDraft)
        .map((m) => ({
          id: m.id,
          dishId: d.dishId,
          foodItemId: m.foodItemId,
          unitId: m.unitId,
          plannedQuantity: Number(m.plannedQuantity),
        })),
    );
    if (committedLines.length === 0) {
      throw badRequest('This event has no committed material plan yet. Add materials to at least one dish first.');
    }

    const lineById = new Map(committedLines.map((line) => [line.id, line]));
    let selectedLines: Array<{ line: (typeof committedLines)[number]; requestedQuantity: number; remarks: string | null }>;

    if (input.items !== undefined) {
      if (input.items.length === 0) {
        throw badRequest('Select at least one material to request.');
      }
      const seen = new Set<string>();
      selectedLines = input.items.map((selection) => {
        if (seen.has(selection.eventMaterialId)) {
          throw badRequest('Each material can appear only once in a request.');
        }
        seen.add(selection.eventMaterialId);
        const line = lineById.get(selection.eventMaterialId);
        if (!line) {
          throw badRequest('One or more selected materials are not part of this event’s committed plan.');
        }
        const quantity = Number(selection.requestedQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw badRequest('Requested quantity must be greater than zero.');
        }
        return {
          line,
          requestedQuantity: round3(quantity),
          remarks: selection.remarks?.trim() || null,
        };
      });
    } else {
      // Backwards-compatible default: the whole committed plan.
      selectedLines = committedLines.map((line) => ({
        line,
        requestedQuantity: round3(line.plannedQuantity),
        remarks: null,
      }));
    }

    // Reject duplicate open request for the same event.
    const existingOpen = await prisma.materialRequest.findFirst({
      where: { eventId: event.id, status: { in: [...OPEN_STATUSES] } },
      select: { id: true, requestCode: true },
    });
    if (existingOpen) {
      throw conflict(`An open material request already exists for this event (${existingOpen.requestCode}).`);
    }

    const created = await transactionWithRetry(async (tx) => {
      const year = new Date().getUTCFullYear();
      const requestCode = await materialRequestRepository.nextRequestCode(year, tx);
      const row = await tx.materialRequest.create({
        data: {
          requestCode,
          eventId: event.id,
          requestedById: user.id,
          adminId: event.adminId,
          notes: input.notes?.trim() || null,
          items: {
            create: selectedLines.map(({ line, requestedQuantity, remarks }) => ({
              foodItemId: line.foodItemId,
              dishId: line.dishId,
              plannedQuantity: line.plannedQuantity,
              requestedQuantity,
              approvedQuantity: 0,
              issuedQuantity: 0,
              rejectedQuantity: 0,
              unitId: line.unitId,
              sourceEventMaterialId: line.id,
              remarks,
              status: 'REQUESTED' as const,
            })),
          },
        },
      });

      await appendTimeline(tx, {
        requestId: row.id,
        actorId: user.id,
        action: 'CREATED',
        toStatus: 'DRAFT',
        message: `Request ${requestCode} created for ${event.name}.`,
        metadata: { itemCount: selectedLines.length },
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.CREATE_MATERIAL_REQUEST,
          entityType: 'MATERIAL_REQUEST',
          entityId: row.id,
          newValues: { requestCode, eventId: event.id, itemCount: selectedLines.length },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const result = await materialRequestRepository.findById(row.id, tx);
      if (!result) throw notFound();
      return result;
    });

    return created;
  },

  /**
   * ADDITIONAL MATERIAL REQUEST (Phase 7 extension, §35–§37).
   * Only an EXECUTOR may raise one, and only for materials that belong to the
   * event's dishes. It creates a NEW request row (requestType = ADDITIONAL)
   * linking to the parent INITIAL request — the original is never mutated.
   * Created directly in PENDING_APPROVAL (create + submit in one action by the
   * executor), so the Admin's §52 notification always means "needs review".
   * CANCELLED / COMPLETED events never accept additional demand.
   */
  async createAdditional(
    user: Actor,
    input: {
      eventId: string;
      reason: string;
      note?: string | null;
      notes?: string | null;
      items: Array<{ eventMaterialId: string; requestedQuantity: number; remarks?: string | null }>;
      parentRequestId?: string | null;
    },
    context: { ipAddress?: string; userAgent?: string },
  ) {
    if (user.role !== 'EXECUTOR') {
      throw forbidden('Only an executor can create an additional material request.');
    }

    const event = await loadEventForActor(user, input.eventId);
    if (event.status === 'CANCELLED') {
      throw conflict('Additional material requests are not allowed for cancelled events.');
    }
    if (event.status === 'COMPLETED') {
      throw conflict('Event is no longer accepting material requests.');
    }

    const reason = input.reason.trim();
    if (!reason) throw badRequest('A reason for the additional request is required.');
    const note = input.note?.trim() || null;
    if (reason.toUpperCase() === 'OTHER' && !note) {
      throw badRequest('A note is required when the reason is "Other".');
    }
    const storedReason = note ? `${reason}: ${note}`.slice(0, 500) : reason.slice(0, 500);

    // V1 restriction: only materials that belong to this event's dishes.
    // BUG-ADD-001 fix: parked DRAFT (shortfall) lines are NOT committed and must
    // not be requestable — the INITIAL path already filters them (spec TC-ADD-004).
    const eventLines = event.dishes.flatMap((d) =>
      d.materials
        .filter((m) => !m.isDraft)
        .map((m) => ({
          id: m.id,
          dishId: d.dishId,
          foodItemId: m.foodItemId,
          unitId: m.unitId,
          plannedQuantity: Number(m.plannedQuantity),
        })),
    );
    const lineById = new Map(eventLines.map((line) => [line.id, line]));
    if (input.items.length === 0) throw badRequest('Select at least one material to request.');
    const seen = new Set<string>();
    const selectedLines = input.items.map((selection) => {
      if (seen.has(selection.eventMaterialId)) {
        throw badRequest('Each material can appear only once in a request.');
      }
      seen.add(selection.eventMaterialId);
      const line = lineById.get(selection.eventMaterialId);
      if (!line) {
        throw badRequest(
          'One or more selected materials are not committed plan lines of this event (draft shortfall lines must be committed by the admin first).',
        );
      }
      const quantity = Number(selection.requestedQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw badRequest('Requested quantity must be greater than zero.');
      }
      return {
        line,
        requestedQuantity: round3(quantity),
        remarks: selection.remarks?.trim() || null,
      };
    });

    // Parent: explicit (validated) or the executor's latest INITIAL request.
    let parentRequestId: string | null = null;
    if (input.parentRequestId) {
      const parent = await prisma.materialRequest.findUnique({
        where: { id: input.parentRequestId },
        select: { id: true, eventId: true, requestedById: true, adminId: true, requestType: true, status: true },
      });
      if (!parent) throw notFound('Parent material request not found.');
      if (parent.eventId !== event.id) throw badRequest('The parent request belongs to a different event.');
      if (parent.requestedById !== user.id) throw badRequest('The parent request belongs to a different requester.');
      if (parent.adminId !== event.adminId) throw badRequest('The parent request is outside your admin scope.');
      if (parent.requestType !== 'INITIAL') throw badRequest('Additional requests can only extend an initial request.');
      if (parent.status === 'CANCELLED_BY_EVENT') {
        throw conflict('The parent request was cancelled with its event.');
      }
      parentRequestId = parent.id;
    } else {
      const latestInitial = await prisma.materialRequest.findFirst({
        where: { eventId: event.id, requestedById: user.id, requestType: 'INITIAL' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      parentRequestId = latestInitial?.id ?? null;
    }

    const created = await transactionWithRetry(async (tx) => {
      // Serialise concurrent additional creates for the same event so the
      // duplicate guard below cannot be bypassed by a race.
      await tx.$queryRaw`SELECT id FROM \`MaterialRequest\` WHERE eventId = ${event.id} FOR UPDATE`;

      // §104 duplicate guard: identical (event, food item, quantity) within 10s.
      const recent = await tx.materialRequest.findMany({
        where: { eventId: event.id, createdAt: { gte: new Date(Date.now() - 10_000) } },
        select: { id: true, requestCode: true, items: { select: { foodItemId: true, requestedQuantity: true } } },
      });
      for (const request of recent) {
        for (const item of request.items) {
          const duplicate = selectedLines.find(
            (line) =>
              line.line.foodItemId === item.foodItemId &&
              line.requestedQuantity === Number(item.requestedQuantity),
          );
          if (duplicate) {
            throw conflict(
              `An identical additional request was already submitted seconds ago (${request.requestCode}).`,
            );
          }
        }
      }

      const year = new Date().getUTCFullYear();
      const requestCode = await materialRequestRepository.nextRequestCode(year, tx);
      const now = new Date();
      const row = await tx.materialRequest.create({
        data: {
          requestCode,
          eventId: event.id,
          requestedById: user.id,
          adminId: event.adminId,
          requestType: 'ADDITIONAL',
          parentRequestId,
          reason: storedReason,
          status: 'PENDING_APPROVAL',
          submittedAt: now,
          notes: input.notes?.trim() || null,
          items: {
            create: selectedLines.map(({ line, requestedQuantity, remarks }) => ({
              foodItemId: line.foodItemId,
              dishId: line.dishId,
              plannedQuantity: line.plannedQuantity,
              requestedQuantity,
              approvedQuantity: 0,
              issuedQuantity: 0,
              rejectedQuantity: 0,
              unitId: line.unitId,
              sourceEventMaterialId: line.id,
              remarks,
              status: 'REQUESTED' as const,
            })),
          },
        },
      });

      await appendTimeline(tx, {
        requestId: row.id,
        actorId: user.id,
        action: 'CREATED',
        toStatus: 'PENDING_APPROVAL',
        message: `Additional request ${requestCode} created for ${event.name}. Reason: ${storedReason}`,
        metadata: { requestType: 'ADDITIONAL', parentRequestId, itemCount: selectedLines.length },
      });
      await appendTimeline(tx, {
        requestId: row.id,
        actorId: user.id,
        action: 'SUBMITTED',
        toStatus: 'PENDING_APPROVAL',
        message: 'Additional request submitted for Admin approval.',
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.REQUEST_ADDITIONAL_CREATED,
          entityType: 'MATERIAL_REQUEST',
          entityId: row.id,
          newValues: {
            requestCode,
            eventId: event.id,
            requestType: 'ADDITIONAL',
            parentRequestId,
            reason: storedReason,
            itemCount: selectedLines.length,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      // §52 REQUEST_ADDITIONAL_CREATED -> the event's Admin.
      const rows = await notificationRepository.createMany(
        [event.adminId],
        {
          type: 'REQUEST_ADDITIONAL_CREATED',
          title: `Additional request ${requestCode}`,
          message: `An executor raised an additional material request for ${event.name}. Reason: ${storedReason}`,
          referenceType: 'MATERIAL_REQUEST',
          referenceId: row.id,
          category: 'REQUEST',
          priority: 'HIGH',
        },
        tx,
      );

      const result = await materialRequestRepository.findById(row.id, tx);
      if (!result) throw notFound();
      return { result, notifications: rows };
    });

    emitCreated(event.adminId, created.notifications);
    emitMaterialRequest(SOCKET_EVENT.MATERIAL_REQUEST_CREATED, event.adminId, created.result);
    return created.result;
  },

  async list(
    user: Actor,
    filters: {
      status?: string;
      eventId?: string;
      search?: string;
      page: number;
      pageSize: number;
      sort: 'createdAt' | 'eventDate' | 'status';
      order: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.MaterialRequestWhereInput = {};
    if (user.role === 'ADMIN') where.adminId = user.id;
    else where.requestedById = user.id;
    if (filters.status) where.status = filters.status as never;
    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.search) {
      where.OR = [
        { requestCode: { contains: filters.search } },
        { event: { name: { contains: filters.search } } },
      ];
    }
    const orderBy: Prisma.MaterialRequestOrderByWithRelationInput =
      filters.sort === 'eventDate'
        ? { event: { eventDate: filters.order } }
        : filters.sort === 'status'
          ? { status: filters.order }
          : { createdAt: filters.order };
    return materialRequestRepository.list({
      where,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy,
    });
  },

  async getById(user: Actor, id: string) {
    return loadRequestForActor(user, id);
  },

  async submit(user: Actor, requestId: string, context: { ipAddress?: string; userAgent?: string }) {
    const existing = await loadRequestForActor(user, requestId);
    if (user.role !== 'EXECUTOR') throw forbidden('Only an executor can submit a material request.');
    if (existing.status !== 'DRAFT') throw conflict('Only draft requests can be submitted.');
    if (existing.requestedById !== user.id) throw forbidden('You can only submit your own requests.');
    if (existing.event.status === 'CANCELLED') {
      throw conflict('This event has been cancelled. Its material requests can no longer be submitted.');
    }
    if (existing.event.status === 'COMPLETED') {
      throw conflict('Event is completed. Its material requests can no longer be submitted.');
    }

    const { result, notifications } = await transactionWithRetry(async (tx) => {
      const updated = await tx.materialRequest.updateMany({
        where: { id: requestId, status: 'DRAFT', requestedById: user.id },
        data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
      });
      if (updated.count !== 1) throw conflict('This request could not be submitted.');

      await appendTimeline(tx, {
        requestId,
        actorId: user.id,
        action: 'SUBMITTED',
        fromStatus: 'DRAFT',
        toStatus: 'PENDING_APPROVAL',
        message: 'Request submitted for Admin approval.',
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.SUBMIT_MATERIAL_REQUEST,
          entityType: 'MATERIAL_REQUEST',
          entityId: requestId,
          newValues: { status: 'PENDING_APPROVAL' },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const submitted = await materialRequestRepository.findById(requestId, tx);
      if (!submitted) throw notFound();
      const rows = await notificationRepository.createMany(
        [submitted.adminId],
        {
          type: 'MATERIAL_REQUEST_SUBMITTED',
          title: `New request ${submitted.requestCode}`,
          message: `${submitted.requestedBy.firstName} ${submitted.requestedBy.lastName} submitted a material request for ${submitted.event.name}. Please review and approve or reject.`,
          referenceType: 'MATERIAL_REQUEST',
          referenceId: submitted.id,
        },
        tx,
      );
      return { result: submitted, notifications: rows };
    });

    emitCreated(result.adminId, notifications);
    emitMaterialRequest(SOCKET_EVENT.MATERIAL_REQUEST_SUBMITTED, result.adminId, result);
    return result;
  },

  async cancel(user: Actor, requestId: string, context: { ipAddress?: string; userAgent?: string }) {
    const existing = await loadRequestForActor(user, requestId);
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(existing.status)) {
      throw conflict('Only draft or pending requests can be cancelled.');
    }
    if (user.role !== 'ADMIN' && existing.requestedById !== user.id) {
      throw forbidden('You can only cancel your own requests.');
    }

    const { result, notifications } = await transactionWithRetry(async (tx) => {
      const updated = await tx.materialRequest.updateMany({
        where: { id: requestId, status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) throw conflict('This request could not be cancelled.');

      await tx.materialRequestItem.updateMany({
        where: { requestId },
        data: { status: 'CANCELLED' },
      });

      await appendTimeline(tx, {
        requestId,
        actorId: user.id,
        action: 'CANCELLED',
        fromStatus: existing.status,
        toStatus: 'CANCELLED',
        message: 'Request cancelled.',
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: AUDIT_ACTIONS.CANCEL_MATERIAL_REQUEST,
          entityType: 'MATERIAL_REQUEST',
          entityId: requestId,
          newValues: { status: 'CANCELLED' },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const cancelled = await materialRequestRepository.findById(requestId, tx);
      if (!cancelled) throw notFound();

      let rows: Notification[] = [];
      if (cancelled.adminId !== user.id) {
        rows = await notificationRepository.createMany(
          [cancelled.adminId],
          {
            type: 'MATERIAL_REQUEST_CANCELLED',
            title: `${cancelled.requestCode} cancelled`,
            message: `${cancelled.requestedBy.firstName} ${cancelled.requestedBy.lastName} cancelled the request for ${cancelled.event.name}.`,
            referenceType: 'MATERIAL_REQUEST',
            referenceId: cancelled.id,
          },
          tx,
        );
      }
      return { result: cancelled, notifications: rows };
    });

    if (result.adminId !== user.id) {
      emitCreated(result.adminId, notifications);
      emitMaterialRequest(SOCKET_EVENT.MATERIAL_REQUEST_CANCELLED, result.adminId, result);
    }
    return result;
  },

  async approve(
    user: Actor,
    requestId: string,
    input: { items?: Array<{ itemId: string; approvedQuantity: number }> } | undefined,
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await loadRequestForActor(user, requestId);
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can approve a material request.');
    // Separation of duties: the requester may never approve their own request.
    if (existing.requestedById === user.id) {
      throw forbidden('You cannot approve a material request you created.');
    }
    if (existing.status !== 'PENDING_APPROVAL') {
      throw conflict('Only pending-approval requests can be approved.');
    }
    if (existing.adminId !== user.id) {
      throw forbidden('You can only approve requests within your own scope.');
    }
    if (existing.event.status === 'CANCELLED') {
      throw conflict('This event has been cancelled. Its material requests can no longer be approved.');
    }

    // Default: approve every requested line in full. Optional per-item
    // quantities enable partial approval (0 rejects that line).
    const byId = new Map(existing.items.map((item) => [item.id, item]));
    const overrides = new Map<string, number>();
    for (const entry of input?.items ?? []) {
      if (overrides.has(entry.itemId)) throw badRequest('Each item can be approved only once.');
      const item = byId.get(entry.itemId);
      if (!item) throw badRequest('One or more items do not belong to this request.');
      const quantity = Number(entry.approvedQuantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        throw badRequest('Approved quantity cannot be negative.');
      }
      if (quantity > item.requestedQuantity) {
        throw badRequest('Approved quantity cannot exceed the requested quantity.');
      }
      overrides.set(entry.itemId, round3(quantity));
    }

    const decisions = existing.items.map((item) => {
      const approvedQuantity = overrides.has(item.id) ? (overrides.get(item.id) ?? 0) : item.requestedQuantity;
      return {
        itemId: item.id,
        approvedQuantity,
        rejectedQuantity: round3(item.requestedQuantity - approvedQuantity),
        itemStatus: approvedQuantity > 0 ? ('APPROVED' as const) : ('REJECTED' as const),
      };
    });
    if (!decisions.some((decision) => decision.approvedQuantity > 0)) {
      throw badRequest('At least one item must be approved. Use Reject to decline the whole request.');
    }
    const isPartial = decisions.some((decision) => decision.rejectedQuantity > 0);

    const { result, notifications } = await transactionWithRetry(async (tx) => {
      const updated = await tx.materialRequest.updateMany({
        where: { id: requestId, status: 'PENDING_APPROVAL' },
        data: { status: 'APPROVED', approvedAt: new Date(), approverId: user.id },
      });
      if (updated.count !== 1) throw conflict('This request could not be approved.');

      for (const decision of decisions) {
        await tx.materialRequestItem.updateMany({
          where: { id: decision.itemId, requestId },
          data: {
            approvedQuantity: decision.approvedQuantity,
            rejectedQuantity: decision.rejectedQuantity,
            status: decision.itemStatus,
          },
        });
      }

      await appendTimeline(tx, {
        requestId,
        actorId: user.id,
        action: isPartial ? 'PARTIALLY_APPROVED' : 'APPROVED',
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'APPROVED',
        message: isPartial
          ? 'Request approved with adjusted quantities. No stock has been deducted.'
          : 'Request approved. No stock has been deducted.',
        metadata: { items: decisions },
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action:
            existing.requestType === 'ADDITIONAL'
              ? AUDIT_ACTIONS.REQUEST_ADDITIONAL_APPROVED
              : AUDIT_ACTIONS.APPROVE_MATERIAL_REQUEST,
          entityType: 'MATERIAL_REQUEST',
          entityId: requestId,
          newValues: { status: 'APPROVED', approvedBy: user.id, partial: isPartial, requestType: existing.requestType },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const approved = await materialRequestRepository.findById(requestId, tx);
      if (!approved) throw notFound();

      const isAdditional = approved.requestType === 'ADDITIONAL';
      const rows = await notificationRepository.createMany(
        [approved.requestedById],
        {
          type: isAdditional
            ? (isPartial ? 'REQUEST_ADDITIONAL_PARTIALLY_APPROVED' : 'REQUEST_ADDITIONAL_APPROVED')
            : 'MATERIAL_REQUEST_APPROVED',
          title: `${approved.requestCode} approved`,
          message: isAdditional
            ? `Your additional material request for ${approved.event.name} has been approved by ${approved.admin.firstName} ${approved.admin.lastName}. Awaiting stock issue — inventory has not changed yet.`
            : `Your material request for ${approved.event.name} has been approved by ${approved.admin.firstName} ${approved.admin.lastName}. Awaiting stock issue — inventory has not changed yet.`,
          referenceType: 'MATERIAL_REQUEST',
          referenceId: approved.id,
          category: 'REQUEST',
          priority: 'NORMAL',
        },
        tx,
      );
      return { result: approved, notifications: rows };
    });

    emitCreated(result.requestedById, notifications);
    emitMaterialRequest(SOCKET_EVENT.MATERIAL_REQUEST_APPROVED, result.requestedById, result);
    return result;
  },

  async reject(user: Actor, requestId: string, reason: string, context: { ipAddress?: string; userAgent?: string }) {
    const existing = await loadRequestForActor(user, requestId);
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can reject a material request.');
    // Separation of duties: the requester may never decide their own request.
    if (existing.requestedById === user.id) {
      throw forbidden('You cannot reject a material request you created.');
    }
    if (existing.status !== 'PENDING_APPROVAL') {
      throw conflict('Only pending-approval requests can be rejected.');
    }
    if (existing.adminId !== user.id) {
      throw forbidden('You can only reject requests within your own scope.');
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw badRequest('A rejection reason is required.');
    if (existing.event.status === 'CANCELLED') {
      throw conflict('This event has been cancelled. Its material requests can no longer be rejected.');
    }

    const { result, notifications } = await transactionWithRetry(async (tx) => {
      const updated = await tx.materialRequest.updateMany({
        where: { id: requestId, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED', rejectedAt: new Date(), approverId: user.id, rejectionReason: trimmedReason },
      });
      if (updated.count !== 1) throw conflict('This request could not be rejected.');

      await tx.$executeRaw`
        UPDATE \`MaterialRequestItem\`
        SET \`status\` = 'REJECTED', \`rejectedQuantity\` = \`requestedQuantity\`
        WHERE \`requestId\` = ${requestId}
      `;

      await appendTimeline(tx, {
        requestId,
        actorId: user.id,
        action: 'REJECTED',
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'REJECTED',
        message: `Request rejected. Reason: ${trimmedReason}`,
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action:
            existing.requestType === 'ADDITIONAL'
              ? AUDIT_ACTIONS.REQUEST_ADDITIONAL_REJECTED
              : AUDIT_ACTIONS.REJECT_MATERIAL_REQUEST,
          entityType: 'MATERIAL_REQUEST',
          entityId: requestId,
          newValues: { status: 'REJECTED', rejectedBy: user.id, reason: trimmedReason, requestType: existing.requestType },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const rejected = await materialRequestRepository.findById(requestId, tx);
      if (!rejected) throw notFound();

      const isAdditional = rejected.requestType === 'ADDITIONAL';
      const rows = await notificationRepository.createMany(
        [rejected.requestedById],
        {
          type: isAdditional ? 'REQUEST_ADDITIONAL_REJECTED' : 'MATERIAL_REQUEST_REJECTED',
          title: `${rejected.requestCode} rejected`,
          message: isAdditional
            ? `Your additional material request for ${rejected.event.name} was rejected. Reason: ${trimmedReason}`
            : `Your material request for ${rejected.event.name} was rejected. Reason: ${trimmedReason}`,
          referenceType: 'MATERIAL_REQUEST',
          referenceId: rejected.id,
          category: 'REQUEST',
          priority: 'NORMAL',
        },
        tx,
      );
      return { result: rejected, notifications: rows };
    });

    emitCreated(result.requestedById, notifications);
    emitMaterialRequest(SOCKET_EVENT.MATERIAL_REQUEST_REJECTED, result.requestedById, result);
    return result;
  },

  /**
   * ACTUAL STOCK ISSUE — the only operation in this service that moves inventory.
   * Every line is validated and locked inside one transaction; any failure
   * rolls back stock, request, timeline, audit and notification together.
   */
  async issue(
    user: Actor,
    requestId: string,
    input: { items: Array<{ itemId: string; quantity: number }> },
    context: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await loadRequestForActor(user, requestId);
    if (user.role !== 'ADMIN') throw forbidden('Only an admin can issue stock.');
    if (existing.adminId !== user.id) {
      throw forbidden('You can only issue requests within your own scope.');
    }
    if (!ISSUABLE_STATUSES.includes(existing.status as (typeof ISSUABLE_STATUSES)[number])) {
      throw conflict('Only approved or partially issued requests can be issued.');
    }
    if (!input.items.length) throw badRequest('Select at least one item to issue.');

    const seen = new Set<string>();
    const requestedIssues: Array<{ itemId: string; quantity: number }> = [];
    for (const entry of input.items) {
      if (seen.has(entry.itemId)) throw badRequest('Each item can be issued only once per confirmation.');
      seen.add(entry.itemId);
      const quantity = Number(entry.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw badRequest('Issue quantity must be a positive whole number.');
      }
      requestedIssues.push({ itemId: entry.itemId, quantity });
    }

    const { result, notifications, fullyIssued, issuedDetails } = await transactionWithRetry(async (tx) => {
      // Serialise concurrent issues for the same request.
      await tx.$queryRaw`SELECT id FROM \`MaterialRequest\` WHERE id = ${requestId} FOR UPDATE`;

      const current = await tx.materialRequest.findUnique({
        where: { id: requestId },
        include: { items: true, event: { select: { id: true, status: true, name: true } } },
      });
      if (!current) throw notFound();
      if (current.event.status === 'CANCELLED') {
        throw conflict('This event has been cancelled. No further stock can be issued for it.');
      }
      if (current.event.status === 'COMPLETED') {
        throw conflict('Event is completed. No further stock can be issued for it.');
      }
      if (!['APPROVED', 'PARTIALLY_ISSUED'].includes(current.status)) {
        throw conflict('Only approved or partially issued requests can be issued.');
      }

      const itemById = new Map(current.items.map((item) => [item.id, item]));
      const issuedDetails: Array<{
        itemId: string;
        foodItemId: string;
        foodItemName: string;
        quantity: number;
        unitSymbol: string;
        remaining: number;
        /** Balance right after this issue — drives the low-stock alarm post-commit. */
        balanceAfter: number;
      }> = [];

      for (const request of requestedIssues) {
        const item = itemById.get(request.itemId);
        if (!item) throw badRequest('One or more items do not belong to this request.');
        if (item.status === 'REJECTED') throw conflict('Rejected items cannot be issued.');

        const approvedQuantity = Number(item.approvedQuantity);
        const alreadyIssued = Number(item.issuedQuantity);
        const remaining = round3(approvedQuantity - alreadyIssued);
        if (remaining <= 0) throw conflict('This item has already been fully issued.');
        if (request.quantity > remaining) {
          throw conflict(`Only ${remaining} remains approved for this item.`);
        }

        // Row lock the inventory line so two admins can never oversell it.
        const rows = await tx.$queryRaw<Array<{ currentQuantity: number }>>`
          SELECT currentQuantity FROM \`Inventory\` WHERE foodItemId = ${item.foodItemId} FOR UPDATE
        `;
        const balanceBefore = rows[0]?.currentQuantity ?? 0;
        if (balanceBefore < request.quantity) {
          throw new ApiError({
            statusCode: 409,
            code: ERROR_CODES.CONFLICT,
            message: `Not enough stock for this item — only ${balanceBefore} available.`,
          });
        }
        const balanceAfter = balanceBefore - request.quantity;

        await tx.inventory.update({
          where: { foodItemId: item.foodItemId },
          data: { currentQuantity: balanceAfter },
        });

        await tx.inventoryTransaction.create({
          data: {
            foodItemId: item.foodItemId,
            transactionType: 'STOCK_OUT',
            quantity: request.quantity,
            balanceBefore,
            balanceAfter,
            referenceType: 'MATERIAL_REQUEST_ISSUE',
            referenceId: requestId,
            performedBy: user.id,
            remarks: `Issued against ${current.requestCode}`,
          },
        });

        const newIssued = round3(alreadyIssued + request.quantity);
        const itemStatus = newIssued >= approvedQuantity ? ('ISSUED' as const) : ('PARTIALLY_ISSUED' as const);
        await tx.materialRequestItem.update({
          where: { id: item.id },
          data: { issuedQuantity: newIssued, status: itemStatus },
        });

        const food = await tx.foodItem.findUnique({
          where: { id: item.foodItemId },
          select: { name: true, unit: { select: { symbol: true } } },
        });
        issuedDetails.push({
          itemId: item.id,
          foodItemId: item.foodItemId,
          foodItemName: food?.name ?? 'Material',
          quantity: request.quantity,
          unitSymbol: food?.unit.symbol ?? '',
          remaining: round3(approvedQuantity - newIssued),
          balanceAfter,
        });
      }

      const refreshedItems = await tx.materialRequestItem.findMany({ where: { requestId } });
      const approvedItems = refreshedItems.filter((item) => Number(item.approvedQuantity) > 0);
      const allIssued =
        approvedItems.length > 0 &&
        approvedItems.every((item) => Number(item.issuedQuantity) >= Number(item.approvedQuantity));
      const anyIssued = refreshedItems.some((item) => Number(item.issuedQuantity) > 0);
      const newStatus = allIssued ? 'ISSUED' : anyIssued ? 'PARTIALLY_ISSUED' : 'APPROVED';

      await tx.materialRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          issuedAt: allIssued ? new Date() : current.issuedAt,
        },
      });

      const summary = issuedDetails
        .map((detail) => `${detail.quantity} ${detail.unitSymbol} ${detail.foodItemName}`)
        .join(', ');
      await appendTimeline(tx, {
        requestId,
        actorId: user.id,
        action: allIssued ? 'ISSUED' : 'PARTIALLY_ISSUED',
        fromStatus: current.status,
        toStatus: newStatus,
        message: allIssued
          ? `All approved quantities issued. ${summary} issued from stock.`
          : `Partially issued: ${summary}. Remaining quantities are still pending.`,
        metadata: { items: issuedDetails },
      });

      await auditLogService.createAuditLog(
        {
          userId: user.id,
          action: current.requestType === 'ADDITIONAL' ? AUDIT_ACTIONS.MATERIAL_ISSUED : AUDIT_ACTIONS.STOCK_ISSUED,
          entityType: 'MATERIAL_REQUEST',
          entityId: requestId,
          newValues: {
            status: newStatus,
            requestType: current.requestType,
            issued: issuedDetails.map((detail) => ({
              foodItemId: detail.foodItemId,
              quantity: detail.quantity,
            })),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      const updated = await materialRequestRepository.findById(requestId, tx);
      if (!updated) throw notFound();

      const isAdditional = updated.requestType === 'ADDITIONAL';
      const rows = await notificationRepository.createMany(
        [updated.requestedById],
        {
          type: isAdditional
            ? (allIssued ? 'REQUEST_ADDITIONAL_ISSUED' : 'REQUEST_ADDITIONAL_PARTIALLY_ISSUED')
            : (allIssued ? 'MATERIAL_REQUEST_ISSUED' : 'MATERIAL_REQUEST_PARTIALLY_ISSUED'),
          title: allIssued ? `${updated.requestCode} fully issued` : `${updated.requestCode} partially issued`,
          message: allIssued
            ? `All approved materials for ${updated.event.name} have been issued: ${summary}.`
            : `Partially issued for ${updated.event.name}: ${summary}. Remaining quantities are still pending.`,
          referenceType: 'MATERIAL_REQUEST',
          referenceId: updated.id,
          category: 'REQUEST',
          priority: 'NORMAL',
        },
        tx,
      );

      return { result: updated, notifications: rows, fullyIssued: allIssued, issuedDetails };
    });

    emitCreated(result.requestedById, notifications);
    emitMaterialRequest(
      fullyIssued ? SOCKET_EVENT.MATERIAL_REQUEST_ISSUED : SOCKET_EVENT.MATERIAL_REQUEST_PARTIALLY_ISSUED,
      result.requestedById,
      result,
    );

    // Stock-health alarm (Phase 7 gap fix): issuing is the largest stock-out in
    // the system, so it must raise the same OUT_OF_STOCK / LOW_STOCK /
    // REORDER_REQUIRED alerts as a manual Stock Out. Post-commit + best-effort —
    // an alert failure must never fail an issue that already succeeded.
    try {
      for (const detail of issuedDetails) {
        const food = await foodItemRepository.findById(detail.foodItemId);
        await maybeEmitStockAlert(food, detail.balanceAfter);
      }
    } catch {
      // best-effort: stock alerts never break or roll back an issue
    }

    return result;
  },

  async countsForUser(user: Actor) {
    const where: Prisma.MaterialRequestWhereInput =
      user.role === 'ADMIN' ? { adminId: user.id } : { requestedById: user.id };
    const [pending, approved, partiallyIssued, issued, rejected, cancelled, total] = await Promise.all([
      prisma.materialRequest.count({ where: { ...where, status: 'PENDING_APPROVAL' } }),
      prisma.materialRequest.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.materialRequest.count({ where: { ...where, status: 'PARTIALLY_ISSUED' } }),
      prisma.materialRequest.count({ where: { ...where, status: 'ISSUED' } }),
      prisma.materialRequest.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.materialRequest.count({ where: { ...where, status: 'CANCELLED' } }),
      prisma.materialRequest.count({ where }),
    ]);
    return { pending, approved, partiallyIssued, issued, rejected, cancelled, total };
  },
};
