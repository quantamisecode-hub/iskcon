import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — TC-20 PARTIAL ISSUE (mission's exact 30/40/30 example).
 *
 * Covers TC-PART-001…008 of docs/test-cases/TC-20-partial-issue.md:
 *  - 001: first partial issue 30 of 100 → PARTIALLY_ISSUED, stock −30, one ledger row.
 *  - 002: second issue 40 → 70 issued / 30 remaining, two ledger rows.
 *  - 003: final issue 30 → 100 issued, status ISSUED, three ledger rows, further issue 409.
 *  - 004: over-issue across partial calls (31 when 30 remain) → 409, nothing moves.
 *  - 005: 0 / negative / non-integer between partials → 400, no state change.
 *  - 006: concurrent partial issue race → exactly one winner, ledger sums to issued.
 *  - 007: each successful partial issue notifies (PARTIALLY_ISSUED vs ISSUED).
 *  - 008: §39 material summary aggregates partial issues + reconciliation chip.
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
    firstName: 'Phase11',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `p11-${randomUUID()}@example.test`,
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
  const password = `ValidPass${randomUUID()}-x11`;
  const user = await createTestUser({ role: 'ADMIN', password });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookie(loginResponse) ?? '' };
}

async function createExecutorAssignedTo(admin: User): Promise<{ user: User; cookie: string }> {
  const password = `ValidPass${randomUUID()}-x11`;
  const user = await createTestUser({ role: 'EXECUTOR', password });
  await prisma.adminExecutorAssignment.create({ data: { adminId: admin.id, executorId: user.id } });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookie(loginResponse) ?? '' };
}

async function createFoodItemWithStock(stock: number): Promise<{ foodItemId: string; unitId: string }> {
  const category = await prisma.category.create({ data: { name: `P11Cat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: {
      name: `P11Unit-${randomUUID()}`,
      symbol: `Q${randomUUID().slice(0, 5).toUpperCase()}`,
      unitType: 'WEIGHT',
    },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: {
      name: `Dal-${randomUUID().slice(0, 8)}`,
      categoryId: category.id,
      unitId: unit.id,
      minimumStock: 10,
      reorderLevel: 20,
    },
  });
  createdFoodItemIds.push(food.id);
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: stock } });
  return { foodItemId: food.id, unitId: unit.id };
}

/** Event in PLANNING with one committed material line of `plannedQuantity` against `stock` on hand. */
async function createPlannedEvent(
  adminCookie: string,
  plannedQuantity = 100,
  stock = 500,
): Promise<{ eventId: string; eventMaterialId: string; foodItemId: string }> {
  const { foodItemId, unitId } = await createFoodItemWithStock(stock);

  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `P11Dish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Phase11 Event ${randomUUID().slice(0, 8)}`,
      eventDate: '2026-12-24',
      startTime: '11:00',
      numberOfPeople: 120,
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

  return { eventId, eventMaterialId, foodItemId };
}

async function getStock(foodItemId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { foodItemId } });
  return row?.currentQuantity ?? -1;
}

async function executorRequests(
  executorCookie: string,
  eventId: string,
  eventMaterialId: string,
  requestedQuantity: number,
): Promise<string> {
  const created = await request(app)
    .post('/api/v1/material-requests')
    .set('Cookie', executorCookie)
    .send({
      eventId,
      items: [{ eventMaterialId, requestedQuantity }],
    });
  expect(created.status).toBe(201);
  const requestId = created.body.data.request.id as string;

  const submitted = await request(app)
    .post(`/api/v1/material-requests/${requestId}/submit`)
    .set('Cookie', executorCookie);
  expect(submitted.status).toBe(200);
  return requestId;
}

async function approve(adminCookie: string, requestId: string): Promise<string> {
  const approved = await request(app)
    .post(`/api/v1/material-requests/${requestId}/approve`)
    .set('Cookie', adminCookie)
    .send({});
  expect(approved.status).toBe(200);
  expect(approved.body.data.request.status).toBe('APPROVED');
  return approved.body.data.request.items[0].id as string;
}

async function issue(adminCookie: string, requestId: string, itemId: string, quantity: number) {
  return request(app)
    .post(`/api/v1/material-requests/${requestId}/issue`)
    .set('Cookie', adminCookie)
    .send({ items: [{ itemId, quantity }] });
}

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.notification.deleteMany({ where: { referenceId: { in: createdFoodItemIds } } });
  // Events cascade to dishes/materials, requests + items + timeline and returns + items + timeline.
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

describe('TC-PART-001…003 — the mission example: 100 approved, issued 30 + 40 + 30', () => {
  it('walks PARTIALLY_ISSUED → ISSUED with exact ledger arithmetic at every step', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    // 100 planned against 500 on hand — plenty of room for the full issue.
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    expect(await getStock(foodItemId)).toBe(500);

    const itemId = await approve(admin.cookie, requestId);

    // --- STEP 1: issue 30 of 100 → PARTIALLY_ISSUED, stock 500 → 470 (TC-PART-001).
    const first = await issue(admin.cookie, requestId, itemId, 30);
    expect(first.status).toBe(200);
    expect(first.body.data.request.status).toBe('PARTIALLY_ISSUED');
    expect(await getStock(foodItemId)).toBe(470);
    expect(first.body.data.request.items[0].issuedQuantity).toBe(30);
    expect(first.body.data.request.items[0].pendingQuantity).toBe(70);

    // --- STEP 2: issue 40 → 70 issued / 30 remaining (TC-PART-002).
    const second = await issue(admin.cookie, requestId, itemId, 40);
    expect(second.status).toBe(200);
    expect(second.body.data.request.status).toBe('PARTIALLY_ISSUED');
    expect(await getStock(foodItemId)).toBe(430);
    expect(second.body.data.request.items[0].issuedQuantity).toBe(70);
    expect(second.body.data.request.items[0].pendingQuantity).toBe(30);

    // --- STEP 3: final issue 30 → 100 issued, ISSUED, 0 remaining (TC-PART-003).
    const third = await issue(admin.cookie, requestId, itemId, 30);
    expect(third.status).toBe(200);
    expect(third.body.data.request.status).toBe('ISSUED');
    expect(await getStock(foodItemId)).toBe(400);
    expect(third.body.data.request.items[0].issuedQuantity).toBe(100);
    expect(third.body.data.request.items[0].pendingQuantity).toBe(0);
    expect(third.body.data.request.issuedAt).not.toBeNull();

    // Exactly three STOCK_OUT ledger rows, summing to the issued total (100 − 400).
    const ledger = await prisma.inventoryTransaction.findMany({
      where: { foodItemId, referenceType: 'MATERIAL_REQUEST_ISSUE', referenceId: requestId },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger).toHaveLength(3);
    expect(ledger.map((row) => Number(row.quantity))).toEqual([30, 40, 30]);
    expect(ledger.map((row) => row.balanceAfter)).toEqual([470, 430, 400]);
    expect(ledger.every((row) => row.transactionType === 'STOCK_OUT')).toBe(true);
    expect(ledger.every((row) => row.performedBy === admin.user.id)).toBe(true);

    // Net stock movement is exactly −100 across the three calls.
    expect(500 - (await getStock(foodItemId))).toBe(100);
  });

  it('refuses further issue after the request is fully issued (409)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    const itemId = await approve(admin.cookie, requestId);

    for (const quantity of [30, 40, 30]) {
      const response = await issue(admin.cookie, requestId, itemId, quantity);
      expect(response.status).toBe(200);
    }
    const stockAfterFullIssue = await getStock(foodItemId);
    expect(stockAfterFullIssue).toBe(400);

    const extra = await issue(admin.cookie, requestId, itemId, 1);
    expect(extra.status).toBe(409);
    expect(extra.body.error.code).toBe('CONFLICT');
    expect(await getStock(foodItemId)).toBe(400); // nothing moved
  });
});

describe('TC-PART-004/005 — negative paths between partial calls', () => {
  it('refuses to over-issue across partial calls (31 when 30 remain, 409)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    const itemId = await approve(admin.cookie, requestId);

    const first = await issue(admin.cookie, requestId, itemId, 30);
    expect(first.status).toBe(200);
    const second = await issue(admin.cookie, requestId, itemId, 40);
    expect(second.status).toBe(200);
    // 70 issued of 100 → remaining is 30; 31 over-issues.
    const over = await issue(admin.cookie, requestId, itemId, 31);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('CONFLICT');

    // Nothing moved: still exactly 70 issued, two ledger rows, stock 430.
    const stored = await prisma.materialRequestItem.findUnique({ where: { id: itemId } });
    expect(Number(stored?.issuedQuantity)).toBe(70);
    const ledger = await prisma.inventoryTransaction.findMany({
      where: { referenceType: 'MATERIAL_REQUEST_ISSUE', referenceId: requestId },
    });
    expect(ledger).toHaveLength(2);
    expect(await getStock(foodItemId)).toBe(430);

    // The remaining 30 still issues fine afterwards — the guard is per-call.
    const rest = await issue(admin.cookie, requestId, itemId, 30);
    expect(rest.status).toBe(200);
    expect(rest.body.data.request.status).toBe('ISSUED');
  });

  it('rejects 0 / negative / non-integer quantities between partials (400)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    const itemId = await approve(admin.cookie, requestId);

    await issue(admin.cookie, requestId, itemId, 30);
    for (const quantity of [0, -10, 12.5]) {
      const response = await issue(admin.cookie, requestId, itemId, quantity);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await getStock(foodItemId)).toBe(470);
    const stored = await prisma.materialRequestItem.findUnique({ where: { id: itemId } });
    expect(Number(stored?.issuedQuantity)).toBe(30);
  });
});

describe('TC-PART-006 — concurrent partial issue race', () => {
  it('two parallel issue(50) calls on 70 remaining → exactly one wins, ledger sums to issued', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    const itemId = await approve(admin.cookie, requestId);

    await issue(admin.cookie, requestId, itemId, 30);
    // Remaining = 70. Two parallel attempts to issue 50 — only 50 can fit in total.
    const [a, b] = await Promise.all([
      issue(admin.cookie, requestId, itemId, 50),
      issue(admin.cookie, requestId, itemId, 50),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]); // exactly one winner

    const stored = await prisma.materialRequestItem.findUnique({ where: { id: itemId } });
    expect(Number(stored?.issuedQuantity)).toBe(80); // 30 initial + one winning 50

    const ledger = await prisma.inventoryTransaction.findMany({
      where: { referenceType: 'MATERIAL_REQUEST_ISSUE', referenceId: requestId },
    });
    expect(ledger).toHaveLength(2); // 30 + the winning 50
    const ledgerSum = ledger.reduce((sum, row) => sum + Number(row.quantity), 0);
    expect(ledgerSum).toBe(Number(stored?.issuedQuantity)); // ledger == issued
    expect(await getStock(foodItemId)).toBe(500 - ledgerSum); // inventory == ledger
    expect(await getStock(foodItemId)).toBe(420);
  });
});

describe('TC-PART-007 — notification per partial issue call', () => {
  it('notifies the executor PARTIALLY_ISSUED on partials and ISSUED on the final call', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    const itemId = await approve(admin.cookie, requestId);

    await issue(admin.cookie, requestId, itemId, 30);
    await issue(admin.cookie, requestId, itemId, 40);
    await issue(admin.cookie, requestId, itemId, 30);

    const notifications = await prisma.notification.findMany({
      where: { referenceId: requestId, userId: executor.user.id },
      orderBy: { createdAt: 'asc' },
    });
    const issueTypes = notifications
      .filter((n) => n.type.startsWith('MATERIAL_REQUEST_'))
      .map((n) => n.type);
    expect(issueTypes).toContain('MATERIAL_REQUEST_PARTIALLY_ISSUED');
    expect(issueTypes).toContain('MATERIAL_REQUEST_ISSUED');
    // Exactly one ISSUED notification — only the completing call emits it.
    expect(issueTypes.filter((t) => t === 'MATERIAL_REQUEST_ISSUED')).toHaveLength(1);
  });
});

describe('TC-PART-008 — §39 summary aggregates partial issues', () => {
  it('reports issued 100 / pendingIssue 0 / returnable 100 and the reconciliation chip', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 100, 500);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 100);
    const itemId = await approve(admin.cookie, requestId);
    for (const quantity of [30, 40, 30]) {
      const response = await issue(admin.cookie, requestId, itemId, quantity);
      expect(response.status).toBe(200);
    }

    const summary = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(summary.status).toBe(200);

    const data = summary.body.data;
    const line = (data.lines as Array<{ foodItemId: string; issuedQuantity: number; pendingIssueQuantity: number; returnableQuantity: number; requestedQuantity: number; approvedQuantity: number }>)
      .find((l) => l.foodItemId === foodItemId);
    expect(line).toBeDefined();
    expect(line?.requestedQuantity).toBe(100);
    expect(line?.approvedQuantity).toBe(100);
    expect(line?.issuedQuantity).toBe(100); // 30 + 40 + 30 aggregated
    expect(line?.pendingIssueQuantity).toBe(0); // approved − issued
    expect(line?.returnableQuantity).toBe(100); // unreturned = issued − accepted(0)
    expect(data.totals.issuedQuantity).toBe(100);
    expect(data.lifecycleStatus).toBe('RETURN_RECONCILIATION_PENDING');
  });
});
