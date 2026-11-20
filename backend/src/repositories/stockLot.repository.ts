import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

/**
 * STOCK LOT REPOSITORY (read side of the FIFO engine).
 * Lots are created/mutated exclusively by the FIFO engine and the stock-in
 * service. This repository is used by the admin-only lot/valuation read APIs.
 */

export const ACTIVE_LOT_STATUSES = ['AVAILABLE', 'PARTIALLY_CONSUMED'] as const;

const stockLotInclude = {
  foodItem: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
} satisfies Prisma.StockLotInclude;

const stockLotDetailInclude = {
  foodItem: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  allocations: {
    orderBy: [{ allocatedAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.StockLotInclude;

export type StockLotWithRelations = Prisma.StockLotGetPayload<{ include: typeof stockLotInclude }>;
export type StockLotWithAllocations = Prisma.StockLotGetPayload<{ include: typeof stockLotDetailInclude }>;

export const stockLotRepository = {
  async list(input: {
    where: Prisma.StockLotWhereInput;
    skip: number;
    take: number;
    orderBy?: Prisma.StockLotOrderByWithRelationInput[];
  }): Promise<{ lots: StockLotWithRelations[]; total: number }> {
    const [lots, total] = await Promise.all([
      prisma.stockLot.findMany({
        where: input.where,
        skip: input.skip,
        take: input.take,
        orderBy: input.orderBy ?? [{ receivedDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: stockLotInclude,
      }),
      prisma.stockLot.count({ where: input.where }),
    ]);
    return { lots, total };
  },

  async findById(id: string): Promise<StockLotWithAllocations | null> {
    return prisma.stockLot.findUnique({ where: { id }, include: stockLotDetailInclude });
  },

  /** All active lots with their costs — used for inventory valuation. */
  async valuationRows(where?: Prisma.StockLotWhereInput) {
    return prisma.stockLot.findMany({
      where: {
        status: { in: [...ACTIVE_LOT_STATUSES] },
        quantityRemaining: { gt: 0 },
        ...where,
      },
      select: {
        foodItemId: true,
        quantityRemaining: true,
        unitCost: true,
        foodItem: { select: { name: true } },
      },
    });
  },
};
