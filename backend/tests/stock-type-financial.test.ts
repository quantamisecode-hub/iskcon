import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * STOCK TYPE (CHARITY / EXPENSE) + EVENT FINANCIAL LEDGER
 * Real HTTP + real DB. No mocks. FIFO ordering is never type-partitioned;
 * the classification only travels with the consumed lot.
 */
const app = createApp();
const prisma = getTestClient();

const createdUserIds: string[] = [];
const createdFoodItemIds: string[] = [];
const createdVendorIds: string[] = [];
const createdEventIds: string[] = [];
let adminCookie = '';
let executorCookie = '';
let adminId = '';
let foodItemId = '';
let vendorId = '';

async function createUser(role: 'ADMIN' | 'EXECUTOR'): Promise<{ id: string; email: string; password: string; cookie: string }> {
  const password = `ValidPass${randomUUID()}-st!`;
  const user = await authService.createUserRecord({
    firstName: 'Stock', lastName: role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `stocktype-${role.toLowerCase()}-${randomUUID()}@example.test`, password, role,
  });
  createdUserIds.push(user.id);
  const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  const setCookie = res.headers['set-cookie'];
  return { id: user.id, email: user.email, password, cookie: Array.isArray(setCookie) ? String(setCookie[0]).split(';')[0] : '' };
}

async function stockIn(type: 'CHARITY' | 'EXPENSE', quantity: number, unitCost: number, receivedDate: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/v1/food-items/${foodItemId}/stock-in`)
    .set('Cookie', adminCookie)
    .send({ quantity, stockType: type, unitCost, receivedDate, ...(type === 'CHARITY'
      ? { donorName: `Test Donor ${randomUUID().slice(0, 6)}` }
      : { vendorId }), ...extra });
}

const lots = async () => prisma.stockLot.findMany({
  where: { foodItemId },
  orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
});

beforeAll(async () => {
  const admin = await createUser('ADMIN');
  adminId = admin.id;
  adminCookie = admin.cookie;
  const executor = await createUser('EXECUTOR');
  executorCookie = executor.cookie;
  await prisma.adminExecutorAssignment.create({ data: { adminId, executorId: (await prisma.user.findUniqueOrThrow({ where: { email: executor.email } })).id } });

  const category = await prisma.category.create({ data: { name: `STCat-${randomUUID()}` } });
  const unit = await prisma.unit.create({ data: { name: `STUnit-${randomUUID()}`, symbol: `S${randomUUID().slice(0, 5).toUpperCase()}`, unitType: 'WEIGHT' } });
  const food = await prisma.foodItem.create({
    data: { name: `STRice-${randomUUID().slice(0, 8)}`, categoryId: category.id, unitId: unit.id, minimumStock: 1, reorderLevel: 1 },
  });
  foodItemId = food.id;
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: 0 } });
  createdFoodItemIds.push(food.id);

  const vendor = await prisma.vendor.create({ data: { name: `STVendor-${randomUUID().slice(0, 8)}` } });
  vendorId = vendor.id;
  createdVendorIds.push(vendor.id);
});

afterAll(async () => {
  await withDeadlockRetry(async () => {
    const eventIds = createdEventIds;
    await prisma.eventExpense.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.stockAllocation.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
    await prisma.stockLot.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.inventory.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
    await prisma.foodItem.deleteMany({ where: { id: { in: createdFoodItemIds } } });
    await prisma.vendor.deleteMany({ where: { id: { in: createdVendorIds } } });
    await prisma.adminExecutorAssignment.deleteMany({ where: { adminId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

describe('Stock type on StockLot', () => {
  it('persists CHARITY and EXPENSE on separate lots of the same item', async () => {
    expect((await stockIn('CHARITY', 100, 15, '2026-11-01')).status).toBe(200);
    expect((await stockIn('EXPENSE', 200, 20, '2026-11-10')).status).toBe(200);
    expect((await stockIn('CHARITY', 150, 22, '2026-11-18')).status).toBe(200);
    const rows = await lots();
    expect(rows.map((lot) => lot.stockType)).toEqual(['CHARITY', 'EXPENSE', 'CHARITY']);
    expect(rows[0].donorName).toMatch(/Test Donor/);
    expect(rows[1].donorName).toBeNull();
    expect(rows.map((lot) => Number(lot.unitCost))).toEqual([15, 20, 22]);
  });

  it('rejects arbitrary types, missing type and client-supplied totals', async () => {
    const bad = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-in`).set('Cookie', adminCookie)
      .send({ quantity: 1, stockType: 'donated' });
    expect(bad.status).toBe(400);
    const missing = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-in`).set('Cookie', adminCookie)
      .send({ quantity: 1 });
    expect(missing.status).toBe(400);
    const mass = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-in`).set('Cookie', adminCookie)
      .send({ quantity: 1, stockType: 'EXPENSE', totalCost: 999999 });
    expect(mass.status).toBe(400);
    const charityNoDonor = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-in`).set('Cookie', adminCookie)
      .send({ quantity: 1, stockType: 'CHARITY' });
    expect(charityNoDonor.status).toBe(400);
    const charityVendor = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-in`).set('Cookie', adminCookie)
      .send({ quantity: 1, stockType: 'CHARITY', donorName: 'Donor', vendorId });
    expect(charityVendor.status).toBe(400);
    const expenseDonor = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-in`).set('Cookie', adminCookie)
      .send({ quantity: 1, stockType: 'EXPENSE', donorName: 'Donor' });
    expect(expenseDonor.status).toBe(400);
  });

  it('FIFO ignores stock type for ordering, but allocations stay traceable to the exact lot', async () => {
    // Older CHARITY (100 @15) then EXPENSE (80 @20) — not "all charity first".
    const res = await request(app).post(`/api/v1/food-items/${foodItemId}/stock-out`)
      .set('Cookie', adminCookie).send({ quantity: 180, reason: 'stock type test' });
    expect(res.status).toBe(200);
    const allocations = await prisma.stockAllocation.findMany({
      where: { foodItemId }, orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }], include: { stockLot: true },
    });
    const firstTwo = allocations.slice(-2);
    expect(firstTwo.map((a) => a.stockLot.stockType)).toEqual(['CHARITY', 'EXPENSE']);
    expect(firstTwo.map((a) => Number(a.quantityAllocated))).toEqual([100, 80]);
    expect(firstTwo.map((a) => Number(a.unitCost))).toEqual([15, 20]);
  });
});

describe('Event financial statement', () => {
  it('splits charity vs expense consumption and excludes charity from cash cost', async () => {
    const created = await request(app).post('/api/v1/events').set('Cookie', adminCookie).send({
      name: 'Stock Type Prasadam', eventDate: '2026-12-20', startTime: '10:00', numberOfPeople: 100,
      donationAmount: 100000, donationGivenBy: 'Test Donor', eventType: 'BACE',
      contactPerson: 'Test Contact', mobileNumber: '7000000000',
    });
    expect(created.status).toBe(201);
    const eventId = String(created.body.data.id);
    createdEventIds.push(eventId);

    const currentLots = await lots();
    const expenseLot = currentLots.find((lot) => lot.stockType === 'EXPENSE')!;
    const charityLot = currentLots.find((lot) => lot.stockType === 'CHARITY' && Number(lot.quantityRemaining) > 0)!;
    await prisma.stockAllocation.createMany({ data: [
      { stockLotId: charityLot.id, foodItemId, eventId, quantityAllocated: 50, unitCost: 22, totalCost: 1100 },
      { stockLotId: expenseLot.id, foodItemId, eventId, quantityAllocated: 40, unitCost: 20, totalCost: 800 },
    ] });
    const expense = await request(app).post('/api/v1/event-expenses').set('Cookie', adminCookie).send({
      eventId, category: 'GAS', description: 'Cooking gas', amount: 500, expenseDate: '2026-12-20',
    });
    expect(expense.status).toBe(201);

    const statement = await request(app).get(`/api/v1/financial/events/${eventId}`).set('Cookie', adminCookie);
    expect(statement.status).toBe(200);
    const totals = statement.body.data.totals;
    expect(totals.inventoryUtilization).toBe(1900);
    expect(totals.otherExpenses).toBe(500);
    expect(totals.resourceUtilization).toBe(2400);
    expect(totals.cashEventCost).toBe(1300); // expense stock 800 + other 500, NOT charity
    expect(totals.cashResult).toBe(98700); // 100000 donations - 1300
    const statementData = statement.body.data;
    expect(statementData.inventory.charityValue).toBe(1100);
    expect(statementData.inventory.expenseValue).toBe(800);
    expect(statementData.fifoDetail.some((line: { stockType: string }) => line.stockType === 'CHARITY')).toBe(true);

    const ledger = await request(app).get('/api/v1/financial/summary').set('Cookie', adminCookie);
    expect(ledger.status).toBe(200);
    expect(ledger.body.data.overview.cashDonations).toBeGreaterThanOrEqual(100000);
    const row = ledger.body.data.events.find((item: { id: string }) => item.id === eventId);
    expect(row.charityStock).toBe(1100);
    expect(row.expenseStock).toBe(800);
    expect(row.cashEventCost).toBe(1300);
    expect(row.eventType).toBe('BACE');

    const filtered = await request(app).get('/api/v1/financial/summary?eventType=BACE').set('Cookie', adminCookie);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.events.every((item: { eventType: string | null }) => item.eventType === 'BACE')).toBe(true);
    const other = await request(app).get('/api/v1/financial/summary?eventType=Temple').set('Cookie', adminCookie);
    expect(other.status).toBe(200);
    expect(other.body.data.events.some((item: { id: string }) => item.id === eventId)).toBe(false);
  });

  it('returns preserve the original stock type and reduce net consumption', async () => {
    const created = await request(app).post('/api/v1/events').set('Cookie', adminCookie).send({
      name: 'Return Type Prasadam', eventDate: '2026-12-21', startTime: '10:00', numberOfPeople: 50,
    });
    expect(created.status).toBe(201);
    const eventId = String(created.body.data.id);
    createdEventIds.push(eventId);
    const charityLot = (await lots()).find((lot) => lot.stockType === 'CHARITY' && Number(lot.quantityRemaining) > 0)!;
    await prisma.stockAllocation.create({ data: {
      stockLotId: charityLot.id, foodItemId, eventId, quantityAllocated: 10, unitCost: 22, totalCost: 220,
    } });
    // Simulate the authoritative reversal record written by acceptReturn().
    await prisma.stockAllocation.create({ data: {
      stockLotId: charityLot.id, foodItemId, eventId, quantityAllocated: -4, unitCost: 22, totalCost: 220,
    } });
    const statement = await request(app).get(`/api/v1/financial/events/${eventId}`).set('Cookie', adminCookie);
    expect(statement.status).toBe(200);
    expect(statement.body.data.inventory.charityValue).toBe(132); // (10 - 4) * 22
    expect(statement.body.data.fifoDetail.every((line: { stockType: string }) => line.stockType === 'CHARITY')).toBe(true);
  });

  it('blocks executors from all financial and expense endpoints', async () => {
    const summary = await request(app).get('/api/v1/financial/summary').set('Cookie', executorCookie);
    expect(summary.status).toBe(403);
    const expenses = await request(app).get('/api/v1/event-expenses?eventId=' + randomUUID()).set('Cookie', executorCookie);
    expect(expenses.status).toBe(403);
    const create = await request(app).post('/api/v1/event-expenses').set('Cookie', executorCookie).send({
      eventId: randomUUID(), category: 'GAS', description: 'x', amount: 1, expenseDate: '2026-12-20',
    });
    expect(create.status).toBe(403);
  });
});
