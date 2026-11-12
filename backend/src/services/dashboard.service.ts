import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { assignmentRepository } from '../repositories/assignment.repository.js';
import type { Actor } from './event.service.js';
import { env } from '../config/env.js';

/**
 * DASHBOARD SUMMARY SERVICE (read-only, deterministic).
 * No mutations. No AI. Every number is computed from real tables:
 * Event / EventMaterial / FoodItem / Inventory / InventoryTransaction / User.
 *
 * Scope rule (same as events):
 *   ADMIN    -> own events (adminId = actor.id)
 *   EXECUTOR -> events in assigned Admin scope (+ own)
 * Inventory facts are shared operational data visible to both roles
 * (executors already see live stock in the planning UI).
 */

const APP_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateParts(base: Date): { year: number; month: number; day: number } {
  const ist = new Date(base.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

function istToday(): { year: number; month: number; day: number } {
  return istDateParts(new Date());
}

function istDateString(date: Date): string {
  const { year, month, day } = istDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(base: { year: number; month: number; day: number }, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function toDateOnlyString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function resolveEventScope(user: Actor): Promise<Prisma.EventWhereInput> {
  if (user.role === 'ADMIN') {
    return { adminId: user.id };
  }
  const assignment = await assignmentRepository.findActiveByExecutor(user.id);
  if (!assignment) {
    return { adminId: '__unassigned__' };
  }
  return { OR: [{ adminId: assignment.adminId }, { createdBy: user.id }] };
}

function serializeEvent(event: {
  id: string;
  eventCode: string;
  name: string;
  eventDate: Date;
  startTime: string;
  endTime: string | null;
  numberOfPeople: number;
  location: string | null;
  status: string;
  _count?: { dishes: number };
}) {
  return {
    id: event.id,
    eventCode: event.eventCode,
    name: event.name,
    eventDate: event.eventDate.toISOString().slice(0, 10),
    startTime: event.startTime,
    endTime: event.endTime,
    numberOfPeople: event.numberOfPeople,
    location: event.location,
    status: event.status,
    dishCount: event._count?.dishes ?? 0,
  };
}

export const dashboardService = {
  async summary(user: Actor) {
    const today = istToday();
    const todayStr = toDateOnlyString(today.year, today.month, today.day);
    const in14Days = addDays(today, 14);
    const in30Days = addDays(today, 30);
    const tomorrow = addDays(today, 1);
    const todayStart = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const todayEnd = new Date(Date.UTC(tomorrow.year, tomorrow.month - 1, tomorrow.day));
    const upcomingEnd = new Date(Date.UTC(in14Days.year, in14Days.month - 1, in14Days.day + 1));
    const to30 = new Date(Date.UTC(in30Days.year, in30Days.month - 1, in30Days.day + 1));

    const scope = await resolveEventScope(user);

    // ---- Event data (scoped) ----
    const [scopedToday, scopedUpcoming, scopedLongRange] = await Promise.all([
      prisma.event.findMany({
        where: { AND: [scope, { eventDate: { gte: todayStart, lt: todayEnd } }] },
        orderBy: [{ startTime: 'asc' }],
        include: { _count: { select: { dishes: true } } },
      }),
      prisma.event.findMany({
        where: {
          AND: [scope, { eventDate: { gte: todayEnd, lt: upcomingEnd } }],
        },
        orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
        take: 5,
        include: { _count: { select: { dishes: true } } },
      }),
      prisma.event.findMany({
        where: {
          AND: [
            scope,
            { status: { in: ['PLANNING', 'READY'] }, eventDate: { gte: todayStart, lt: to30 } },
          ],
        },
        select: { id: true, name: true, eventDate: true },
      }),
    ]);

    const todaysEvents = scopedToday.map(serializeEvent);
    const upcomingEvents = scopedUpcoming.map(serializeEvent);

    if (user.role !== 'ADMIN') {
      // Executor gets an events-focused summary plus request counts so the Request UI can render counts.
      const requestWhere: Prisma.MaterialRequestWhereInput = { requestedById: user.id };
      const [pendingCount, pRequests] = await Promise.all([
        prisma.materialRequest.count({ where: { ...requestWhere, status: 'PENDING_APPROVAL' } }),
        prisma.materialRequest.findMany({
          where: { ...requestWhere, status: 'PENDING_APPROVAL' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            event: { select: { id: true, name: true, eventDate: true } },
            _count: { select: { items: true } },
          },
        }),
      ]);
      return {
        role: 'EXECUTOR' as const,
        generatedAt: new Date().toISOString(),
        timezone: env.NODE_ENV === 'test' ? 'UTC' : APP_TIMEZONE,
        today: todayStr,
        todaysEvents,
        upcomingEvents,
        pendingRequests: {
          pendingCount,
          items: pRequests.map((r) => ({
            id: r.id,
            requestCode: r.requestCode,
            eventId: r.eventId,
            eventName: r.event.name,
            eventDate: r.event.eventDate.toISOString().slice(0, 10),
            itemCount: r._count.items,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          })),
        },
        kpis: {
          pendingRequestCount: pendingCount,
        },
      };
    }

    // ---- Pending material requests (ADMIN scope) ----
    const pendingRequestsRaw = await prisma.materialRequest.findMany({
      where: { adminId: user.id, status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        event: { select: { id: true, name: true, eventDate: true, numberOfPeople: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { items: true } },
      },
    });
    const pendingApprovalCount = await prisma.materialRequest.count({ where: { adminId: user.id, status: 'PENDING_APPROVAL' } });
    const draftCount = await prisma.materialRequest.count({ where: { adminId: user.id, status: 'DRAFT' } });
    // Recent trend for top items: STOCK_OUT count last 7 days vs previous 7 days (deterministic)
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [recentOut, previousOut] = await Promise.all([
      prisma.inventoryTransaction.groupBy({ by: ['foodItemId'], where: { transactionType: 'STOCK_OUT', createdAt: { gte: last7 } }, _count: { id: true } }),
      prisma.inventoryTransaction.groupBy({ by: ['foodItemId'], where: { transactionType: 'STOCK_OUT', createdAt: { gte: last14, lt: last7 } }, _count: { id: true } }),
    ]);
    const itemNames = await prisma.foodItem.findMany({ where: { id: { in: [...recentOut, ...previousOut].map((g) => g.foodItemId) } }, select: { id: true, name: true } });
    const nameMap = new Map(itemNames.map((i) => [i.id, i.name]));
    const demandTrend = recentOut
      .map((g) => {
        const prev = previousOut.find((p) => p.foodItemId === g.foodItemId)?._count.id ?? 0;
        const cur = g._count.id;
        const delta = prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
        return {
          foodItemId: g.foodItemId,
          name: nameMap.get(g.foodItemId) ?? 'Unknown',
          recentCount: cur,
          previousCount: prev,
          deltaPct: delta,
          trend: delta > 10 ? ('increasing' as const) : delta < -10 ? ('decreasing' as const) : ('stable' as const),
        };
      })
      .sort((a, b) => b.recentCount - a.recentCount)
      .slice(0, 3);
    const allItems = await prisma.foodItem.findMany({ select: { id: true, name: true } });
    const txCount = await prisma.inventoryTransaction.groupBy({ by: ['foodItemId'], _count: { id: true } });
    const hasData = txCount.length > 0;
    const notEnoughDataFor = allItems.filter((i) => !txCount.some((t) => t.foodItemId === i.id)).map((i) => i.name).slice(0, 3);

    // ---- Inventory facts (ADMIN sees the full operational picture) ----
    const inventories = await prisma.inventory.findMany({
      include: {
        foodItem: {
          select: { id: true, name: true, isActive: true, minimumStock: true, reorderLevel: true, unit: { select: { symbol: true } } },
        },
      },
    });

    let totalActiveItems = 0;
    let totalStock = 0;
    let itemsInStock = 0;
    let outOfStock = 0;
    let critical = 0;
    let low = 0;
    let healthy = 0;
    // Mixed units (kg / L / pcs …) can never be summed meaningfully, so the
    // KPI card shows coverage + a per-unit breakdown instead of one total.
    const stockByUnit = new Map<string, number>();
    const lowStockItems: { id: string; name: string; quantity: number; minimumStock: number; reorderLevel: number; unit: string }[] = [];

    for (const row of inventories) {
      if (row.foodItem.isActive) totalActiveItems += 1;
      totalStock += row.currentQuantity;
      if (row.currentQuantity > 0) itemsInStock += 1;
      const unitSymbol = row.foodItem.unit.symbol;
      stockByUnit.set(unitSymbol, (stockByUnit.get(unitSymbol) ?? 0) + row.currentQuantity);
      const qty = row.currentQuantity;
      if (qty === 0) {
        outOfStock += 1;
        if (row.foodItem.isActive) lowStockItems.push({ id: row.foodItem.id, name: row.foodItem.name, quantity: 0, minimumStock: row.foodItem.minimumStock, reorderLevel: row.foodItem.reorderLevel, unit: row.foodItem.unit.symbol });
      } else if (qty <= row.foodItem.minimumStock) {
        critical += 1;
        if (row.foodItem.isActive) lowStockItems.push({ id: row.foodItem.id, name: row.foodItem.name, quantity: qty, minimumStock: row.foodItem.minimumStock, reorderLevel: row.foodItem.reorderLevel, unit: row.foodItem.unit.symbol });
      } else if (qty <= row.foodItem.reorderLevel) {
        low += 1;
        if (row.foodItem.isActive) lowStockItems.push({ id: row.foodItem.id, name: row.foodItem.name, quantity: qty, minimumStock: row.foodItem.minimumStock, reorderLevel: row.foodItem.reorderLevel, unit: row.foodItem.unit.symbol });
      } else {
        healthy += 1;
      }
    }
    lowStockItems.sort((a, b) => a.quantity - b.quantity);

    // ---- Stock movement (last 7 days, IST) ----
    const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const recentTx = await prisma.inventoryTransaction.findMany({
      where: {
        createdAt: { gte: weekAgo },
        transactionType: { in: ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN'] },
      },
      select: { quantity: true, transactionType: true, createdAt: true },
    });
    const movementMap = new Map<string, { stockIn: number; stockOut: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      movementMap.set(istDateString(d), { stockIn: 0, stockOut: 0 });
    }
    for (const tx of recentTx) {
      const key = istDateString(tx.createdAt);
      const bucket = movementMap.get(key);
      if (!bucket) continue;
      if (tx.transactionType === 'STOCK_IN' || tx.transactionType === 'RETURN') bucket.stockIn += tx.quantity;
      if (tx.transactionType === 'STOCK_OUT') bucket.stockOut += tx.quantity;
    }
    const stockMovement7d = [...movementMap.entries()].map(([date, values]) => ({ date, ...values }));

    // "Stock Today" reuses TODAY'S BUCKET from the chart above rather than
    // re-querying, so the KPI and the 7-day chart can never disagree again.
    // Quantities (not transaction counts), and an accepted RETURN counts as
    // stock-in — it physically restocks inventory, exactly like the chart.
    const todayBucket = movementMap.get(istDateString(new Date())) ?? { stockIn: 0, stockOut: 0 };
    const stockInToday = todayBucket.stockIn;
    const stockOutToday = todayBucket.stockOut;

    // ---- Frequently used items (all-time, deterministic) ----
    const topGroups = await prisma.inventoryTransaction.groupBy({
      by: ['foodItemId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });
    const topIds = topGroups.map((g) => g.foodItemId);
    const topItems = topIds.length
      ? await prisma.foodItem.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(topItems.map((item) => [item.id, item.name]));
    const frequentlyUsedItems = topGroups.map((group) => ({
      foodItemId: group.foodItemId,
      name: nameById.get(group.foodItemId) ?? 'Unknown',
      transactionCount: group._count.id,
    }));

    // ---- Recent activity (last 10) ----
    const recentRaw = await prisma.inventoryTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { foodItem: { select: { name: true } } },
    });
    const actorIds = [...new Set(recentRaw.map((tx) => tx.performedBy).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, `${actor.firstName} ${actor.lastName}`]));
    const recentActivity = recentRaw.map((tx) => ({
      id: tx.id,
      item: tx.foodItem.name,
      transactionType: tx.transactionType,
      quantity: tx.quantity,
      createdAt: tx.createdAt.toISOString(),
      performedBy: tx.performedBy ? actorById.get(tx.performedBy) ?? 'Unknown' : 'System',
    }));

    // ---- Deterministic operational alerts ----
    const alerts: { id: string; severity: 'danger' | 'warning' | 'info'; title: string; detail: string }[] = [];
    for (const item of lowStockItems.filter((i) => i.quantity === 0).slice(0, 2)) {
      alerts.push({ id: `out-${item.id}`, severity: 'danger', title: `${item.name} is out of stock`, detail: `Current stock 0 ${item.unit}. Reorder immediately.` });
    }
    for (const item of lowStockItems.filter((i) => i.quantity > 0).slice(0, 2)) {
      alerts.push({ id: `low-${item.id}`, severity: 'warning', title: `${item.name} running low`, detail: `${item.quantity} ${item.unit} remaining — reorder level ${item.reorderLevel} ${item.unit}.` });
    }

    const largeEvents = scopedUpcoming.filter((event) => event.numberOfPeople >= 200);
    for (const event of largeEvents.slice(0, 2)) {
      alerts.push({
        id: `large-${event.id}`,
        severity: 'info',
        title: `Large event: ${event.name}`,
        detail: `${event.numberOfPeople} people on ${event.eventDate.toISOString().slice(0, 10)}. Review material planning.`,
      });
    }

    if (scopedLongRange.length > 0) {
      const shortEvents = scopedLongRange.slice(0, 3);
      for (const event of shortEvents) {
        const lines = await prisma.eventMaterial.findMany({
          where: { eventDish: { eventId: event.id } },
          select: { plannedQuantity: true, foodItemId: true, foodItem: { select: { name: true, inventory: { select: { currentQuantity: true } }, unit: { select: { symbol: true } } } } },
        });
        const plannedByItem = new Map<string, { name: string; planned: number; current: number; unit: string }>();
        for (const line of lines) {
          const existing = plannedByItem.get(line.foodItemId);
          if (existing) {
            existing.planned += Number(line.plannedQuantity);
          } else {
            plannedByItem.set(line.foodItemId, {
              name: line.foodItem.name,
              planned: Number(line.plannedQuantity),
              current: line.foodItem.inventory?.currentQuantity ?? 0,
              unit: line.foodItem.unit.symbol,
            });
          }
        }
        for (const [foodItemId, aggregate] of plannedByItem) {
          if (aggregate.planned > aggregate.current) {
            alerts.push({
              id: `shortfall-${event.id}-${foodItemId}`,
              severity: 'danger',
              title: `Insufficient stock for ${event.name}`,
              detail: `Planned ${aggregate.planned} ${aggregate.unit} of ${aggregate.name}, only ${aggregate.current} ${aggregate.unit} in stock.`,
            });
          }
        }
      }
    }

    return {
      role: 'ADMIN' as const,
      generatedAt: new Date().toISOString(),
      timezone: APP_TIMEZONE,
      today: todayStr,
      kpis: {
        totalFoodItems: totalActiveItems,
        totalCurrentStock: totalStock,
        /** Coverage: how many tracked items actually hold stock right now. */
        itemsInStock,
        totalItems: inventories.length,
        lowStockCount: low,
        criticalCount: critical,
        outOfStockCount: outOfStock,
        healthyCount: healthy,
        todaysEventCount: todaysEvents.length,
        stockInToday,
        stockOutToday,
        pendingRequestCount: pendingApprovalCount,
        draftRequestCount: draftCount,
        reorderRequiredCount: low + critical + outOfStock,
      },
      /** Per-unit totals — the only honest way to total mixed units of measure. */
      stockByUnit: [...stockByUnit.entries()]
        .map(([unit, quantity]) => ({ unit, quantity }))
        .sort((a, b) => b.quantity - a.quantity),
      todaysEvents,
      upcomingEvents,
      lowStockItems: lowStockItems.slice(0, 6),
      inventoryHealth: { healthy, low, critical, outOfStock },
      reorderRequired: lowStockItems.slice(0, 6),
      stockMovement7d,
      frequentlyUsedItems,
      recentActivity,
      alerts,
      demandTrend,
      hasData,
      notEnoughDataFor,
      pendingRequests: {
        pendingCount: pendingApprovalCount,
        draftCount,
        items: pendingRequestsRaw.map((r) => ({
          id: r.id,
          requestCode: r.requestCode,
          eventId: r.eventId,
          eventName: r.event.name,
          eventDate: r.event.eventDate.toISOString().slice(0, 10),
          itemCount: r._count.items,
          status: r.status,
          requestedBy: `${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim(),
          createdAt: r.createdAt.toISOString(),
        })),
      },
    };
  },
};
