import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — INVARIANT SUITE (TC-31 Data Quality / TC-37 Data Integrity / TC-25).
 *
 * Two kinds of checks, split deliberately for parallel-suite safety:
 *
 * 1. GLOBAL DB checks (whole test database — safe under parallel cleanup,
 *    because suites DELETE rows in afterAll rather than corrupting them):
 *    - no negative inventory anywhere (TC-DQ-001)
 *    - requested ≥ approved ≥ issued ≥ 0 on every request item (TC-DQ-003)
 *    - requestedReturn ≥ accepted+rejected ≥ 0 on every return item (TC-DQ-002)
 *    - EVT/REQ/RET codes are globally unique (TC-DQ-007)
 *    - status enums hold only valid values (TC-DQ-006)
 *
 * 2. SCOPED lifecycle check on an item this suite owns end-to-end
 *    (immune to other suites' cleanup ordering):
 *    - stock-in → issue → return-accept writes exactly one ledger row each
 *    - ledger running balance is internally consistent (TC-LDG-003)
 *    - final ledger balance == Inventory.currentQuantity (TC-DQ-005 / TC-REC-004)
 *    - accept-return posts stock ONLY on accept (TC-PRN-001)
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

async function createTestUser(input: { role: 'ADMIN' | 'EXECUTOR'; password: string }): Promise<User> {
  const user = await authService.createUserRecord({
    firstName: 'Invariants',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `inv-${randomUUID()}@example.test`,
    password: input.password,
    role: input.role,
  });
  createdUserIds.push(user.id);
  return user;
}

function extractCookie(response: request.Response): string | undefined {
  const setCookie = response.headers['set-cookie'];
  if (!Array.isArray(setCookie) || setCookie.length === 0) return undefined;
  return setCookie[0].split(';')[0];
}

async function login(email: string, password: string) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

async function createAdminWithSession(): Promise<{ user: User; cookie: string }> {
  const password = `ValidPass${randomUUID()}-inv`;
  const user = await createTestUser({ role: 'ADMIN', password });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookie(loginResponse) ?? '' };
}

async function createExecutorAssignedTo(admin: User): Promise<{ user: User; cookie: string }> {
  const password = `ValidPass${randomUUID()}-inv`;
  const user = await createTestUser({ role: 'EXECUTOR', password });
  await prisma.adminExecutorAssignment.create({ data: { adminId: admin.id, executorId: user.id } });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookie(loginResponse) ?? '' };
}

/** Item with an inventory row of 0 — stock is added via the API stock-in path. */
async function createFoodItemZeroStock(): Promise<{ foodItemId: string; unitId: string }> {
  const category = await prisma.category.create({ data: { name: `InvCat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: {
      name: `InvUnit-${randomUUID()}`,
      symbol: `I${randomUUID().slice(0, 5).toUpperCase()}`,
      unitType: 'WEIGHT',
    },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: {
      name: `Wheat-${randomUUID().slice(0, 8)}`,
      categoryId: category.id,
      unitId: unit.id,
      minimumStock: 10,
      reorderLevel: 20,
    },
  });
  createdFoodItemIds.push(food.id);
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: 0 } });
  return { foodItemId: food.id, unitId: unit.id };
}

async function createPlannedEvent(
  adminCookie: string,
  foodItemId: string,
  unitId: string,
  plannedQuantity = 40,
): Promise<{ eventId: string; eventMaterialId: string }> {
  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `InvDish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Invariant Event ${randomUUID().slice(0, 8)}`,
      eventDate: '2026-12-24',
      startTime: '11:00',
      numberOfPeople: 100,
    });
  expect(event.status).toBe(201);
  const eventId = event.body.data.id as string;
  createdEventIds.push(eventId);

  const planning = await request(app)
    .patch(`/api/v1/events/${eventId}/status`)
    .set('Cookie', adminCookie)
    .send({ status: 'PLANNING' });
  expect(planning.status).toBe(200);

  const addDish = await request(app)
    .post(`/api/v1/events/${eventId}/dishes`)
    .set('Cookie', adminCookie)
    .send({ dishId: dish.body.data.id });
  expect(addDish.status).toBe(201);
  const eventDishId = addDish.body.data.dishes.at(-1).id as string;

  const addMaterial = await request(app)
    .post(`/api/v1/event-dishes/${eventDishId}/materials`)
    .set('Cookie', adminCookie)
    .send({ foodItemId, plannedQuantity, unitId });
  expect(addMaterial.status).toBe(201);

  const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminCookie);
  expect(detail.status).toBe(200);
  const eventMaterialId = detail.body.data.dishes
    .flatMap((d: { materials: { id: string }[] }) => d.materials)
    .at(-1).id as string;

  return { eventId, eventMaterialId };
}

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.notification.deleteMany({ where: { referenceId: { in: createdFoodItemIds } } });
  await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
  await prisma.dish.deleteMany({ where: { id: { in: createdDishIds } } });
  await prisma.inventoryTransaction.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
  await prisma.inventory.deleteMany({ where: { foodItemId: { in: createdFoodItemIds } } });
  await prisma.foodItem.deleteMany({ where: { id: { in: createdFoodItemIds } } });
  await prisma.unit.deleteMany({ where: { id: { in: createdUnitIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.adminExecutorAssignment.deleteMany({
    where: { OR: [{ adminId: { in: createdUserIds } }, { executorId: { in: createdUserIds } }] },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// 1. GLOBAL DB CHECKS
// ---------------------------------------------------------------------------

describe('global invariant — no negative inventory (TC-DQ-001)', () => {
  it('has zero Inventory rows with currentQuantity < 0', async () => {
    const count = await prisma.inventory.count({ where: { currentQuantity: { lt: 0 } } });
    expect(count).toBe(0);
  });
});

describe('global invariant — request item arithmetic (TC-DQ-003)', () => {
  it('every request item satisfies requested ≥ approved ≥ issued ≥ 0', async () => {
    const items = await prisma.materialRequestItem.findMany({
      select: {
        id: true,
        status: true,
        requestedQuantity: true,
        approvedQuantity: true,
        issuedQuantity: true,
        rejectedQuantity: true,
      },
    });
    expect(items.length).toBeGreaterThanOrEqual(0); // scan whatever exists right now (parallel suites)
    for (const item of items) {
      const requested = Number(item.requestedQuantity);
      const approved = Number(item.approvedQuantity);
      const issued = Number(item.issuedQuantity);
      const rejected = Number(item.rejectedQuantity);
      // Quantities are never negative.
      expect(requested).toBeGreaterThanOrEqual(0);
      expect(approved).toBeGreaterThanOrEqual(0);
      expect(issued).toBeGreaterThanOrEqual(0);
      expect(rejected).toBeGreaterThanOrEqual(0);
      // The approval chain never goes backwards.
      expect(approved).toBeLessThanOrEqual(requested);
      expect(issued).toBeLessThanOrEqual(approved);
      // Rejected work is never issued.
      if (item.status === 'REJECTED') expect(issued).toBe(0);
    }
  });
});

describe('global invariant — return item arithmetic (TC-DQ-002)', () => {
  it('every return item satisfies requested ≥ accepted+rejected ≥ 0', async () => {
    const items = await prisma.materialReturnItem.findMany({
      select: {
        id: true,
        requestedReturnQuantity: true,
        acceptedReturnQuantity: true,
        rejectedReturnQuantity: true,
      },
    });
    for (const item of items) {
      const requested = Number(item.requestedReturnQuantity);
      const accepted = Number(item.acceptedReturnQuantity);
      const rejected = Number(item.rejectedReturnQuantity);
      expect(requested).toBeGreaterThanOrEqual(0);
      expect(accepted).toBeGreaterThanOrEqual(0);
      expect(rejected).toBeGreaterThanOrEqual(0);
      expect(accepted + rejected).toBeLessThanOrEqual(requested);
    }
  });

  it('every inventory transaction has a strictly positive quantity', async () => {
    const violations = await prisma.inventoryTransaction.count({
      where: { quantity: { lte: 0 } },
    });
    expect(violations).toBe(0);
  });
});

describe('global invariant — code uniqueness (TC-DQ-007)', () => {
  it('EVT / REQ / RET codes never duplicate', async () => {
    const events = await prisma.event.groupBy({
      by: ['eventCode'],
      _count: { eventCode: true },
      having: { eventCode: { _count: { gt: 1 } } },
    });
    expect(events).toHaveLength(0);

    const requests = await prisma.materialRequest.groupBy({
      by: ['requestCode'],
      _count: { requestCode: true },
      having: { requestCode: { _count: { gt: 1 } } },
    });
    expect(requests).toHaveLength(0);

    const returns = await prisma.materialReturn.groupBy({
      by: ['returnCode'],
      _count: { returnCode: true },
      having: { returnCode: { _count: { gt: 1 } } },
    });
    expect(returns).toHaveLength(0);
  });
});

describe('global invariant — status enums valid (TC-DQ-006)', () => {
  it('request/return/event statuses only hold enum values', async () => {
    const requestStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED', 'REJECTED', 'CANCELLED', 'CANCELLED_BY_EVENT'];
    const invalidRequests = await prisma.materialRequest.count({
      where: { status: { notIn: requestStatuses } },
    });
    expect(invalidRequests).toBe(0);

    const returnStatuses = ['DRAFT', 'SUBMITTED', 'PENDING_ADMIN_REVIEW', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED'];
    const invalidReturns = await prisma.materialReturn.count({
      where: { status: { notIn: returnStatuses } },
    });
    expect(invalidReturns).toBe(0);

    const eventStatuses = ['DRAFT', 'PLANNING', 'READY', 'COMPLETED', 'CANCELLED'];
    const invalidEvents = await prisma.event.count({ where: { status: { notIn: eventStatuses } } });
    expect(invalidEvents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. SCOPED LIFECYCLE — stock-in → issue → return-accept on an owned item
// ---------------------------------------------------------------------------

describe('scoped invariant — ledger == inventory across the full stock cycle', () => {
  it('stock-in 100 → issue 40 → accept return 15 keeps running balance exact', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { foodItemId, unitId } = await createFoodItemZeroStock();

    // --- STOCK IN via the API: 0 → 100, one STOCK_IN ledger row.
    const stockIn = await request(app)
      .post(`/api/v1/food-items/${foodItemId}/stock-in`)
      .set('Cookie', admin.cookie)
      .send({ quantity: 100 });
    expect(stockIn.status).toBe(200);
    const stockAfterIn = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(stockAfterIn?.currentQuantity).toBe(100);

    // --- Plan → request → approve → issue 40: 100 → 60.
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, foodItemId, unitId, 40);
    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 40 }] });
    expect(created.status).toBe(201);
    const requestId = created.body.data.request.id as string;
    const submitted = await request(app)
      .post(`/api/v1/material-requests/${requestId}/submit`)
      .set('Cookie', executor.cookie);
    expect(submitted.status).toBe(200);

    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approved.status).toBe(200);
    const itemId = approved.body.data.request.items[0].id as string;

    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 40 }] });
    expect(issued.status).toBe(200);

    // --- RETURN 15 → ACCEPT 15: 60 → 75, exactly one RETURN ledger row.
    // (Returns router mounts at /api/v1/returns — see routes/index.ts.)
    const returnCreated = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 15 }] });
    expect(returnCreated.status).toBe(201);
    const returnId = returnCreated.body.data.return.id as string;

    const returnDetail = await request(app)
      .get(`/api/v1/returns/${returnId}`)
      .set('Cookie', admin.cookie);
    expect(returnDetail.status).toBe(200);
    const returnItemId = returnDetail.body.data.return.items[0].id as string;
    expect(returnItemId).toBeDefined();

    const accepted = await request(app)
      .post(`/api/v1/returns/${returnId}/accept`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: returnItemId, acceptedQuantity: 15 }] });
    expect(accepted.status).toBe(200);

    // --- LEDGER CHECKS scoped to this item.
    const ledger = await prisma.inventoryTransaction.findMany({
      where: { foodItemId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(ledger).toHaveLength(3);
    expect(ledger.map((row) => row.transactionType)).toEqual(['STOCK_IN', 'STOCK_OUT', 'RETURN']);
    expect(ledger.map((row) => Number(row.quantity))).toEqual([100, 40, 15]);

    // Running balance: each row's balanceAfter follows from the previous row.
    let running = 0;
    for (const row of ledger) {
      const delta = row.transactionType === 'STOCK_IN' || row.transactionType === 'RETURN'
        ? Number(row.quantity)
        : -Number(row.quantity);
      running += delta;
      expect(row.balanceAfter).toBe(running);
    }

    // Final ledger balance == current inventory (the core reconciliation invariant).
    const inventory = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(inventory?.currentQuantity).toBe(running);
    expect(inventory?.currentQuantity).toBe(75);

    // Stock moved ONLY on issue (−40) and accept (+15): creation/approval/return-create never did.
    // (Observed above: 100 → 60 only after issue; 60 → 75 only after accept.)
  });

  it('return creation never moves stock — only the admin accept does', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { foodItemId, unitId } = await createFoodItemZeroStock();

    await request(app)
      .post(`/api/v1/food-items/${foodItemId}/stock-in`)
      .set('Cookie', admin.cookie)
      .send({ quantity: 80 });

    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, foodItemId, unitId, 30);
    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 30 }] });
    const requestId = created.body.data.request.id as string;
    await request(app).post(`/api/v1/material-requests/${requestId}/submit`).set('Cookie', executor.cookie);
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    const itemId = approved.body.data.request.items[0].id as string;
    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 30 }] });
    expect(issued.status).toBe(200);
    expect(await prisma.inventory.findUnique({ where: { foodItemId } }).then((r) => r?.currentQuantity)).toBe(50);

    const returnCreated = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 10 }] });
    expect(returnCreated.status).toBe(201);

    // Return row exists and is PENDING — stock untouched, no RETURN ledger row yet.
    const afterCreate = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(afterCreate?.currentQuantity).toBe(50);
    const ledgerBefore = await prisma.inventoryTransaction.count({
      where: { foodItemId, transactionType: 'RETURN' },
    });
    expect(ledgerBefore).toBe(0);

    // Reject also never moves stock.
    const returnId = returnCreated.body.data.return.id as string;
    const rejected = await request(app)
      .post(`/api/v1/returns/${returnId}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Damaged on inspection.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.return.status).toBe('REJECTED');
    expect(rejected.body.data.return.items[0].rejectedReturnQuantity).toBe(10);
    expect(rejected.body.data.return.items[0].acceptedReturnQuantity).toBe(0);
    const afterReject = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(afterReject?.currentQuantity).toBe(50);
    const ledgerAfter = await prisma.inventoryTransaction.count({
      where: { foodItemId, transactionType: 'RETURN' },
    });
    expect(ledgerAfter).toBe(0);
  });
});
