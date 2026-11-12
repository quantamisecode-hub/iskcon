import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { ListLedgerQuery } from '../validators/ledger.validator.js';

/**
 * GLOBAL INVENTORY LEDGER (read-only).
 * All balance changes are recorded here by stock operations - never
 * written by hand. ADMIN only (route-level requireRole(ADMIN)).
 */

type ReferenceRow = { referenceType: string | null; referenceId: string | null };

/**
 * Resolve a human, copy-pasteable label for each transaction reference so the
 * UI never has to render a raw UUID (e.g. "REQ-2026-000001", "RET-2026-000003",
 * "EV-2026-0012"). Batched: at most 3 queries regardless of page size.
 * Returns a map of `${referenceType}:${referenceId}` -> label.
 */
async function resolveReferenceLabels(rows: ReferenceRow[]): Promise<Map<string, string>> {
  const requestIds = new Set<string>();
  const returnIds = new Set<string>();
  const eventIds = new Set<string>();

  for (const row of rows) {
    if (!row.referenceId) continue;
    if (row.referenceType === 'MATERIAL_REQUEST_ISSUE' || row.referenceType === 'MATERIAL_REQUEST') {
      requestIds.add(row.referenceId);
    } else if (row.referenceType === 'MATERIAL_RETURN') {
      returnIds.add(row.referenceId);
    } else if (row.referenceType === 'EVENT') {
      eventIds.add(row.referenceId);
    }
  }

  const [requests, returns, events] = await Promise.all([
    requestIds.size
      ? prisma.materialRequest.findMany({ where: { id: { in: [...requestIds] } }, select: { id: true, requestCode: true } })
      : [],
    returnIds.size
      ? prisma.materialReturn.findMany({ where: { id: { in: [...returnIds] } }, select: { id: true, returnCode: true } })
      : [],
    eventIds.size
      ? prisma.event.findMany({ where: { id: { in: [...eventIds] } }, select: { id: true, eventCode: true, name: true } })
      : [],
  ]);

  const labels = new Map<string, string>();
  const put = (type: string, id: string, label: string) => labels.set(`${type}:${id}`, label);
  for (const row of requests) {
    put('MATERIAL_REQUEST_ISSUE', row.id, row.requestCode);
    put('MATERIAL_REQUEST', row.id, row.requestCode);
  }
  for (const row of returns) put('MATERIAL_RETURN', row.id, row.returnCode);
  for (const row of events) put('EVENT', row.id, `${row.eventCode} · ${row.name}`);
  return labels;
}

const labelKey = (row: ReferenceRow) => `${row.referenceType ?? ''}:${row.referenceId ?? ''}`;

export const ledgerService = {
  async list(query: ListLedgerQuery) {
    const where: Prisma.InventoryTransactionWhereInput = {
      ...(query.itemId ? { foodItemId: query.itemId } : {}),
      ...(query.type ? { transactionType: query.type } : {}),
      ...(query.userId ? { performedBy: query.userId } : {}),
    };

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
      if (query.dateTo) where.createdAt.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
    }

    const [transactions, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          foodItem: {
            select: {
              id: true,
              name: true,
              unit: { select: { id: true, symbol: true, name: true } },
            },
          },
        },
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);

    const actorIds = [...new Set(transactions.map((tx) => tx.performedBy).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, `${actor.firstName} ${actor.lastName}`]));

    const referenceLabels = await resolveReferenceLabels(transactions);

    return {
      transactions: transactions.map((tx) => ({
        id: tx.id,
        createdAt: tx.createdAt.toISOString(),
        item: tx.foodItem.name,
        foodItemId: tx.foodItem.id,
        unit: tx.foodItem.unit.symbol,
        transactionType: tx.transactionType,
        quantity: tx.quantity,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        referenceType: tx.referenceType,
        referenceId: tx.referenceId,
        referenceLabel: referenceLabels.get(labelKey(tx)) ?? null,
        remarks: tx.remarks,
        performedBy: tx.performedBy ? actorById.get(tx.performedBy) ?? 'Unknown' : 'System',
        performedById: tx.performedBy ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getById(id: string) {
    const tx = await prisma.inventoryTransaction.findUnique({
      where: { id },
      include: {
        foodItem: { select: { id: true, name: true, unit: { select: { symbol: true, name: true } } } },
      },
    });
    if (!tx) return null;
    const actor = tx.performedBy
      ? await prisma.user.findUnique({ where: { id: tx.performedBy }, select: { firstName: true, lastName: true } })
      : null;
    const referenceLabels = await resolveReferenceLabels([tx]);
    return {
      id: tx.id,
      createdAt: tx.createdAt.toISOString(),
      item: tx.foodItem.name,
      foodItemId: tx.foodItem.id,
      unit: tx.foodItem.unit.symbol,
      unitName: tx.foodItem.unit.name,
      transactionType: tx.transactionType,
      quantity: tx.quantity,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      referenceLabel: referenceLabels.get(labelKey(tx)) ?? null,
      remarks: tx.remarks,
      performedBy: actor ? `${actor.firstName} ${actor.lastName}` : 'System',
      performedById: tx.performedBy ?? null,
    };
  },
};
