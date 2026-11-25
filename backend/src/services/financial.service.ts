import type { EventStatus, StockType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ROLES } from '../constants/roles.js';
import { toDecimal } from './fifoInventory.service.js';

/**
 * EVENT FINANCIAL STATEMENT / INVENTORY & FINANCIAL LEDGER.
 *
 * Definitions (confirmed business rules):
 *  - CHARITY stock = in-kind contribution. Its value is RESOURCE utilisation,
 *    never a cash expense and never subtracted from cash donations.
 *  - EXPENSE stock = organisation-funded purchase. It is both resource
 *    utilisation and cash-funded event cost.
 *  - Other expenses = admin-recorded EventExpense rows (no stock involved).
 *  - Cash Result = cash donations − (expense stock + other expenses).
 *  - Historical cost is taken from the IMMUTABLE StockAllocation row of the
 *    original lot. Later purchases can never rewrite an older event's cost.
 *  - Returns are negative allocations reversing the original lot, so net
 *    consumption = issue allocations + return reversals, grouped by stock type.
 *
 * This is a P&L-style management view, not statutory accounting.
 */
export type FinancialActor = { id: string; role: string };
export type StockTypeFilter = 'ALL' | 'CHARITY' | 'EXPENSE' | 'UNCLASSIFIED';
export type ResultFilter = 'ALL' | 'SURPLUS' | 'DEFICIT' | 'BREAK_EVEN';

export interface FinancialFilters {
  dateFrom?: string;
  dateTo?: string;
  eventId?: string;
  eventType?: string;
  location?: string;
  stockType?: StockTypeFilter;
  result?: ResultFilter;
  status?: EventStatus;
  page: number;
  pageSize: number;
}

type AllocationForReport = {
  id: string;
  stockLotId: string;
  foodItemId: string;
  eventId: string | null;
  quantityAllocated: ReturnType<typeof toDecimal>;
  unitCost: ReturnType<typeof toDecimal> | null;
  lotNumber: string;
  vendorId: string | null;
  vendorName: string | null;
  receivedDate: string;
  stockType: StockType | null;
  itemName: string;
  unit: string;
};

const money = (value: ReturnType<typeof toDecimal>): number => value.toDecimalPlaces(2).toNumber();
const num = (value: { toString(): string } | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value.toString());
const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

function requireAdmin(actor: FinancialActor): void {
  if (!actor || actor.role !== ROLES.ADMIN) {
    throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'Financial data is available to administrators only.' });
  }
}

async function loadEventForActor(actor: FinancialActor, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new ApiError({ statusCode: 404, code: ERROR_CODES.NOT_FOUND, message: 'Event not found.' });
  if (event.adminId !== actor.id) {
    throw new ApiError({ statusCode: 403, code: ERROR_CODES.FORBIDDEN, message: 'You do not have permission to access this event.' });
  }
  return event;
}

async function loadAllocations(eventIds: string[]): Promise<AllocationForReport[]> {
  if (eventIds.length === 0) return [];
  const rows = await prisma.stockAllocation.findMany({
    where: { eventId: { in: eventIds } },
    include: {
      stockLot: {
        select: {
          lotNumber: true, vendorId: true, receivedDate: true, stockType: true,
          vendor: { select: { name: true } },
        },
      },
      foodItem: { select: { name: true, unit: { select: { symbol: true } } } },
    },
    orderBy: [{ eventId: 'asc' }, { allocatedAt: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    stockLotId: row.stockLotId,
    foodItemId: row.foodItemId,
    eventId: row.eventId,
    quantityAllocated: toDecimal(row.quantityAllocated),
    unitCost: row.unitCost === null ? null : toDecimal(row.unitCost),
    lotNumber: row.stockLot.lotNumber,
    vendorId: row.stockLot.vendorId,
    vendorName: row.stockLot.vendor?.name ?? null,
    receivedDate: isoDate(row.stockLot.receivedDate),
    stockType: row.stockLot.stockType,
    itemName: row.foodItem.name,
    unit: row.foodItem.unit.symbol,
  }));
}

/** Value is derived from the immutable per-lot cost at consumption time. */
function allocationValue(row: AllocationForReport): ReturnType<typeof toDecimal> {
  if (row.unitCost === null) return toDecimal(0);
  return row.unitCost.times(row.quantityAllocated);
}

function typeKey(type: StockType | null): 'CHARITY' | 'EXPENSE' | 'UNCLASSIFIED' {
  return type ?? 'UNCLASSIFIED';
}

export const financialService = {
  /** Full financial statement for one event (ADMIN, in scope). */
  async getEventFinancialStatement(actor: FinancialActor, eventId: string) {
    requireAdmin(actor);
    const event = await loadEventForActor(actor, eventId);
    const [allocations, expenses] = await Promise.all([
      loadAllocations([event.id]),
      prisma.eventExpense.findMany({ where: { eventId: event.id }, orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }] }),
    ]);

    const byType = { CHARITY: toDecimal(0), EXPENSE: toDecimal(0), UNCLASSIFIED: toDecimal(0) };
    const qtyByType = { CHARITY: toDecimal(0), EXPENSE: toDecimal(0), UNCLASSIFIED: toDecimal(0) };
    const itemMap = new Map<string, {
      foodItemId: string; name: string; unit: string; stockType: StockType | null;
      quantity: ReturnType<typeof toDecimal>; value: ReturnType<typeof toDecimal>;
    }>();
    const fifoDetail = allocations.map((row) => {
      const value = allocationValue(row);
      const key = typeKey(row.stockType);
      byType[key] = byType[key].plus(value);
      qtyByType[key] = qtyByType[key].plus(row.quantityAllocated);
      const itemKey = `${row.foodItemId}:${key}`;
      const item = itemMap.get(itemKey) ?? {
        foodItemId: row.foodItemId, name: row.itemName, unit: row.unit, stockType: row.stockType,
        quantity: toDecimal(0), value: toDecimal(0),
      };
      item.quantity = item.quantity.plus(row.quantityAllocated);
      item.value = item.value.plus(value);
      itemMap.set(itemKey, item);
      return {
        allocationId: row.id,
        stockLotId: row.stockLotId,
        lotNumber: row.lotNumber,
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        receivedDate: row.receivedDate,
        stockType: row.stockType,
        quantity: row.quantityAllocated.toNumber(),
        unitCost: row.unitCost === null ? null : row.unitCost.toNumber(),
        value: money(value),
      };
    });

    const charityValue = money(byType.CHARITY);
    const expenseValue = money(byType.EXPENSE);
    const unclassifiedValue = money(byType.UNCLASSIFIED);
    const otherExpenses = money(expenses.reduce((sum, e) => sum.plus(toDecimal(e.amount)), toDecimal(0)));
    const inventoryUtilization = money(byType.CHARITY.plus(byType.EXPENSE).plus(byType.UNCLASSIFIED));
    const resourceUtilization = money(toDecimal(inventoryUtilization).plus(otherExpenses));
    const donations = num(event.donationAmount);
    const cashEventCost = money(toDecimal(expenseValue).plus(otherExpenses));
    const cashResult = money(toDecimal(donations).minus(cashEventCost));
    const costPerPerson = event.numberOfPeople > 0 ? money(toDecimal(resourceUtilization).div(event.numberOfPeople)) : 0;

    return {
      event: {
        id: event.id, eventCode: event.eventCode, name: event.name,
        eventDate: isoDate(event.eventDate), status: event.status,
        numberOfPeople: event.numberOfPeople, location: event.location,
        donationType: event.donationType, donationGivenBy: event.donationGivenBy, trNumber: event.trNumber,
      },
      revenue: {
        cashDonations: donations,
        donationType: event.donationType,
        donationGivenBy: event.donationGivenBy,
        trNumber: event.trNumber,
      },
      inventory: {
        charityValue,
        expenseValue,
        unclassifiedValue,
        totalValue: inventoryUtilization,
        charityQuantity: qtyByType.CHARITY.toNumber(),
        expenseQuantity: qtyByType.EXPENSE.toNumber(),
        unclassifiedQuantity: qtyByType.UNCLASSIFIED.toNumber(),
      },
      byItem: [...itemMap.values()].map((item) => ({
        foodItemId: item.foodItemId, name: item.name, unit: item.unit,
        stockType: item.stockType, quantity: item.quantity.toNumber(), value: money(item.value),
      })),
      fifoDetail,
      otherExpenses: expenses.map((e) => ({
        id: e.id, category: e.category, description: e.description, amount: num(e.amount),
        expenseDate: isoDate(e.expenseDate), reference: e.reference ?? null, notes: e.notes ?? null,
      })),
      totals: {
        otherExpenses,
        inventoryUtilization,
        resourceUtilization,
        cashEventCost,
        cashResult,
        costPerPerson,
        result: cashResult > 0 ? 'SURPLUS' : cashResult < 0 ? 'DEFICIT' : 'BREAK_EVEN',
      },
    };
  },

  /** Financial overview + paginated event ledger (ADMIN only). */
  async getLedgerSummary(actor: FinancialActor, filters: FinancialFilters) {
    requireAdmin(actor);
    const dateFilter = filters.dateFrom || filters.dateTo
      ? {
          ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
          ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
        }
      : undefined;
    const where = {
      ...(dateFilter ? { eventDate: dateFilter } : {}),
      ...(filters.eventId ? { id: filters.eventId } : {}),
      ...(filters.location ? { location: { contains: filters.location } } : {}),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const allEvents = await prisma.event.findMany({ where, orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }] });
    const eventIds = allEvents.map((e) => e.id);
    const [allocations, expenseGroups] = await Promise.all([
      loadAllocations(eventIds),
      prisma.eventExpense.groupBy({ by: ['eventId'], _sum: { amount: true }, where: { eventId: { in: eventIds } } }),
    ]);
    const expenseByEvent = new Map(expenseGroups.map((g) => [g.eventId, num(g._sum.amount)]));

    const perEvent = new Map<string, {
      charity: ReturnType<typeof toDecimal>; expense: ReturnType<typeof toDecimal>;
      unclassified: ReturnType<typeof toDecimal>; types: Set<string>;
    }>();
    for (const allocation of allocations) {
      let entry = perEvent.get(allocation.eventId ?? '');
      if (!entry) {
        entry = { charity: toDecimal(0), expense: toDecimal(0), unclassified: toDecimal(0), types: new Set() };
        perEvent.set(allocation.eventId ?? '', entry);
      }
      const key = typeKey(allocation.stockType);
      entry.types.add(key);
      if (key === 'CHARITY') entry.charity = entry.charity.plus(allocationValue(allocation));
      else if (key === 'EXPENSE') entry.expense = entry.expense.plus(allocationValue(allocation));
      else entry.unclassified = entry.unclassified.plus(allocationValue(allocation));
    }

    type LedgerEventRow = {
      id: string; eventCode: string; name: string; eventDate: string; eventType: string | null; location: string | null;
      status: EventStatus; donations: number; charityStock: number; expenseStock: number;
      unclassifiedStock: number; otherExpenses: number; inventoryUtilization: number;
      resourceUtilization: number; cashEventCost: number; cashResult: number;
      result: 'SURPLUS' | 'DEFICIT' | 'BREAK_EVEN'; stockTypes: string[];
    };
    const rows: LedgerEventRow[] = allEvents.map((event) => {
      const cost = perEvent.get(event.id) ?? { charity: toDecimal(0), expense: toDecimal(0), unclassified: toDecimal(0), types: new Set<string>() };
      const charityStock = money(cost.charity);
      const expenseStock = money(cost.expense);
      const unclassifiedStock = money(cost.unclassified);
      const otherExpenses = expenseByEvent.get(event.id) ?? 0;
      const inventoryUtilization = money(cost.charity.plus(cost.expense).plus(cost.unclassified));
      const resourceUtilization = money(toDecimal(inventoryUtilization).plus(otherExpenses));
      const cashEventCost = money(toDecimal(expenseStock).plus(otherExpenses));
      const cashResult = money(toDecimal(num(event.donationAmount)).minus(cashEventCost));
      return {
        id: event.id, eventCode: event.eventCode, name: event.name, eventDate: isoDate(event.eventDate),
        eventType: event.eventType, location: event.location, status: event.status, donations: num(event.donationAmount),
        charityStock, expenseStock, unclassifiedStock, otherExpenses, inventoryUtilization,
        resourceUtilization, cashEventCost, cashResult,
        result: cashResult > 0 ? 'SURPLUS' : cashResult < 0 ? 'DEFICIT' : 'BREAK_EVEN',
        stockTypes: [...cost.types],
      };
    });

    const filtered = rows.filter((row) => {
      if (filters.stockType && filters.stockType !== 'ALL') {
        const needed = filters.stockType === 'UNCLASSIFIED' ? 'UNCLASSIFIED' : filters.stockType;
        if (!row.stockTypes.includes(needed)) return false;
      }
      if (filters.result && filters.result !== 'ALL' && row.result !== filters.result) return false;
      return true;
    });

    const sum = (key: keyof LedgerEventRow, list: LedgerEventRow[]): number =>
      money(list.reduce((totalValue, row) => totalValue.plus(toDecimal(Number(row[key]))), toDecimal(0)));

    const overview = {
      events: filtered.length,
      cashDonations: sum('donations', filtered),
      charityStockUtilized: sum('charityStock', filtered),
      expenseStockConsumed: sum('expenseStock', filtered),
      unclassifiedStock: sum('unclassifiedStock', filtered),
      otherExpenses: sum('otherExpenses', filtered),
      totalResourceUtilization: sum('resourceUtilization', filtered),
      cashEventCost: sum('cashEventCost', filtered),
      cashResult: sum('cashResult', filtered),
    };

    const start = (filters.page - 1) * filters.pageSize;
    return {
      overview,
      events: filtered.slice(start, start + filters.pageSize),
      total: filtered.length,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  },

  /** Current inventory value split by stock type, per item (ADMIN only). */
  async getInventoryTypeSummary() {
    const lots = await prisma.stockLot.findMany({
      where: { status: { in: ['AVAILABLE', 'PARTIALLY_CONSUMED'] }, quantityRemaining: { gt: 0 } },
      include: { foodItem: { select: { id: true, name: true, unit: { select: { symbol: true } } } } },
    });
    const items = new Map<string, {
      foodItemId: string; name: string; unit: string;
      charityQuantity: ReturnType<typeof toDecimal>; expenseQuantity: ReturnType<typeof toDecimal>;
      unclassifiedQuantity: ReturnType<typeof toDecimal>; totalValue: ReturnType<typeof toDecimal>;
      charityValue: ReturnType<typeof toDecimal>; expenseValue: ReturnType<typeof toDecimal>;
    }>();
    for (const lot of lots) {
      const key = lot.foodItemId;
      const entry = items.get(key) ?? {
        foodItemId: key, name: lot.foodItem.name, unit: lot.foodItem.unit.symbol,
        charityQuantity: toDecimal(0), expenseQuantity: toDecimal(0), unclassifiedQuantity: toDecimal(0),
        totalValue: toDecimal(0), charityValue: toDecimal(0), expenseValue: toDecimal(0),
      };
      const quantity = lot.quantityRemaining;
      const value = lot.unitCost === null ? toDecimal(0) : toDecimal(lot.unitCost).times(quantity);
      if (lot.stockType === 'CHARITY') { entry.charityQuantity = entry.charityQuantity.plus(quantity); entry.charityValue = entry.charityValue.plus(value); }
      else if (lot.stockType === 'EXPENSE') { entry.expenseQuantity = entry.expenseQuantity.plus(quantity); entry.expenseValue = entry.expenseValue.plus(value); }
      else entry.unclassifiedQuantity = entry.unclassifiedQuantity.plus(quantity);
      entry.totalValue = entry.totalValue.plus(value);
      items.set(key, entry);
    }
    const list = [...items.values()].map((item) => ({
      foodItemId: item.foodItemId, name: item.name, unit: item.unit,
      charityQuantity: item.charityQuantity.toNumber(), expenseQuantity: item.expenseQuantity.toNumber(),
      unclassifiedQuantity: item.unclassifiedQuantity.toNumber(),
      charityValue: money(item.charityValue), expenseValue: money(item.expenseValue), totalValue: money(item.totalValue),
    }));
    return {
      items: list,
      totals: {
        charityValue: money(list.reduce((s, i) => s.plus(toDecimal(i.charityValue)), toDecimal(0))),
        expenseValue: money(list.reduce((s, i) => s.plus(toDecimal(i.expenseValue)), toDecimal(0))),
        totalValue: money(list.reduce((s, i) => s.plus(toDecimal(i.totalValue)), toDecimal(0))),
      },
    };
  },
};
