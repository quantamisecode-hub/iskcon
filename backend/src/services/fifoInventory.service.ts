import { Prisma } from '@prisma/client';
import type { StockLot, StockType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/error.middleware.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

/**
 * CORE FIFO LOT-BASED INVENTORY ENGINE.
 *
 * Every quantity and cost calculation here uses Prisma.Decimal. JavaScript
 * floating point is used ONLY at the API boundary (the `number` fields of the
 * public contract) — never inside an allocation or cost computation.
 *
 * Historical rows (StockLot.quantityReceived, StockAllocation.*, old ledger
 * rows) are immutable: this engine never rewrites them. It only moves the
 * current state (lot remainder, Inventory.currentQuantity) and appends new
 * immutable rows.
 */

/** Lots that can still be consumed by FIFO. */
const ELIGIBLE_STATUSES = ['AVAILABLE', 'PARTIALLY_CONSUMED'] as const;

/** A `number` → `Prisma.Decimal` conversion that avoids binary float artifacts. */
export function toDecimal(value: number | string | Prisma.Decimal | bigint | null | undefined, fallback = 0): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(value.toString());
}

/** Money columns are Decimal(12,2)/Decimal(14,2) — round once, at write time. */
export function roundedMoney(value: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function toDateOnly(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

export interface FifoAllocationLine {
  stockLotId: string;
  lotNumber: string;
  foodItemId: string;
  vendorId: string | null;
  vendorName: string | null;
  /** Classification of the source lot — derived, never supplied by the client. */
  stockType: StockType | null;
  receivedDate: string; // YYYY-MM-DD
  quantityAllocated: number;
  unitCost: number | null;
  totalCost: number | null;
}

export interface FifoPreview {
  foodItemId: string;
  requestedQuantity: number;
  availableQuantity: number;
  allocations: FifoAllocationLine[];
  totalCost: number | null;
  averageCost: number | null;
  sufficient: boolean;
}

/** Optional extension of the documented input contract, used by callers that
 *  need a single ledger row to carry their idempotency key (the key is stamped
 *  on the FIRST ledger row only — every other row stays keyless). */
export interface FifoAllocationInput {
  foodItemId: string;
  quantity: number;
  actorId: string;
  requestId?: string | null;
  eventId?: string | null;
  referenceType: string;
  referenceId?: string | null;
  remarks?: string | null;
  idempotencyKey?: string | null;
}

export interface FifoAllocationResult {
  allocations: FifoAllocationLine[];
  totalCost: number | null;
  transactions: Array<{ id: string; stockLotId: string | null }>;
  balanceBefore: number;
  balanceAfter: number;
}

/** Input accepted by the internal `createStockLot` helper. `quantityReceived`
 *  and `quantity` are aliases; `totalCost` is derived from unitCost × quantity
 *  when omitted. Dates accept a Date or a YYYY-MM-DD string. */
export interface CreateStockLotInput {
  foodItemId: string;
  quantityReceived?: number | string | Prisma.Decimal;
  /** Alias for quantityReceived (convenient for return receipts). */
  quantity?: number | string | Prisma.Decimal;
  vendorId?: string | null;
  /** Financial classification. NULL only for legacy/unclassified opening lots. */
  stockType?: StockType | null;
  /** Donor credited on CHARITY lots only. */
  donorName?: string | null;
  purchaseDate?: Date | string | null;
  receivedDate?: Date | string | null;
  unitCost?: number | string | Prisma.Decimal | null;
  totalCost?: number | string | Prisma.Decimal | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
  status?: string;
}

type LotReader = Pick<Prisma.TransactionClient, 'stockLot'>;

const lotInclude = { vendor: { select: { name: true } } } satisfies Prisma.StockLotInclude;
type EligibleLot = Prisma.StockLotGetPayload<{ include: typeof lotInclude }>;

interface PlannedAllocation {
  lot: EligibleLot;
  take: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  lineTotal: Prisma.Decimal | null;
}

/** Eligible lots in strict FIFO order. The mutating path passes the ids it
 *  just locked, so the rows are re-read only after the locks are held. */
async function findEligibleLots(
  client: LotReader,
  foodItemId: string,
  options: { ids?: string[] } = {},
): Promise<EligibleLot[]> {
  return client.stockLot.findMany({
    where: {
      foodItemId,
      status: { in: [...ELIGIBLE_STATUSES] },
      quantityRemaining: { gt: 0 },
      ...(options.ids ? { id: { in: options.ids } } : {}),
    },
    include: lotInclude,
    orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
}

function planAllocations(lots: EligibleLot[], requested: Prisma.Decimal): PlannedAllocation[] {
  const plan: PlannedAllocation[] = [];
  let remaining = requested;
  for (const lot of lots) {
    if (remaining.isZero()) break;
    const available = toDecimal(lot.quantityRemaining);
    if (available.lte(0)) continue;
    const take = remaining.lessThanOrEqualTo(available) ? remaining : available;
    const unitCost = lot.unitCost === null ? null : toDecimal(lot.unitCost);
    const lineTotal = unitCost === null ? null : roundedMoney(unitCost.times(take));
    plan.push({ lot, take, unitCost, lineTotal });
    remaining = remaining.minus(take);
  }
  return plan;
}

function planTotalCost(plan: PlannedAllocation[]): Prisma.Decimal | null {
  const costs = plan.filter((line) => line.lineTotal !== null);
  if (costs.length === 0) return null;
  return costs.reduce((sum, line) => sum.plus(line.lineTotal as Prisma.Decimal), new Prisma.Decimal(0));
}

function allocationLine(entry: PlannedAllocation): FifoAllocationLine {
  return {
    stockLotId: entry.lot.id,
    lotNumber: entry.lot.lotNumber,
    foodItemId: entry.lot.foodItemId,
    vendorId: entry.lot.vendorId ?? null,
    vendorName: entry.lot.vendor?.name ?? null,
    stockType: entry.lot.stockType ?? null,
    receivedDate: isoDate(entry.lot.receivedDate),
    quantityAllocated: entry.take.toNumber(),
    unitCost: entry.unitCost === null ? null : entry.unitCost.toNumber(),
    totalCost: entry.lineTotal === null ? null : entry.lineTotal.toNumber(),
  };
}

/**
 * Atomic per-year lot number sequence: LOT-YYYYMMDD-NNNNNN.
 * The upsert + SELECT pattern matches event.repository.ts / materialReturn
 * repository.ts: a native MySQL upsert holds a row lock until commit, so
 * concurrent creators always receive a distinct number.
 */
export async function nextLotNumber(tx: Prisma.TransactionClient): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const year = Number(datePart.slice(0, 4));
  await tx.$executeRaw`
    INSERT INTO \`StockLotCodeCounter\` (\`year\`, \`lastNumber\`)
    VALUES (${year}, 1)
    ON DUPLICATE KEY UPDATE \`lastNumber\` = \`lastNumber\` + 1
  `;
  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    SELECT \`lastNumber\` FROM \`StockLotCodeCounter\` WHERE \`year\` = ${year}
  `;
  const lastNumber = rows[0]?.lastNumber ?? 1;
  return `LOT-${datePart}-${String(lastNumber).padStart(6, '0')}`;
}

/** Create a stock lot with a server-generated lot number. Caller must pass a tx. */
export async function createStockLot(tx: Prisma.TransactionClient, input: CreateStockLotInput): Promise<StockLot> {
  const quantity = input.quantityReceived ?? input.quantity;
  if (quantity === undefined || quantity === null) {
    throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Lot quantity is required.' });
  }
  const qty = toDecimal(quantity);
  if (qty.lte(0)) {
    throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Lot quantity must be positive.' });
  }

  const unitCost = input.unitCost === null || input.unitCost === undefined ? null : toDecimal(input.unitCost);
  let totalCost: Prisma.Decimal | null = null;
  if (input.totalCost !== undefined && input.totalCost !== null) {
    totalCost = roundedMoney(toDecimal(input.totalCost));
  } else if (unitCost !== null) {
    totalCost = roundedMoney(unitCost.times(qty));
  }

  const lotNumber = await nextLotNumber(tx);
  return tx.stockLot.create({
    data: {
      lotNumber,
      foodItemId: input.foodItemId,
      vendorId: input.vendorId ?? null,
      stockType: input.stockType ?? null,
      donorName: input.stockType === 'CHARITY' ? input.donorName ?? null : null,
      purchaseDate: toDateOnly(input.purchaseDate),
      receivedDate: toDateOnly(input.receivedDate) ?? new Date(),
      quantityReceived: qty,
      quantityRemaining: qty,
      unitCost,
      totalCost,
      status: input.status ?? 'AVAILABLE',
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

/**
 * NON-MUTATING, deterministic FIFO preview. Costs are returned as numbers for
 * the UI, but every arithmetic step is Decimal. Insufficient stock is reported
 * via `sufficient: false` and the preview shows the lots that would be used.
 */
export async function previewFifoAllocation(foodItemId: string, quantity: number): Promise<FifoPreview> {
  const requested = toDecimal(quantity);
  if (requested.lte(0)) {
    throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Quantity must be positive.' });
  }

  const lots = await findEligibleLots(prisma, foodItemId);
  let available = lots.reduce((sum, lot) => sum.plus(toDecimal(lot.quantityRemaining)), new Prisma.Decimal(0));
  const plan = planAllocations(lots, requested);

  // Legacy inventory rows created before lots existed (or by imports) still
  // carry a usable balance. Expose it honestly as an opening balance with no
  // known cost — never invent a purchase price or date.
  const inventory = await prisma.inventory.findUnique({ where: { foodItemId } });
  const balance = toDecimal(inventory?.currentQuantity ?? 0);
  const allocations = plan.map(allocationLine);
  if (available.lessThan(requested) && balance.greaterThan(available)) {
    const legacy = balance.minus(available);
    available = balance;
    allocations.push({
      stockLotId: 'LEGACY-OPENING',
      lotNumber: 'OPENING BALANCE',
      foodItemId,
      vendorId: null,
      vendorName: null,
      stockType: null,
      receivedDate: isoDate(new Date()),
      quantityAllocated: Math.min(legacy.toNumber(), requested.toNumber() - plan.reduce((s, l) => s + l.take.toNumber(), 0)),
      unitCost: null,
      totalCost: null,
    });
  }
  const totalCost = planTotalCost(plan);
  const allocatedQuantity = plan.reduce((sum, line) => sum.plus(line.take), new Prisma.Decimal(0));

  return {
    foodItemId,
    requestedQuantity: requested.toNumber(),
    availableQuantity: available.toNumber(),
    allocations,
    totalCost: totalCost === null ? null : totalCost.toNumber(),
    averageCost: totalCost === null || allocatedQuantity.isZero() ? null : totalCost.div(allocatedQuantity).toNumber(),
    sufficient: available.greaterThanOrEqualTo(requested),
  };
}

/**
 * Consume stock FIFO inside an existing transaction.
 *
 * Lock order: Inventory row FIRST (by the caller and again here — re-locking a
 * row already held by this transaction is harmless), then eligible lots in
 * FIFO order. Lot state is re-read AFTER locking, so a concurrent consumer can
 * never spend the same remainder twice. Allocation is all-or-nothing.
 */
export async function allocateStockFifo(tx: Prisma.TransactionClient, input: FifoAllocationInput): Promise<FifoAllocationResult> {
  const requested = toDecimal(input.quantity);
  if (requested.lte(0)) {
    throw new ApiError({ statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR, message: 'Quantity must be positive.' });
  }

  await tx.$queryRaw`SELECT id FROM \`Inventory\` WHERE foodItemId = ${input.foodItemId} FOR UPDATE`;

  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM \`StockLot\`
    WHERE foodItemId = ${input.foodItemId}
      AND status IN ('AVAILABLE', 'PARTIALLY_CONSUMED')
      AND quantityRemaining > 0
    ORDER BY receivedDate ASC, createdAt ASC, id ASC
    FOR UPDATE
  `;
  const ids = locked.map((row) => row.id);
  let lots = ids.length > 0
    ? await findEligibleLots(tx, input.foodItemId, { ids })
    : [];

  const inventory = await tx.inventory.findUnique({ where: { foodItemId: input.foodItemId } });
  const rawBalance = toDecimal(inventory?.currentQuantity ?? 0);
  let available = lots.reduce((sum, lot) => sum.plus(toDecimal(lot.quantityRemaining)), new Prisma.Decimal(0));

  // Legacy inventory rows created before lots existed (or by imports) still
  // carry a usable balance. Materialise it as an OPENING_BALANCE lot with no
  // known cost so FIFO can consume it honestly — never invent a price/date.
  if (available.lessThan(requested) && rawBalance.greaterThan(available)) {
    await createStockLot(tx, {
      foodItemId: input.foodItemId,
      quantityReceived: rawBalance.minus(available),
      referenceType: 'OPENING_BALANCE',
      receivedDate: new Date(),
      createdBy: input.actorId,
    });
    const relocked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM \`StockLot\`
      WHERE foodItemId = ${input.foodItemId}
        AND status IN ('AVAILABLE', 'PARTIALLY_CONSUMED')
        AND quantityRemaining > 0
      ORDER BY receivedDate ASC, createdAt ASC, id ASC
      FOR UPDATE
    `;
    lots = await findEligibleLots(tx, input.foodItemId, { ids: relocked.map((row) => row.id) });
    available = lots.reduce((sum, lot) => sum.plus(toDecimal(lot.quantityRemaining)), new Prisma.Decimal(0));
  }

  if (available.lessThan(requested)) {
    throw new ApiError({
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      message: `Not enough stock — insufficient stock. Available quantity: ${available.toString()}`,
    });
  }

  const balanceBefore = Prisma.Decimal.max(rawBalance, available);
  let runningBalance = balanceBefore;

  // Explicit non-negative guard. A correctly maintained system has
  // balanceBefore >= requested, but a legacy/imported cache must never be
  // pushed below zero.
  let balanceAfter = balanceBefore.minus(requested);
  if (balanceAfter.isNegative()) balanceAfter = new Prisma.Decimal(0);

  const plan = planAllocations(lots, requested);
  const totalCost = planTotalCost(plan);
  const transactions: Array<{ id: string; stockLotId: string | null }> = [];

  for (const [index, entry] of plan.entries()) {
    const remaining = toDecimal(entry.lot.quantityRemaining).minus(entry.take);
    const status = remaining.isZero() ? 'CONSUMED' : 'PARTIALLY_CONSUMED';
    await tx.stockLot.update({
      where: { id: entry.lot.id },
      data: { quantityRemaining: remaining, status },
    });

    const lineBalanceBefore = runningBalance;
    let lineBalanceAfter = lineBalanceBefore.minus(entry.take);
    if (lineBalanceAfter.isNegative()) lineBalanceAfter = new Prisma.Decimal(0);

    const ledger = await tx.inventoryTransaction.create({
      data: {
        foodItemId: input.foodItemId,
        transactionType: 'STOCK_OUT',
        quantity: entry.take,
        balanceBefore: lineBalanceBefore,
        balanceAfter: lineBalanceAfter,
        unitCost: entry.unitCost,
        totalCost: entry.lineTotal,
        stockLotId: entry.lot.id,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        performedBy: input.actorId,
        remarks: input.remarks?.trim() || null,
        // Only the representative (first) row carries the caller's key so a
        // duplicate request is detected by the outer service's idempotency
        // lookup without creating a second movement.
        idempotencyKey: index === 0 ? (input.idempotencyKey ?? null) : null,
      },
    });

    await tx.stockAllocation.create({
      data: {
        stockLotId: entry.lot.id,
        foodItemId: input.foodItemId,
        transactionId: ledger.id,
        requestId: input.requestId ?? null,
        eventId: input.eventId ?? null,
        quantityAllocated: entry.take,
        unitCost: entry.unitCost,
        totalCost: entry.lineTotal,
        allocatedAt: new Date(),
        createdBy: input.actorId,
      },
    });

    transactions.push({ id: ledger.id, stockLotId: entry.lot.id });
    runningBalance = lineBalanceAfter;
  }

  const remainingLotsSum = await tx.stockLot.aggregate({
    where: {
      foodItemId: input.foodItemId,
      status: { in: ['AVAILABLE', 'PARTIALLY_CONSUMED'] },
      quantityRemaining: { gt: 0 },
    },
    _sum: { quantityRemaining: true },
  });
  const actualRemaining = remainingLotsSum._sum.quantityRemaining ?? new Prisma.Decimal(0);
  const finalBalanceAfter = Prisma.Decimal.max(balanceAfter, actualRemaining);

  await tx.inventory.upsert({
    where: { foodItemId: input.foodItemId },
    update: { currentQuantity: finalBalanceAfter },
    create: { foodItemId: input.foodItemId, currentQuantity: finalBalanceAfter },
  });

  return {
    allocations: plan.map(allocationLine),
    totalCost: totalCost === null ? null : totalCost.toNumber(),
    transactions,
    balanceBefore: balanceBefore.toNumber(),
    balanceAfter: finalBalanceAfter.toNumber(),
  };
}
