import type { Prisma } from '@prisma/client';
import { stockLotRepository, type StockLotWithAllocations, type StockLotWithRelations } from '../repositories/stockLot.repository.js';
import { previewFifoAllocation, toDecimal, type FifoPreview } from './fifoInventory.service.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * ADMIN-only read models for FIFO lots. Every Decimal is converted to a plain
 * number here, at the API boundary.
 */

const dateString = (value: Date): string => value.toISOString().slice(0, 10);

export interface StockLotListFilters {
  foodItemId?: string;
  vendorId?: string;
  status?: string;
  stockType?: 'CHARITY' | 'EXPENSE' | 'UNCLASSIFIED';
  page: number;
  pageSize: number;
}

export interface StockLotRow {
  id: string;
  lotNumber: string;
  foodItemId: string;
  foodItemName: string;
  vendorId: string | null;
  vendorName: string | null;
  stockType: 'CHARITY' | 'EXPENSE' | null;
  donorName: string | null;
  purchaseDate: string | null;
  receivedDate: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number | null;
  totalCost: number | null;
  status: string;
  referenceType: string | null;
  createdAt: string;
}

export interface StockAllocationRow {
  id: string;
  stockLotId: string;
  foodItemId: string;
  transactionId: string | null;
  requestId: string | null;
  eventId: string | null;
  quantityAllocated: number;
  unitCost: number | null;
  totalCost: number | null;
  allocatedAt: string;
  createdBy: string | null;
  createdAt: string;
}

type AllocationRow = StockLotWithAllocations['allocations'][number];

export function serializeAllocation(allocation: AllocationRow): StockAllocationRow {
  return {
    id: allocation.id,
    stockLotId: allocation.stockLotId,
    foodItemId: allocation.foodItemId,
    transactionId: allocation.transactionId ?? null,
    requestId: allocation.requestId ?? null,
    eventId: allocation.eventId ?? null,
    quantityAllocated: Number(allocation.quantityAllocated),
    unitCost: allocation.unitCost === null ? null : Number(allocation.unitCost),
    totalCost: allocation.totalCost === null ? null : Number(allocation.totalCost),
    allocatedAt: allocation.allocatedAt.toISOString(),
    createdBy: allocation.createdBy ?? null,
    createdAt: allocation.allocatedAt.toISOString(),
  };
}

export function serializeStockLot(lot: StockLotWithRelations): StockLotRow {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    foodItemId: lot.foodItemId,
    foodItemName: lot.foodItem.name,
    vendorId: lot.vendorId ?? null,
    vendorName: lot.vendor?.name ?? null,
    stockType: lot.stockType ?? null,
    donorName: lot.donorName ?? null,
    purchaseDate: lot.purchaseDate ? dateString(lot.purchaseDate) : null,
    receivedDate: dateString(lot.receivedDate),
    quantityReceived: Number(lot.quantityReceived),
    quantityRemaining: Number(lot.quantityRemaining),
    unitCost: lot.unitCost === null ? null : Number(lot.unitCost),
    totalCost: lot.totalCost === null ? null : Number(lot.totalCost),
    status: lot.status,
    referenceType: lot.referenceType ?? null,
    createdAt: lot.createdAt.toISOString(),
  };
}

export const stockLotService = {
  async list(filters: StockLotListFilters): Promise<{
    lots: StockLotRow[];
    total: number;
    page: number;
    pageSize: number;
    inventoryValue: number;
  }> {
    const where: Prisma.StockLotWhereInput = {
      ...(filters.foodItemId ? { foodItemId: filters.foodItemId } : {}),
      ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.stockType === 'UNCLASSIFIED'
        ? { stockType: null }
        : filters.stockType
          ? { stockType: filters.stockType }
          : {}),
    };
    const [result, valuationRows] = await Promise.all([
      stockLotRepository.list({
        where,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      stockLotRepository.valuationRows(where),
    ]);

    let value = toDecimal(0);
    for (const row of valuationRows) {
      if (row.unitCost === null) continue;
      value = value.plus(toDecimal(row.unitCost).times(toDecimal(row.quantityRemaining)));
    }

    return {
      lots: result.lots.map(serializeStockLot),
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
      inventoryValue: value.toNumber(),
    };
  },

  async getById(id: string): Promise<StockLotRow & { allocations: StockAllocationRow[] }> {
    const lot = await stockLotRepository.findById(id);
    if (!lot) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Stock lot not found.' });
    }
    return { ...serializeStockLot(lot), allocations: lot.allocations.map(serializeAllocation) };
  },

  async update(id: string, input: {
    vendorId?: string | null;
    stockType?: 'CHARITY' | 'EXPENSE' | null;
    donorName?: string | null;
    purchaseDate?: string | null;
    receivedDate?: string;
    unitCost?: number | null;
    status?: string;
  }): Promise<StockLotRow> {
    const existing = await stockLotRepository.findById(id);
    if (!existing) {
      throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Stock lot not found.' });
    }

    const data: Prisma.StockLotUpdateInput = {};
    if (input.vendorId !== undefined) {
      if (input.vendorId) {
        data.vendor = { connect: { id: input.vendorId } };
      } else if (existing.vendorId) {
        data.vendor = { disconnect: true };
      }
    }
    if (input.stockType !== undefined) {
      data.stockType = input.stockType;
      if (input.stockType !== 'CHARITY') {
        data.donorName = null;
      }
    }
    if (input.donorName !== undefined) {
      const activeType = input.stockType !== undefined ? input.stockType : existing.stockType;
      data.donorName = activeType === 'CHARITY' ? input.donorName : null;
    }
    if (input.purchaseDate !== undefined) {
      if (!input.purchaseDate) {
        data.purchaseDate = null;
      } else {
        const d = new Date(input.purchaseDate);
        data.purchaseDate = !isNaN(d.getTime()) ? d : null;
      }
    }
    if (input.receivedDate !== undefined) {
      if (input.receivedDate) {
        const d = new Date(input.receivedDate);
        if (!isNaN(d.getTime())) {
          data.receivedDate = d;
        }
      }
    }
    if (input.unitCost !== undefined) {
      data.unitCost = input.unitCost !== null ? toDecimal(input.unitCost) : null;
      data.totalCost = input.unitCost !== null ? toDecimal(input.unitCost).times(toDecimal(existing.quantityReceived)) : null;
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }

    const updated = await stockLotRepository.update(id, data);
    return serializeStockLot(updated);
  },

  /** Non-mutating FIFO preview ( ADMIN-only financial data at the route layer ). */
  async preview(foodItemId: string, quantity: number): Promise<FifoPreview> {
    return previewFifoAllocation(foodItemId, quantity);
  },

  /** Current stock value from active lots, grouped by food item. */
  async valuation(): Promise<{
    totalValue: number;
    byItem: Array<{ foodItemId: string; name: string; quantity: number; value: number }>;
  }> {
    const rows = await stockLotRepository.valuationRows();
    const grouped = new Map<string, { name: string; quantity: ReturnType<typeof toDecimal>; value: ReturnType<typeof toDecimal> }>();
    let total = toDecimal(0);

    for (const row of rows) {
      const quantity = toDecimal(row.quantityRemaining);
      const lineValue = row.unitCost === null ? toDecimal(0) : toDecimal(row.unitCost).times(quantity);
      const entry = grouped.get(row.foodItemId) ?? {
        name: row.foodItem.name,
        quantity: toDecimal(0),
        value: toDecimal(0),
      };
      entry.quantity = entry.quantity.plus(quantity);
      entry.value = entry.value.plus(lineValue);
      grouped.set(row.foodItemId, entry);
      total = total.plus(lineValue);
    }

    return {
      totalValue: total.toNumber(),
      byItem: [...grouped.entries()].map(([foodItemId, entry]) => ({
        foodItemId,
        name: entry.name,
        quantity: entry.quantity.toNumber(),
        value: entry.value.toNumber(),
      })),
    };
  },
};
