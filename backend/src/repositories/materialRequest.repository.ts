import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

const requestInclude = {
  event: {
    select: { id: true, name: true, eventCode: true, eventDate: true, numberOfPeople: true, adminId: true, status: true },
  },
  requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  admin: { select: { id: true, firstName: true, lastName: true, email: true } },
  approver: { select: { id: true, firstName: true, lastName: true, email: true } },
  parent: { select: { id: true, requestCode: true, status: true, requestType: true } },
  items: {
    include: {
      foodItem: { include: { unit: true, inventory: true, category: true } },
      unit: true,
      dish: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  timeline: {
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.MaterialRequestInclude;

type RequestWithRelations = Prisma.MaterialRequestGetPayload<{ include: typeof requestInclude }>;

function decimal(value: Prisma.Decimal | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

export function serializeMaterialRequest(r: RequestWithRelations) {
  return {
    id: r.id,
    requestCode: r.requestCode,
    eventId: r.eventId,
    event: r.event,
    requestedById: r.requestedById,
    requestedBy: r.requestedBy,
    adminId: r.adminId,
    admin: r.admin,
    status: r.status,
    /** Phase 7 extension: INITIAL vs ADDITIONAL (+ parent link + reason). */
    requestType: r.requestType,
    parentRequestId: r.parentRequestId ?? null,
    parent: r.parent ?? null,
    reason: r.reason ?? null,
    notes: r.notes,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    issuedAt: r.issuedAt?.toISOString() ?? null,
    approverId: r.approverId ?? null,
    rejectionReason: r.rejectionReason ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    items: r.items.map((item) => {
      const approvedQuantity = decimal(item.approvedQuantity);
      const issuedQuantity = decimal(item.issuedQuantity);
      return {
        id: item.id,
        foodItemId: item.foodItemId,
        foodItemName: item.foodItem.name,
        categoryName: item.foodItem.category.name,
        dishId: item.dishId,
        dishName: item.dish?.name ?? null,
        plannedQuantity: decimal(item.plannedQuantity),
        requestedQuantity: decimal(item.requestedQuantity),
        approvedQuantity,
        issuedQuantity,
        rejectedQuantity: decimal(item.rejectedQuantity),
        pendingQuantity: Math.max(0, Math.round((approvedQuantity - issuedQuantity) * 1000) / 1000),
        itemStatus: item.status,
        remarks: item.remarks,
        unitSymbol: item.unit.symbol,
        unitName: item.unit.name,
        sourceEventMaterialId: item.sourceEventMaterialId,
        availableStock: item.foodItem.inventory?.currentQuantity ?? 0,
        unit: { id: item.unit.id, symbol: item.unit.symbol, name: item.unit.name },
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

export type SerializedMaterialRequest = ReturnType<typeof serializeMaterialRequest>;

export const materialRequestRepository = {
  async nextRequestCode(year: number, tx: Prisma.TransactionClient): Promise<string> {
    // Atomic native upsert — see event.repository.nextEventCode for why the
    // Prisma upsert fallback races under concurrent requests.
    await tx.$executeRaw`
      INSERT INTO \`MaterialRequestCodeCounter\` (\`year\`, \`lastNumber\`)
      VALUES (${year}, 1)
      ON DUPLICATE KEY UPDATE \`lastNumber\` = \`lastNumber\` + 1
    `;
    const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
      SELECT \`lastNumber\` FROM \`MaterialRequestCodeCounter\` WHERE \`year\` = ${year}
    `;
    const lastNumber = rows[0]?.lastNumber ?? 1;
    return `REQ-${year}-${String(lastNumber).padStart(6, '0')}`;
  },

  async list(input: {
    where: Prisma.MaterialRequestWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.MaterialRequestOrderByWithRelationInput;
  }) {
    const [requests, total] = await Promise.all([
      prisma.materialRequest.findMany({
        where: input.where,
        skip: input.skip,
        take: input.take,
        orderBy: input.orderBy ?? { createdAt: 'desc' },
        include: requestInclude,
      }),
      prisma.materialRequest.count({ where: input.where }),
    ]);
    return {
      requests: requests.map(serializeMaterialRequest),
      total,
    };
  },

  async findById(id: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
    const request = await client.materialRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    return request ? serializeMaterialRequest(request) : null;
  },

  requestInclude,
};
