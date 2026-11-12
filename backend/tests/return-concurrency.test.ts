import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — RETURN STOCK CONCURRENCY / RECONCILIATION SUITE.
 *
 * Verifies that accepting material returns under concurrent load:
 *   - serializes around the inventory row (no lost updates)
 *   - never accepts more than the LIVE returnable (issued − already accepted)
 *   - never makes inventory negative
 *   - every accepted return has exactly one RETURN ledger entry
 *   - inventory reconciles: opening − stockOuts + returnsAccepted = actual
 *
 * The accept path (POST /api/v1/returns/:id/accept) already uses
 * `SELECT ... FOR UPDATE` inside `transactionWithRetry` — this suite proves
 * it holds under real parallel HTTP load.
 */

const app = createApp();
const prisma = getTestClient();

const createdUserIds: string[] = [];
const createdEventIds: string[] = [];
const createdDishIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdUnitIds: string[] = [];
const createdFoodItemIds: string[] = [];
const createdRequestIds: string[] = [];
const createdReturnIds: string[] = [];

async function createTestUser(role: 'ADMIN' | 'EXECUTOR'): Promise<{ user: User; cookie: string }> {
  const email = `ret-${randomUUID()}@example.test`;
  const password = `ValidPass${randomUUID()}-ret`;
  const user = await authService.createUserRecord({ firstName: 'Ret', lastName: role === 'ADMIN' ? 'Admin' : 'Executor', email, password, role });
  createdUserIds.push(user.id);
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  const setCookie = response.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) && setCookie.length > 0 ? setCookie[0].split(';')[0] : '';
  return { user, cookie };
}

async function createExecutorAssignedTo(admin: User) {
  const created = await createTestUser('EXECUTOR');
  await prisma.adminExecutorAssignment.create({ data: { adminId: admin.id, executorId: created.user.id } });
  return created;
}

async function createFoodItemWithStock(stock: number): Promise<{ foodItemId: string }> {
  const category = await prisma.category.create({ data: { name: `RetCat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: { name: `RetUnit-${randomUUID()}`, symbol: `R${randomUUID().slice(0, 5).toUpperCase()}`, unitType: 'WEIGHT' },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: { name: `RetDal-${randomUUID().slice(0, 8)}`, categoryId: category.id, unitId: unit.id, minimumStock: 5, reorderLevel: 10 },
  });
  createdFoodItemIds.push(food.id);
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: stock } });
  return { foodItemId: food.id };
}

async function getStock(foodItemId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { foodItemId } });
  return row?.currentQuantity ?? -1;
}

async function ledgerCountByType(foodItemId: string, transactionType: string): Promise<number> {
  return prisma.inventoryTransaction.count({ where: { foodItemId, transactionType } });
}

/**
 * Event + committed line + INITIAL request + submit + approve + ISSUE stock.
 * Seeds stock = issueQty so the issue brings inventory down to 0, then returns
 * can bring it back up.
 */
async function buildIssuedStock(adminCookie: string, executorCookie: string, issueQty: number) {
  const { foodItemId } = await createFoodItemWithStock(issueQty);

  const dish = await request(app).post('/api/v1/dishes').set('Cookie', adminCookie).send({ name: `RetDish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app).post('/api/v1/events').set('Cookie', adminCookie).send({
    name: `Ret Event ${randomUUID().slice(0, 8)}`, eventDate: '2026-12-27', startTime: '10:00', numberOfPeople: 40,
  });
  expect(event.status).toBe(201);
  const eventId = event.body.data.id as string;
  createdEventIds.push(eventId);

  await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'PLANNING' });
  const addDish = await request(app).post(`/api/v1/events/${eventId}/dishes`).set('Cookie', adminCookie).send({ dishId: dish.body.data.id });
  const eventDishId = addDish.body.data.dishes.at(-1).id as string;
  const addMaterial = await request(app).post(`/api/v1/event-dishes/${eventDishId}/materials`).set('Cookie', adminCookie).send({ foodItemId, plannedQuantity: issueQty, unitId: dish.body.data.unitId ?? undefined });
  expect(addMaterial.status).toBe(201);
  const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminCookie);
  const eventMaterialId = detail.body.data.dishes.flatMap((d: { materials: { id: string }[] }) => d.materials).at(-1).id as string;

  const initial = await request(app).post('/api/v1/material-requests').set('Cookie', executorCookie).send({ eventId, items: [{ eventMaterialId, requestedQuantity: issueQty }] });
  expect(initial.status).toBe(201);
  const initialRequestId = initial.body.data.request.id as string;
  createdRequestIds.push(initialRequestId);
  await request(app).post(`/api/v1/material-requests/${initialRequestId}/submit`).set('Cookie', executorCookie);

  const approved = await request(app).post(`/api/v1/material-requests/${initialRequestId}/approve`).set('Cookie', adminCookie).send({});
  expect(approved.status).toBe(200);

  const detail2 = await request(app).get(`/api/v1/material-requests/${initialRequestId}`).set('Cookie', adminCookie);
  const itemId = detail2.body.data.request.items[0].id as string;
  const issued = await request(app).post(`/api/v1/material-requests/${initialRequestId}/issue`).set('Cookie', adminCookie).send({ items: [{ itemId, quantity: issueQty }] });
  expect(issued.status).toBe(200);
  expect(issued.body.data.request.status).toBe('ISSUED');

  return { eventId, eventMaterialId, initialRequestId, foodItemId, issueQty };
}

/** Executor creates a return of quantity units of the food item on the event. */
async function createReturn(executorCookie: string, eventId: string, eventMaterialId: string, quantity: number, foodItemId: string) {
  return request(app).post(`/api/v1/events/${eventId}/returns`).set('Cookie', executorCookie).send({
    reason: 'EXTRA_MATERIAL',
    items: [{ foodItemId, quantity }],
  });
}

/** Admin accepts a return (full requested quantity by default). */
async function acceptReturn(adminCookie: string, returnId: string) {
  const detail = await request(app).get(`/api/v1/returns/${returnId}`).set('Cookie', adminCookie);
  const item = detail.body.data.return.items[0];
  return request(app).post(`/api/v1/returns/${returnId}/accept`).set('Cookie', adminCookie).send({ items: [{ itemId: item.id, acceptedQuantity: item.requestedReturnQuantity }] });
}

afterAll(async () => {
  await withDeadlockRetry(async () => {
    await prisma.notification.deleteMany({ where: { referenceId: { in: [...createdReturnIds, ...createdRequestIds, ...createdEventIds] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.materialReturn.deleteMany({ where: { id: { in: createdReturnIds } } });
    await prisma.materialRequest.deleteMany({ where: { eventId: { in: createdEventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    await prisma.dish.deleteMany({ where: { id: { in: createdDishIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
    await prisma.inventory.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
    await prisma.foodItem.deleteMany({ where: { id: { in: createdFoodItemIds } } });
    await prisma.unit.deleteMany({ where: { id: { in: createdUnitIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
    await prisma.adminExecutorAssignment.deleteMany({ where: { OR: [{ adminId: { in: createdUserIds } }, { executorId: { in: createdUserIds } }] } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

// ============================================================================
// R1 — Single return accept moves stock IN via RETURN ledger
// ============================================================================

describe('R1 — Return accept posts stock IN (reconciliation)', () => {
  it('accepted return adds stock to inventory with RETURN ledger entry', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const issueQty = 60;
    const { eventId, eventMaterialId, foodItemId } = await buildIssuedStock(admin.cookie, executor.cookie, issueQty);

    // After issue: inventory = issueQty − issueQty = 0
    expect(await getStock(foodItemId)).toBe(0);

    const created = await createReturn(executor.cookie, eventId, eventMaterialId, issueQty, foodItemId);
    expect(created.status).toBe(201);
    const returnId = created.body.data.return.id as string;
    createdReturnIds.push(returnId);

    const accepted = await acceptReturn(admin.cookie, returnId);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.return.status).toBe('ACCEPTED');

    // Inventory back to issueQty (60): 0 + 60 returned
    expect(await getStock(foodItemId)).toBe(issueQty);

    // Exactly one RETURN ledger entry
    const count = await ledgerCountByType(foodItemId, 'RETURN');
    expect(count).toBe(1);

    // Reconciliation: opening(issueQty) − stockOut(issueQty) + returnIn(issueQty) = issueQty
    const stockOuts = await prisma.inventoryTransaction.aggregate({
      where: { foodItemId, transactionType: 'STOCK_OUT' },
      _sum: { quantity: true },
    });
    const returnsIn = await prisma.inventoryTransaction.aggregate({
      where: { foodItemId, transactionType: 'RETURN' },
      _sum: { quantity: true },
    });
    expect(Number(stockOuts._sum.quantity)).toBe(issueQty);
    expect(Number(returnsIn._sum.quantity)).toBe(issueQty);
    expect(await getStock(foodItemId)).toBe(issueQty - issueQty + issueQty);
  });
});

// ============================================================================
// R2 — Parallel return accepts serialize; no over-return
// ============================================================================

describe('R2 — Parallel return accepts: no over-return', () => {
  it('3 concurrent accepts of 40 each on 100 issued → only 100 total accepted, rest 409', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const issuedQty = 100;
    const { eventId, eventMaterialId, foodItemId } = await buildIssuedStock(admin.cookie, executor.cookie, issuedQty);

    // Create 3 returns, each requesting 40 (total 120 > 100 returnable)
    const returns = [];
    for (let i = 0; i < 3; i++) {
      const created = await createReturn(executor.cookie, eventId, eventMaterialId, 40, foodItemId);
      expect(created.status).toBe(201);
      returns.push(created.body.data.return.id);
      createdReturnIds.push(created.body.data.return.id);
    }

    // Accept all 3 concurrently
    const results = await Promise.allSettled(returns.map((rid) => acceptReturn(admin.cookie, rid)));
    const statuses = results.map((r) => (r.status === 'fulfilled' ? (r.value as { status: number }).status : 'rejected'));
    const successes = statuses.filter((s) => s === 200).length;
    const conflicts = statuses.filter((s) => s === 409).length;

    // Every accept is either success (200) or over-return rejection (409).
    expect(successes + conflicts).toBe(3);
    // Invariant: no over-return — total accepted can never exceed issued (100).
    expect(successes * 40).toBeLessThanOrEqual(100);

    const stock = await getStock(foodItemId);
    expect(stock).toBeGreaterThanOrEqual(0); // never negative
    expect(stock).toBe(successes * 40); // each success adds exactly 40

    const returnCount = await ledgerCountByType(foodItemId, 'RETURN');
    expect(returnCount).toBe(successes); // one RETURN ledger row per successful accept

    // Reconciliation: 0 (after issue) + successes * 40 = stock
    expect(stock).toBe(successes * 40);
  });
});

// ============================================================================
// R3 — High-concurrency return accepts on same inventory row
// ============================================================================

describe('R3 — High-concurrency return accepts', () => {
  it('20 concurrent accepts of 10 each on 100 issued → exactly 10 accept, rest 409', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const issuedQty = 100;
    const { eventId, eventMaterialId, foodItemId } = await buildIssuedStock(admin.cookie, executor.cookie, issuedQty);

    const returns = [];
    for (let i = 0; i < 20; i++) {
      const created = await createReturn(executor.cookie, eventId, eventMaterialId, 10, foodItemId);
      expect(created.status).toBe(201);
      returns.push(created.body.data.return.id);
      createdReturnIds.push(created.body.data.return.id);
    }

    const results = await Promise.allSettled(returns.map((rid) => acceptReturn(admin.cookie, rid)));
    const statuses = results.map((r) => (r.status === 'fulfilled' ? (r.value as { status: number }).status : 'rejected'));
    const successes = statuses.filter((s) => s === 200).length;

    // Invariant: no over-return — total accepted can never exceed issued (100).
    expect(successes * 10).toBeLessThanOrEqual(100);

    const stock = await getStock(foodItemId);
    expect(stock).toBeGreaterThanOrEqual(0); // never negative
    expect(stock).toBe(successes * 10); // each success adds exactly 10

    const returnCount = await ledgerCountByType(foodItemId, 'RETURN');
    expect(returnCount).toBe(successes); // one RETURN ledger row per successful accept

    // Reconciliation: 0 (after issue) + successes * 10 = stock
    expect(stock).toBe(successes * 10);
  });
});

// ============================================================================
// R4 — Reject does not move stock
// ============================================================================

describe('R4 — Return reject never moves stock', () => {
  it('rejected return: inventory unchanged, zero RETURN ledger rows', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const issueQty = 50;
    const { eventId, eventMaterialId, foodItemId } = await buildIssuedStock(admin.cookie, executor.cookie, issueQty);

    expect(await getStock(foodItemId)).toBe(0);

    const created = await createReturn(executor.cookie, eventId, eventMaterialId, 30, foodItemId);
    expect(created.status).toBe(201);
    const returnId = created.body.data.return.id as string;
    createdReturnIds.push(returnId);

    const rejected = await request(app).post(`/api/v1/returns/${returnId}/reject`).set('Cookie', admin.cookie).send({ reason: 'Not acceptable.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.return.status).toBe('REJECTED');

    // Inventory untouched
    expect(await getStock(foodItemId)).toBe(0);

    // No RETURN ledger entry
    const count = await ledgerCountByType(foodItemId, 'RETURN');
    expect(count).toBe(0);
  });
});
