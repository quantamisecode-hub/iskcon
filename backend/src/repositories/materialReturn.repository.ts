import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

/**
 * MATERIAL RETURN REPOSITORY (Phase 7 extension).
 * A MaterialReturn is the FOURTH distinct concept (never merged with
 * Dish Material Definition / Material Request / Inventory Issue):
 * "what quantity physically came back".
 * Stock moves ONLY when an Admin ACCEPTS a return — never on submit.
 */
const returnInclude = {
  event: {
    select: {
      id: true,
      name: true,
      eventCode: true,
      eventDate: true,
      status: true,
      adminId: true,
      cancellationReason: true,
    },
  },
  requester: { select: { id: true, firstName: true, lastName: true, email: true } },
  admin: { select: { id: true, firstName: true, lastName: true, email: true } },
  items: {
    include: {
      foodItem: { select: { id: true, name: true, isActive: true } },
      unit: { select: { id: true, symbol: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  timeline: {
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.MaterialReturnInclude;

type ReturnWithRelations = Prisma.MaterialReturnGetPayload<{ include: typeof returnInclude }>;

function decimal(value: Prisma.Decimal | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

export function serializeMaterialReturn(r: ReturnWithRelations) {
  return {
    id: r.id,
    returnCode: r.returnCode,
    eventId: r.eventId,
    event: r.event,
    requesterId: r.requesterId,
    requester: r.requester,
    adminId: r.adminId,
    admin: r.admin,
    status: r.status,
    reason: r.reason ?? null,
    reasonNote: r.reasonNote ?? null,
    notes: r.notes ?? null,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    items: r.items.map((item) => {
      const requestedReturnQuantity = decimal(item.requestedReturnQuantity);
      const acceptedReturnQuantity = decimal(item.acceptedReturnQuantity);
      const rejectedReturnQuantity = decimal(item.rejectedReturnQuantity);
      const issuedQuantity = decimal(item.issuedQuantity);
      const previouslyReturnedQuantity = decimal(item.previouslyReturnedQuantity);
      return {
        id: item.id,
        foodItemId: item.foodItemId,
        foodItemName: item.foodItem.name,
        unitId: item.unitId,
        unitSymbol: item.unit.symbol,
        unitName: item.unit.name,
        issuedQuantity,
        previouslyReturnedQuantity,
        requestedReturnQuantity,
        acceptedReturnQuantity,
        rejectedReturnQuantity,
        /** Snapshot at submit: what was still returnable then. */
        returnableAtSubmit: Math.max(
          0,
          Math.round((issuedQuantity - previouslyReturnedQuantity) * 1000) / 1000,
        ),
        reason: item.reason ?? null,
      };
    }),
    timeline: r.timeline.map((entry) => ({
      id: entry.id,
      action: entry.action,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      message: entry.message,
      metadata: entry.metadata ?? null,
      actorId: entry.actorId,
      actorName: entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : null,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export type SerializedMaterialReturn = ReturnType<typeof serializeMaterialReturn>;

export const materialReturnRepository = {
  /** Atomic per-year code sequence: RET-YYYY-NNNNNN. Caller must pass a tx. */
  async nextReturnCode(year: number, tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO \`MaterialReturnCodeCounter\` (\`year\`, \`lastNumber\`)
      VALUES (${year}, 1)
      ON DUPLICATE KEY UPDATE \`lastNumber\` = \`lastNumber\` + 1
    `;
    const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
      SELECT \`lastNumber\` FROM \`MaterialReturnCodeCounter\` WHERE \`year\` = ${year}
    `;
    const lastNumber = rows[0]?.lastNumber ?? 1;
    return `RET-${year}-${String(lastNumber).padStart(6, '0')}`;
  },

  async list(input: {
    where: Prisma.MaterialReturnWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.MaterialReturnOrderByWithRelationInput;
  }) {
    const [returns, total] = await Promise.all([
      prisma.materialReturn.findMany({
        where: input.where,
        skip: input.skip,
        take: input.take,
        orderBy: input.orderBy ?? { createdAt: 'desc' },
        include: returnInclude,
      }),
      prisma.materialReturn.count({ where: input.where }),
    ]);
    return {
      returns: returns.map(serializeMaterialReturn),
      total,
    };
  },

  async findById(id: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
    const row = await client.materialReturn.findUnique({
      where: { id },
      include: returnInclude,
    });
    return row ? serializeMaterialReturn(row) : null;
  },

  returnInclude,
};
