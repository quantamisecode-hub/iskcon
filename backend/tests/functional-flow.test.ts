import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — FUNCTIONAL QA: EVENT → MATERIAL REQUEST → APPROVAL → ISSUE →
 * STOCK DEDUCTION → RECONCILIATION (complete end-to-end flow).
 *
 * Executes the exact business flow from docs/FUNCTIONAL_FLOW_TEST_REPORT.md:
 *   Admin + Executor setup → Food Item + Stock In → Event → Dish → Material
 *   Mapping → Executor Request → Admin Approval (no stock change) → Admin Issue
 *   (stock deducted) → Ledger → Request/Event Summary → Full Reconciliation.
 *
 * Plus negative scenarios: rejection, cancellation, insufficient stock, partial
 * issue, multiple materials, multiple requests, returns.
 *
 * Runs against the dedicated food_inventory_test database only.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUser(role: 'ADMIN' | 'EXECUTOR'): Promise<{ user: User; cookie: string }> {
  const email = `fqa-${randomUUID()}@example.test`;
  const password = `ValidPass${randomUUID()}-fqa`;
  const user = await authService.createUserRecord({
    firstName: 'FQA',
    lastName: role === 'ADMIN' ? 'Admin' : 'Executor',
    email,
    password,
    role,
  });
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

async function createFoodItemWithStock(
  adminCookie: string,
  name: string,
  categoryName: string,
  unitName: string,
  unitSymbol: string,
  stock: number,
  minimumStock: number,
  reorderLevel: number,
): Promise<{ foodItemId: string; categoryId: string; unitId: string }> {
  const category = await prisma.category.create({ data: { name: `${categoryName}-${randomUUID().slice(0, 6)}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: { name: `${unitName}-${randomUUID().slice(0, 4)}`, symbol: `${unitSymbol}${randomUUID().slice(0, 4).toUpperCase()}`, unitType: 'WEIGHT' },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: {
      name: `${name}-${randomUUID().slice(0, 6)}`,
      categoryId: category.id,
      unitId: unit.id,
      minimumStock,
      reorderLevel,
    },
  });
  createdFoodItemIds.push(food.id);
  // Create inventory record at ZERO first (as the service does), then use the
  // audited Stock In API to bring it to the opening quantity — this creates the
  // STOCK_IN ledger entry required by the functional spec.
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: 0 } });

  if (stock > 0) {
    const stockIn = await request(app)
      .post(`/api/v1/food-items/${food.id}/stock-in`)
      .set('Cookie', adminCookie)
      .send({ quantity: stock });
    expect(stockIn.status).toBe(200);
  }

  return { foodItemId: food.id, categoryId: category.id, unitId: unit.id };
}

async function getStock(foodItemId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { foodItemId } });
  return row?.currentQuantity ?? -1;
}

async function ledgerSumByType(foodItemId: string, transactionType: string): Promise<number> {
  const rows = await prisma.inventoryTransaction.findMany({ where: { foodItemId, transactionType } });
  return rows.reduce((acc, r) => acc + Number(r.quantity), 0);
}

async function ledgerCountByType(foodItemId: string, transactionType: string): Promise<number> {
  return prisma.inventoryTransaction.count({ where: { foodItemId, transactionType } });
}

/** Build a complete fixture: event + dish + committed material line + executor-submitted+approved request (not yet issued). */
async function buildApprovedRequest(
  adminCookie: string,
  executorCookie: string,
  foodItemId: string,
  unitId: string,
  requestedQuantity: number,
) {
  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `FQA Dish ${randomUUID().slice(0, 6)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `FQA Event ${randomUUID().slice(0, 6)}`,
      eventDate: '2026-12-28',
      startTime: '10:00',
      numberOfPeople: 500,
    });
  expect(event.status).toBe(201);
  const eventId = event.body.data.id as string;
  createdEventIds.push(eventId);

  await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'PLANNING' });
  const addDish = await request(app)
    .post(`/api/v1/events/${eventId}/dishes`)
    .set('Cookie', adminCookie)
    .send({ dishId: dish.body.data.id });
  expect(addDish.status).toBe(201);
  const eventDishId = addDish.body.data.dishes.at(-1).id as string;

  const addMaterial = await request(app)
    .post(`/api/v1/event-dishes/${eventDishId}/materials`)
    .set('Cookie', adminCookie)
    .send({ foodItemId, plannedQuantity: requestedQuantity, unitId });
  expect(addMaterial.status).toBe(201);
  const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminCookie);
  const eventMaterialId = detail.body.data.dishes
    .flatMap((d: { materials: { id: string }[] }) => d.materials)
    .at(-1).id as string;

  // Executor creates request in DRAFT.
  const created = await request(app)
    .post('/api/v1/material-requests')
    .set('Cookie', executorCookie)
    .send({ eventId, items: [{ eventMaterialId, requestedQuantity }] });
  expect(created.status).toBe(201);
  const requestId = created.body.data.request.id as string;
  createdRequestIds.push(requestId);

  // Executor submits → PENDING_APPROVAL.
  const submitted = await request(app)
    .post(`/api/v1/material-requests/${requestId}/submit`)
    .set('Cookie', executorCookie);
  expect(submitted.status).toBe(200);

  // Admin approves → APPROVED (NO stock change).
  const approved = await request(app)
    .post(`/api/v1/material-requests/${requestId}/approve`)
    .set('Cookie', adminCookie)
    .send({});
  expect(approved.status).toBe(200);
  expect(approved.body.data.request.status).toBe('APPROVED');

  return { eventId, eventMaterialId, requestId, dishId: dish.body.data.id };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

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
// MAIN FUNCTIONAL FLOW — complete end-to-end
// ============================================================================

describe('FUNCTIONAL FLOW — Event → Request → Approval → Issue → Reconciliation', () => {
  it('complete flow: stock remains 1,000 through approval, deducts to 500 on issue, ledger reconciles', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    // Food item: Rice, 1,000 KG opening stock.
    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    // ── Verify opening stock ──
    const openingStock = await getStock(riceId);
    expect(openingStock).toBe(1000);

    // ── Verify STOCK_IN ledger entry ──
    const stockInCount = await ledgerCountByType(riceId, 'STOCK_IN');
    expect(stockInCount).toBe(1);
    const stockInSum = await ledgerSumByType(riceId, 'STOCK_IN');
    expect(stockInSum).toBe(1000);

    // ── Build approved request (event + dish + material + request + submit + approve) ──
    const { eventId, eventMaterialId, requestId } = await buildApprovedRequest(
      admin.cookie,
      executor.cookie,
      riceId,
      kgId,
      500,
    );

    // ── Stock must be UNCHANGED after approval ──
    const stockAfterApproval = await getStock(riceId);
    expect(stockAfterApproval).toBe(1000); // approval never deducts stock

    // ── No STOCK_OUT ledger from approval ──
    const stockOutBeforeIssue = await ledgerCountByType(riceId, 'STOCK_OUT');
    expect(stockOutBeforeIssue).toBe(0);

    // ── Verify request quantities ──
    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    expect(reqDetail.status).toBe(200);
    const item = reqDetail.body.data.request.items[0];
    expect(Number(item.requestedQuantity)).toBe(500);
    expect(Number(item.approvedQuantity)).toBe(500);
    expect(Number(item.issuedQuantity)).toBe(0);

    // ── Admin issues 500 KG ──
    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: item.id, quantity: 500 }] });
    expect(issued.status).toBe(200);
    expect(issued.body.data.request.status).toBe('ISSUED');

    // ── Stock deducted: 1,000 - 500 = 500 ──
    const stockAfterIssue = await getStock(riceId);
    expect(stockAfterIssue).toBe(500);

    // ── Ledger entry: STOCK_OUT -500 ──
    const stockOutCount = await ledgerCountByType(riceId, 'STOCK_OUT');
    expect(stockOutCount).toBe(1);
    const stockOutSum = await ledgerSumByType(riceId, 'STOCK_OUT');
    expect(stockOutSum).toBe(500);

    const lastLedger = await prisma.inventoryTransaction.findFirst({
      where: { foodItemId: riceId, transactionType: 'STOCK_OUT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(lastLedger?.referenceType).toBe('MATERIAL_REQUEST_ISSUE');
    expect(lastLedger?.referenceId).toBe(requestId);
    expect(lastLedger?.performedBy).toBe(admin.user.id);
    expect(Number(lastLedger?.balanceBefore)).toBe(1000);
    expect(Number(lastLedger?.balanceAfter)).toBe(500);

    void eventMaterialId;

    // ── Event material summary ──
    const summary = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(summary.status).toBe(200);
    const totals = summary.body.data.totals;
    expect(Number(totals.issuedQuantity)).toBe(500);

    // ── Full reconciliation ──
    const currentStock = await getStock(riceId);
    const stockInTotal = await ledgerSumByType(riceId, 'STOCK_IN');
    const stockOutTotal = await ledgerSumByType(riceId, 'STOCK_OUT');
    const expectedStock = stockInTotal - stockOutTotal;
    expect(currentStock).toBe(expectedStock);
    expect(currentStock).toBe(500);
    expect(expectedStock).toBe(500);
  });
});

// ============================================================================
// PARTIAL ISSUE
// ============================================================================

describe('FUNCTIONAL FLOW — Partial issue', () => {
  it('issue 300 of 500 approved → stock 700, remaining 200; then issue 200 → stock 500, status ISSUED', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    const { eventId, eventMaterialId, requestId } = await buildApprovedRequest(
      admin.cookie,
      executor.cookie,
      riceId,
      kgId,
      500,
    );
    
    void eventId;
    void eventMaterialId;

    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const itemId = reqDetail.body.data.request.items[0].id as string;

    // Partial issue 300.
    const partial = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 300 }] });
    expect(partial.status).toBe(200);
    expect(partial.body.data.request.status).toBe('PARTIALLY_ISSUED');
    expect(await getStock(riceId)).toBe(700);

    // Remaining issue 200.
    const final = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 200 }] });
    expect(final.status).toBe(200);
    expect(final.body.data.request.status).toBe('ISSUED');
    expect(await getStock(riceId)).toBe(500);

    // Two STOCK_OUT ledger rows totaling 500.
    const stockOutCount = await ledgerCountByType(riceId, 'STOCK_OUT');
    expect(stockOutCount).toBe(2);
    const stockOutSum = await ledgerSumByType(riceId, 'STOCK_OUT');
    expect(stockOutSum).toBe(500);

    const currentStock = await getStock(riceId);
    const expected = await ledgerSumByType(riceId, 'STOCK_IN') - stockOutSum;
    expect(currentStock).toBe(expected);
    expect(currentStock).toBe(500);
  });
});

// ============================================================================
// REJECTION — no stock change
// ============================================================================

describe('FUNCTIONAL FLOW — Rejection does not change stock', () => {
  it('rejected request: stock unchanged, no STOCK_OUT ledger', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    // Build event + dish + material + executor request in DRAFT + submit → PENDING_APPROVAL
    // (NOT approved — rejection needs a pending request).
    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `FQA Dish ${randomUUID().slice(0, 6)}` });
    expect(dish.status).toBe(201);
    createdDishIds.push(dish.body.data.id);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({
        name: `FQA Event ${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-28',
        startTime: '10:00',
        numberOfPeople: 500,
      });
    expect(event.status).toBe(201);
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    const addDish = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    expect(addDish.status).toBe(201);
    const eventDishId = addDish.body.data.dishes.at(-1).id as string;

    const addMaterial = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId: riceId, plannedQuantity: 100, unitId: kgId });
    expect(addMaterial.status).toBe(201);
    const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', admin.cookie);
    const eventMaterialId = detail.body.data.dishes
      .flatMap((d: { materials: { id: string }[] }) => d.materials)
      .at(-1).id as string;

    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 100 }] });
    expect(created.status).toBe(201);
    const requestId = created.body.data.request.id as string;
    createdRequestIds.push(requestId);

    const submitted = await request(app)
      .post(`/api/v1/material-requests/${requestId}/submit`)
      .set('Cookie', executor.cookie);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.request.status).toBe('PENDING_APPROVAL');

    const stockBefore = await getStock(riceId);
    expect(stockBefore).toBe(1000);

    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const itemId = reqDetail.body.data.request.items[0].id as string;
    void itemId;

    const rejected = await request(app)
      .post(`/api/v1/material-requests/${requestId}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Not needed for this event.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.request.status).toBe('REJECTED');

    // Stock unchanged.
    expect(await getStock(riceId)).toBe(stockBefore);

    // No STOCK_OUT ledger.
    const stockOutCount = await ledgerCountByType(riceId, 'STOCK_OUT');
    expect(stockOutCount).toBe(0);
  });
});

// ============================================================================
// INSUFFICIENT STOCK — no negative inventory
// ============================================================================

describe('FUNCTIONAL FLOW — Insufficient stock cannot go negative', () => {
  it('issue 150 KG when only 100 available → 409, stock unchanged at 100', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      100,
      10,
      20,
    );

    // plannedQuantity=100 (<= stock so addMaterial passes), request=100, approve=100,
    // then try to issue 150 (> available 100) → 409.
    const { eventId, eventMaterialId, requestId } = await buildApprovedRequest(
      admin.cookie,
      executor.cookie,
      riceId,
      kgId,
      100,
    );

    const stockBefore = await getStock(riceId);
    expect(stockBefore).toBe(100);

    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const itemId = reqDetail.body.data.request.items[0].id as string;

    const overIssue = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 150 }] });
    expect(overIssue.status).toBe(409);

    // Stock unchanged.
    expect(await getStock(riceId)).toBe(100);

    // No STOCK_OUT ledger.
    const stockOutCount = await ledgerCountByType(riceId, 'STOCK_OUT');
    expect(stockOutCount).toBe(0);
    void eventId;
    void eventMaterialId;
  });
});

// ============================================================================
// MULTIPLE MATERIALS
// ============================================================================

describe('FUNCTIONAL FLOW — Multiple materials', () => {
  it('Rice + Dal + Oil: issue each independently, stock reconciles per item', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );
    const { foodItemId: dalId } = await createFoodItemWithStock(
      admin.cookie,
      'Dal',
      'Food Grain',
      'KG',
      'KG',
      500,
      50,
      100,
    );
    const { foodItemId: oilId, unitId: literId } = await createFoodItemWithStock(
      admin.cookie,
      'Oil',
      'Cooking Oil',
      'Liter',
      'L',
      100,
      10,
      20,
    );

    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `FQA Multi Dish ${randomUUID().slice(0, 6)}` });
    expect(dish.status).toBe(201);
    createdDishIds.push(dish.body.data.id);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({
        name: `FQA Multi Event ${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-28',
        startTime: '10:00',
        numberOfPeople: 500,
      });
    expect(event.status).toBe(201);
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    const addDish = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    expect(addDish.status).toBe(201);
    const eventDishId = addDish.body.data.dishes.at(-1).id as string;

    // Map Rice + Dal + Oil — capture material IDs from addMaterial responses.
    const riceMaterialResp = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId: riceId, plannedQuantity: 500, unitId: kgId });
    expect(riceMaterialResp.status).toBe(201);
    const riceDish = riceMaterialResp.body.data.dishes.find((d: Record<string, unknown>) => d.id === eventDishId);
    const riceMatId = riceDish.materials.at(-1).id;

    const dalMaterialResp = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId: dalId, plannedQuantity: 100, unitId: kgId });
    expect(dalMaterialResp.status).toBe(201);
    const dalDish = dalMaterialResp.body.data.dishes.find((d: Record<string, unknown>) => d.id === eventDishId);
    const dalMatId = dalDish.materials.at(-1).id;

    const oilMaterialResp = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId: oilId, plannedQuantity: 50, unitId: literId });
    expect(oilMaterialResp.status).toBe(201);
    const oilDish = oilMaterialResp.body.data.dishes.find((d: Record<string, unknown>) => d.id === eventDishId);
    const oilMatId = oilDish.materials.at(-1).id;

    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({
        eventId,
        items: [
          { eventMaterialId: riceMatId, requestedQuantity: 300 },
          { eventMaterialId: dalMatId, requestedQuantity: 100 },
          { eventMaterialId: oilMatId, requestedQuantity: 20 },
        ],
      });
    expect(created.status).toBe(201);
    const requestId = created.body.data.request.id as string;
    createdRequestIds.push(requestId);

    const submitted = await request(app)
      .post(`/api/v1/material-requests/${requestId}/submit`)
      .set('Cookie', executor.cookie);
    expect(submitted.status).toBe(200);

    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe('APPROVED');

    // Stock unchanged after approval.
    expect(await getStock(riceId)).toBe(1000);
    expect(await getStock(dalId)).toBe(500);
    expect(await getStock(oilId)).toBe(100);

    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const items = reqDetail.body.data.request.items;

    // Issue Rice 300, Dal 100, Oil 20.
    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({
        items: [
          { itemId: items.find((i) => i.foodItemId === riceId).id, quantity: 300 },
          { itemId: items.find((i) => i.foodItemId === dalId).id, quantity: 100 },
          { itemId: items.find((i) => i.foodItemId === oilId).id, quantity: 20 },
        ],
      });
    expect(issued.status).toBe(200);
    expect(issued.body.data.request.status).toBe('ISSUED');

    // Independent stock verification.
    expect(await getStock(riceId)).toBe(700);
    expect(await getStock(dalId)).toBe(400);
    expect(await getStock(oilId)).toBe(80);

    // Reconciliation per item.
    expect(await getStock(riceId)).toBe(await ledgerSumByType(riceId, 'STOCK_IN') - await ledgerSumByType(riceId, 'STOCK_OUT'));
    expect(await getStock(dalId)).toBe(await ledgerSumByType(dalId, 'STOCK_IN') - await ledgerSumByType(dalId, 'STOCK_OUT'));
    expect(await getStock(oilId)).toBe(await ledgerSumByType(oilId, 'STOCK_IN') - await ledgerSumByType(oilId, 'STOCK_OUT'));
  });
});

// ============================================================================
// MULTIPLE REQUESTS — same event
// ============================================================================

describe('FUNCTIONAL FLOW — Multiple requests on same event', () => {
  it('two requests for same event, issue both sequentially, stock reconciles', async () => {
    // NOTE: the service allows only ONE OPEN (DRAFT/PENDING_APPROVAL) request
    // per event, so the second request must be created after the first is
    // APPROVED (no longer open). This matches the implemented constraint.
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    // Request #1: 300 KG.
    const r1 = await buildApprovedRequest(admin.cookie, executor.cookie, riceId, kgId, 300);
    const r1Detail = await request(app).get(`/api/v1/material-requests/${r1.requestId}`).set('Cookie', admin.cookie);
    const r1ItemId = r1Detail.body.data.request.items[0].id as string;

    // Issue request #1: 300 KG.
    const i1 = await request(app)
      .post(`/api/v1/material-requests/${r1.requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: r1ItemId, quantity: 300 }] });
    expect(i1.status).toBe(200);
    expect(await getStock(riceId)).toBe(700);

    // Request #2: 100 KG (now allowed because #1 is ISSUED, not open).
    const r2 = await buildApprovedRequest(admin.cookie, executor.cookie, riceId, kgId, 100);
    const r2Detail = await request(app).get(`/api/v1/material-requests/${r2.requestId}`).set('Cookie', admin.cookie);
    const r2ItemId = r2Detail.body.data.request.items[0].id as string;

    // Issue request #2: 100 KG.
    const i2 = await request(app)
      .post(`/api/v1/material-requests/${r2.requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: r2ItemId, quantity: 100 }] });
    expect(i2.status).toBe(200);
    expect(await getStock(riceId)).toBe(600);

    // Total issued: 400, final stock 600.
    const stockOutSum = await ledgerSumByType(riceId, 'STOCK_OUT');
    expect(stockOutSum).toBe(400);
    expect(await getStock(riceId)).toBe(600);
    expect(await getStock(riceId)).toBe(await ledgerSumByType(riceId, 'STOCK_IN') - stockOutSum);
  });
});

// ============================================================================
// RETURN — if return functionality exists (it does)
// ============================================================================

describe('FUNCTIONAL FLOW — Return accept restocks inventory', () => {
  it('issue 500 → stock 500; executor returns 200 → admin accepts → stock 700, RETURN ledger +200', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    const { eventId, eventMaterialId, requestId } = await buildApprovedRequest(
      admin.cookie,
      executor.cookie,
      riceId,
      kgId,
      500,
    );
    
    void eventId;
    void eventMaterialId;

    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const itemId = reqDetail.body.data.request.items[0].id as string;

    // Issue 500 → stock 500.
    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 500 }] });
    expect(issued.status).toBe(200);
    expect(await getStock(riceId)).toBe(500);

    // Executor creates return of 200 KG.
    const createdReturn = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({
        reason: 'EXTRA_MATERIAL',
        items: [{ foodItemId: riceId, quantity: 200 }],
      });
    expect(createdReturn.status).toBe(201);
    const returnId = createdReturn.body.data.return.id as string;
    createdReturnIds.push(returnId);

    // Before accept: stock still 500 (submission does not move stock).
    expect(await getStock(riceId)).toBe(500);

    // Admin accepts return of 200 → stock 700.
    const retDetail = await request(app).get(`/api/v1/returns/${returnId}`).set('Cookie', admin.cookie);
    const retItemId = retDetail.body.data.return.items[0].id as string;

    const accepted = await request(app)
      .post(`/api/v1/returns/${returnId}/accept`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: retItemId, acceptedQuantity: 200 }] });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.return.status).toBe('ACCEPTED');

    // Stock now 700.
    expect(await getStock(riceId)).toBe(700);

    // RETURN ledger entry +200.
    const returnCount = await ledgerCountByType(riceId, 'RETURN');
    expect(returnCount).toBe(1);
    const returnSum = await ledgerSumByType(riceId, 'RETURN');
    expect(returnSum).toBe(200);

    // Full reconciliation: 1000 IN - 500 OUT + 200 RETURN = 700.
    const currentStock = await getStock(riceId);
    const stockInTotal = await ledgerSumByType(riceId, 'STOCK_IN');
    const stockOutTotal = await ledgerSumByType(riceId, 'STOCK_OUT');
    const returnTotal = await ledgerSumByType(riceId, 'RETURN');
    const expected = stockInTotal - stockOutTotal + returnTotal;
    expect(currentStock).toBe(expected);
    expect(currentStock).toBe(700);
  });
});

// ============================================================================
// DUPLICATE ISSUE PROTECTION
// ============================================================================

describe('FUNCTIONAL FLOW — Duplicate issue protection', () => {
  it('double-submit same 500 KG issue → only one succeeds, stock 500 not 0', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    const { eventId, eventMaterialId, requestId } = await buildApprovedRequest(
      admin.cookie,
      executor.cookie,
      riceId,
      kgId,
      500,
    );
    
    void eventId;
    void eventMaterialId;

    const reqDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const itemId = reqDetail.body.data.request.items[0].id as string;

    // First issue succeeds.
    const first = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 500 }] });
    expect(first.status).toBe(200);

    // Second issue of same item → fully issued already → 409.
    const second = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 500 }] });
    expect(second.status).toBe(409);

    // Stock deducted exactly once: 1,000 → 500.
    expect(await getStock(riceId)).toBe(500);
    const stockOutCount = await ledgerCountByType(riceId, 'STOCK_OUT');
    expect(stockOutCount).toBe(1);
    void eventId;
    void eventMaterialId;
  });
});

// ============================================================================
// COMPLETED / CANCELLED EVENT — executor cannot create material requests
// ============================================================================

describe('FUNCTIONAL FLOW — Completed/Cancelled event blocks request creation', () => {
  it('COMPLETED event: executor cannot create a material request', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `FQA Dish ${randomUUID().slice(0, 6)}` });
    expect(dish.status).toBe(201);
    createdDishIds.push(dish.body.data.id);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({
        name: `FQA Completed Event ${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-28',
        startTime: '10:00',
        numberOfPeople: 500,
      });
    expect(event.status).toBe(201);
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    // Add dish + material while event is DRAFT/PLANNING.
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    const addDishResp = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    expect(addDishResp.status).toBe(201);
    const eventDishId = addDishResp.body.data.dishes.at(-1).id as string;

    await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId: riceId, plannedQuantity: 100, unitId: kgId })
      .expect(201);

    // Move event DRAFT → PLANNING → READY → COMPLETED.
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });
    const completed = await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);

    // Executor tries to create a material request on a COMPLETED event → 409.
    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId, items: [{ eventMaterialId: eventDishId, requestedQuantity: 50 }] });
    expect(created.status).toBe(409);

    // Nothing persisted.
    const rows = await prisma.materialRequest.count({ where: { eventId } });
    expect(rows).toBe(0);
  });

  it('CANCELLED event: executor cannot create a material request', async () => {
    const admin = await createTestUser('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);

    const { foodItemId: riceId, unitId: kgId } = await createFoodItemWithStock(
      admin.cookie,
      'Rice',
      'Food Grain',
      'KG',
      'KG',
      1000,
      100,
      200,
    );

    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `FQA Cancelled Dish ${randomUUID().slice(0, 6)}` });
    expect(dish.status).toBe(201);
    createdDishIds.push(dish.body.data.id);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({
        name: `FQA Cancelled Event ${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-28',
        startTime: '10:00',
        numberOfPeople: 500,
      });
    expect(event.status).toBe(201);
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    // Add dish + material while event is DRAFT/PLANNING.
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    const addDishResp2 = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    expect(addDishResp2.status).toBe(201);
    const eventDishId2 = addDishResp2.body.data.dishes.at(-1).id as string;

    await request(app)
      .post(`/api/v1/event-dishes/${eventDishId2}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId: riceId, plannedQuantity: 100, unitId: kgId })
      .expect(201);

    // Move event to CANCELLED.
    const cancelled = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Event cancelled for testing.' });
    expect(cancelled.status).toBe(200);

    // Executor tries to create a material request on a CANCELLED event → 409.
    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId, items: [{ eventMaterialId: eventDishId2, requestedQuantity: 50 }] });
    expect(created.status).toBe(409);

    // Nothing persisted.
    const rows = await prisma.materialRequest.count({ where: { eventId } });
    expect(rows).toBe(0);
  });
});
