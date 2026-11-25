import type { EventExpense } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ROLES } from '../constants/roles.js';
import { AUDIT_ACTIONS } from '../constants/auditActions.js';
import { auditLogService } from './auditLog.service.js';
import type { CreateEventExpenseInput, UpdateEventExpenseInput } from '../validators/eventExpense.validator.js';

/** ADMIN-only. Unknown/future roles are denied by default. */
export type ExpenseActor = { id: string; role: string };

function requireAdmin(actor: ExpenseActor): void {
  if (!actor || actor.role !== ROLES.ADMIN) {
    throw new ApiError({
      statusCode: 403,
      code: ERROR_CODES.FORBIDDEN,
      message: 'You do not have permission to access event expenses.',
    });
  }
}

/** Admin owns the event; no cross-admin reading or mutation (IDOR protection). */
async function assertEventScope(actor: ExpenseActor, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, adminId: true, name: true } });
  if (!event) throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Event not found.' });
  if (event.adminId !== actor.id) {
    throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'You do not have permission to access this event.' });
  }
  return event;
}

function serialize(expense: EventExpense) {
  return {
    id: expense.id,
    eventId: expense.eventId,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    expenseDate: expense.expenseDate.toISOString().slice(0, 10),
    reference: expense.reference ?? null,
    notes: expense.notes ?? null,
    createdBy: expense.createdBy ?? null,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

export const eventExpenseService = {
  async list(actor: ExpenseActor, eventId: string) {
    requireAdmin(actor);
    await assertEventScope(actor, eventId);
    const rows = await prisma.eventExpense.findMany({
      where: { eventId },
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
    });
    return { expenses: rows.map(serialize), total: rows.length };
  },

  async create(actor: ExpenseActor, input: CreateEventExpenseInput, context: { ipAddress?: string; userAgent?: string }) {
    requireAdmin(actor);
    const event = await assertEventScope(actor, input.eventId);
    const created = await prisma.eventExpense.create({
      data: {
        eventId: input.eventId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        expenseDate: new Date(`${input.expenseDate}T00:00:00.000Z`),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdBy: actor.id,
      },
    });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.CREATE_EVENT_EXPENSE,
      entityType: 'EVENT_EXPENSE',
      entityId: created.id,
      newValues: { ...serialize(created), eventName: event.name },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return serialize(created);
  },

  async update(actor: ExpenseActor, id: string, input: UpdateEventExpenseInput, context: { ipAddress?: string; userAgent?: string }) {
    requireAdmin(actor);
    const existing = await prisma.eventExpense.findUnique({ where: { id } });
    if (!existing) throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Event expense not found.' });
    await assertEventScope(actor, existing.eventId);

    const data: Partial<Omit<UpdateEventExpenseInput, 'expenseDate'>> & { expenseDate?: Date } = {};
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.expenseDate !== undefined) data.expenseDate = new Date(`${input.expenseDate}T00:00:00.000Z`);
    if (input.reference !== undefined) data.reference = input.reference;
    if (input.notes !== undefined) data.notes = input.notes;

    const updated = await prisma.eventExpense.update({ where: { id }, data });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.UPDATE_EVENT_EXPENSE,
      entityType: 'EVENT_EXPENSE',
      entityId: id,
      oldValues: serialize(existing),
      newValues: serialize(updated),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return serialize(updated);
  },

  async remove(actor: ExpenseActor, id: string, context: { ipAddress?: string; userAgent?: string }): Promise<void> {
    requireAdmin(actor);
    const existing = await prisma.eventExpense.findUnique({ where: { id } });
    if (!existing) throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Event expense not found.' });
    await assertEventScope(actor, existing.eventId);
    await prisma.eventExpense.delete({ where: { id } });
    await auditLogService.createAuditLog({
      userId: actor.id,
      action: AUDIT_ACTIONS.DELETE_EVENT_EXPENSE,
      entityType: 'EVENT_EXPENSE',
      entityId: id,
      oldValues: serialize(existing),
      newValues: null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  },
};
