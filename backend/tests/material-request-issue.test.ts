import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 7 ACCEPTANCE + NEGATIVE SUITE (spec §77 / §78).
 *
 * Golden rules under test:
 *  - Only an EXECUTOR creates/submits a request; only an ADMIN approves/issues.
 *  - APPROVAL NEVER DEDUCTS STOCK — only the explicit ISSUE does.
 *  - Issue is atomic: partial (30 of 50) then full (20) → 100 → 70 → 50,
 *    request APPROVED → PARTIALLY_ISSUED → ISSUED.
 *  - Over-issue and insufficient stock are refused with 409 and NO inventory change.
 *  - The timeline is append-only; earlier entries are never rewritten.
 *  - The executor sees issued quantities and the timeline.
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
    firstName: 'Phase7',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `p7-${randomUUID()}@example.test`,
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
  const password = `ValidPass${randomUUID()}-x7`;
  const user = await createTestUser({ role: 'ADMIN', password });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookie(loginResponse) ?? '' };
}

async function createExecutorAssignedTo(admin: User): Promise<{ user: User; cookie: string }> {
  const password = `ValidPass${randomUUID()}-x7`;
  const user = await createTestUser({ role: 'EXECUTOR', password });
  await prisma.adminExecutorAssignment.create({ data: { adminId: admin.id, executorId: user.id } });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookie(loginResponse) ?? '' };
}

async function createFoodItemWithStock(stock: number): Promise<{ foodItemId: string; unitId: string }> {
  const category = await prisma.category.create({ data: { name: `P7Cat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: {
      name: `P7Unit-${randomUUID()}`,
      symbol: `P${randomUUID().slice(0, 5).toUpperCase()}`,
      unitType: 'WEIGHT',
    },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: {
      name: `Rice-${randomUUID().slice(0, 8)}`,
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

/**
 * Builds an event in PLANNING with one dish and one committed material line
 * (plannedQuantity 50, backed by `stock` units of on-hand inventory).
 */
async function createPlannedEvent(
  adminCookie: string,
  plannedQuantity = 50,
  stock = 100,
): Promise<{ eventId: string; eventMaterialId: string; foodItemId: string }> {
  const { foodItemId, unitId } = await createFoodItemWithStock(stock);

  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `P7Dish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Phase7 Event ${randomUUID().slice(0, 8)}`,
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

  // The material line id is what an executor selects when requesting.
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

/** Executor raises + submits a request for `requestedQuantity` of the single plan line. */
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
  expect(submitted.body.data.request.status).toBe('PENDING_APPROVAL');
  return requestId;
}

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  // Stock alerts are broadcast to EVERY active admin — scope cleanup by the
  // food items this file created so foreign inboxes stay clean too.
  await prisma.notification.deleteMany({ where: { referenceId: { in: createdFoodItemIds } } });
  // Events cascade to event dishes/materials, material requests + items + timeline.
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

describe('§77 acceptance — approval does not move stock; only issue does', () => {
  it('issues 30 then 20 (stock 100 → 70 → 50) and the executor sees quantities + timeline', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    expect(await getStock(foodItemId)).toBe(100); // request raised — no stock movement

    // --- APPROVE: authorise only, inventory untouched (golden rule).
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe('APPROVED');
    expect(await getStock(foodItemId)).toBe(100); // approval never deducts

    const item = approved.body.data.request.items[0];
    expect(item.requestedQuantity).toBe(50);
    expect(item.approvedQuantity).toBe(50);
    expect(item.issuedQuantity).toBe(0);
    expect(item.pendingQuantity).toBe(50);

    // --- FIRST ISSUE: 30 units → PARTIALLY_ISSUED, stock 100 → 70.
    const first = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: item.id, quantity: 30 }] });
    expect(first.status).toBe(200);
    expect(first.body.data.request.status).toBe('PARTIALLY_ISSUED');
    expect(await getStock(foodItemId)).toBe(70);
    expect(first.body.data.request.items[0].issuedQuantity).toBe(30);
    expect(first.body.data.request.items[0].pendingQuantity).toBe(20);

    // --- SECOND ISSUE: remaining 20 → ISSUED, stock 70 → 50.
    const second = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: item.id, quantity: 20 }] });
    expect(second.status).toBe(200);
    expect(second.body.data.request.status).toBe('ISSUED');
    expect(await getStock(foodItemId)).toBe(50);
    expect(second.body.data.request.items[0].issuedQuantity).toBe(50);
    expect(second.body.data.request.items[0].pendingQuantity).toBe(0);
    expect(second.body.data.request.issuedAt).not.toBeNull();

    // --- EXECUTOR VISIBILITY: issued quantities + immutable timeline.
    const asExecutor = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', executor.cookie);
    expect(asExecutor.status).toBe(200);
    const seen = asExecutor.body.data.request;
    expect(seen.status).toBe('ISSUED');
    expect(seen.items[0].issuedQuantity).toBe(50);
    expect(seen.items[0].itemStatus).toBe('ISSUED');

    const actions = seen.timeline.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(['CREATED', 'SUBMITTED', 'APPROVED', 'PARTIALLY_ISSUED', 'ISSUED']);
    const issueEntry = seen.timeline.at(-1);
    expect(issueEntry.toStatus).toBe('ISSUED');
    expect(issueEntry.actorName).toBe(`${admin.user.firstName} ${admin.user.lastName}`);
    expect(issueEntry.message).toContain('20'); // this issue's summary
    expect(issueEntry.message).toContain('All approved quantities issued');

    // --- Stock-out ledger + executor notification for the successful change.
    const ledger = await prisma.inventoryTransaction.findMany({
      where: { foodItemId, referenceType: 'MATERIAL_REQUEST_ISSUE', referenceId: requestId },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => row.quantity)).toEqual([30, 20]);
    expect(ledger.map((row) => row.balanceAfter)).toEqual([70, 50]);
    expect(ledger.every((row) => row.transactionType === 'STOCK_OUT')).toBe(true);

    const notifications = await prisma.notification.findMany({
      where: { referenceId: requestId, userId: executor.user.id },
    });
    expect(notifications.some((n) => n.type === 'MATERIAL_REQUEST_ISSUED')).toBe(true);
  });

  it('keeps the timeline append-only — earlier entries are never rewritten', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 40, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 40);
    await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});

    const before = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', executor.cookie);
    const beforeEntries = before.body.data.request.timeline as Array<{
      id: string;
      action: string;
      message: string;
      createdAt: string;
    }>;
    expect(beforeEntries.map((e) => e.action)).toEqual(['CREATED', 'SUBMITTED', 'APPROVED']);

    const item = before.body.data.request.items[0];
    await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: item.id, quantity: 40 }] });

    const after = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', executor.cookie);
    const afterEntries = after.body.data.request.timeline as typeof beforeEntries;
    expect(afterEntries).toHaveLength(beforeEntries.length + 1);

    // Every pre-existing entry keeps its id, action, message and timestamp.
    for (const [index, entry] of beforeEntries.entries()) {
      expect(afterEntries[index]).toEqual(entry);
    }
    expect(afterEntries.at(-1)?.action).toBe('ISSUED');

    // There is no API to edit or delete a timeline entry (append-only store).
    const put = await request(app)
      .put(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'DRAFT' });
    expect(put.status).toBe(404);
    const del = await request(app)
      .delete(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', admin.cookie);
    expect(del.status).toBe(404);
  });
});

describe('§78 negative — role and scope violations', () => {
  it('ADMIN cannot create a material request (403, no row written)', async () => {
    const admin = await createAdminWithSession();
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 30, 100);

    const response = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', admin.cookie)
      .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 30 }] });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.materialRequest.count({ where: { eventId } })).toBe(0);
  });

  it('EXECUTOR cannot issue stock (403) and inventory is untouched', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});

    const detail = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', executor.cookie);
    const itemId = detail.body.data.request.items[0].id as string;

    const issue = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ itemId, quantity: 10 }] });
    expect(issue.status).toBe(403);
    expect(issue.body.error.code).toBe('FORBIDDEN');
    expect(await getStock(foodItemId)).toBe(100);

    const stored = await prisma.materialRequest.findUnique({ where: { id: requestId } });
    expect(stored?.status).toBe('APPROVED');
  });

  it('a different ADMIN cannot approve or issue a request outside their scope (403)', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(adminA.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(adminA.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);

    const approveB = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', adminB.cookie)
      .send({});
    expect(approveB.status).toBe(403);

    // Even after Admin A approves, Admin B still cannot issue.
    const approveA = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', adminA.cookie)
      .send({});
    expect(approveA.status).toBe(200);

    const detail = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', adminB.cookie);
    expect(detail.status).toBe(403);

    const issueB = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', adminB.cookie)
      .send({ items: [{ itemId: approveA.body.data.request.items[0].id, quantity: 10 }] });
    expect(issueB.status).toBe(403);
    expect(await getStock(foodItemId)).toBe(100);
  });

  it('the requester ADMIN cannot approve or issue a request they created (403)', async () => {
    const admin = await createAdminWithSession();
    const { eventId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    // Legacy/self-created record (requester == scoped admin) — kept out of the
    // normal flow because creation is executor-only, but must still be blocked.
    const selfCreated = await prisma.materialRequest.create({
      data: {
        requestCode: `REQ-SELF-${randomUUID().slice(0, 8)}`,
        eventId,
        requestedById: admin.user.id,
        adminId: admin.user.id,
        status: 'PENDING_APPROVAL',
        submittedAt: new Date(),
      },
    });

    const approve = await request(app)
      .post(`/api/v1/material-requests/${selfCreated.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approve.status).toBe(403);
    expect(approve.body.error.message).toBe('You cannot approve a material request you created.');
    expect(await getStock(foodItemId)).toBe(100);
  });
});

describe('§78 negative — issue validation never corrupts inventory', () => {
  it('refuses to issue more than approved (409) with no inventory change', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    const itemId = approved.body.data.request.items[0].id as string;

    // 60 > 50 approved.
    const over = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 60 }] });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('CONFLICT');
    expect(await getStock(foodItemId)).toBe(100);

    const stored = await prisma.materialRequest.findUnique({ where: { id: requestId } });
    expect(stored?.status).toBe('APPROVED');
    const item = await prisma.materialRequestItem.findUnique({ where: { id: itemId } });
    expect(Number(item?.issuedQuantity)).toBe(0);
  });

  it('refuses to over-issue the remaining stock (409) and never goes negative', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    // Plan 50 against 100 on hand, then drain stock down to 10 before issuing.
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    const detail = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', admin.cookie);
    const itemId = detail.body.data.request.items[0].id as string;

    // Simulate other consumption between approval and issue.
    await prisma.inventory.update({ where: { foodItemId }, data: { currentQuantity: 10 } });

    const short = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 30 }] });
    expect(short.status).toBe(409);
    expect(short.body.error.message).toContain('Not enough stock');
    expect(await getStock(foodItemId)).toBe(10); // unchanged, never negative

    // A quantity that DOES fit still succeeds — the guard is per-issue, not a lock-out.
    const fits = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 10 }] });
    expect(fits.status).toBe(200);
    expect(await getStock(foodItemId)).toBe(0);
    expect(fits.body.data.request.status).toBe('PARTIALLY_ISSUED');
  });

  it('rejects non-integer, zero and negative issue quantities (400) with no stock change', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    const itemId = approved.body.data.request.items[0].id as string;

    for (const quantity of [0, -5, 2.5]) {
      const response = await request(app)
        .post(`/api/v1/material-requests/${requestId}/issue`)
        .set('Cookie', admin.cookie)
        .send({ items: [{ itemId, quantity }] });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await getStock(foodItemId)).toBe(100);
  });

  it('refuses to issue an unapproved or already-issued request (409)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);

    // Still pending approval.
    const detail = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', admin.cookie);
    const itemId = detail.body.data.request.items[0].id as string;
    const tooEarly = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 10 }] });
    expect(tooEarly.status).toBe(409);

    // Approve, fully issue, then try again.
    await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 50 }] });

    const again = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 1 }] });
    expect(again.status).toBe(409);
    expect(await getStock(foodItemId)).toBe(50);
  });
});

describe('issue-path stock alarms (Phase 7 gap fix)', () => {
  it('alerts every active admin when an issue drops stock to the minimum', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    // minimumStock 10 / reorderLevel 20 → 60 − 50 = 10 lands AT the minimum.
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 60);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approved.status).toBe(200);
    const itemId = approved.body.data.request.items[0].id as string;

    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 50 }] });
    expect(issued.status).toBe(200);
    expect(await getStock(foodItemId)).toBe(10);

    // The issue itself still succeeded — the alarm is post-commit + best-effort.
    const alerts = await prisma.notification.findMany({
      where: { type: 'LOW_STOCK', referenceType: 'FOOD_ITEM', referenceId: foodItemId, userId: admin.user.id },
    });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].message).toContain('minimum');
    expect(alerts[0].title).toContain('minimum stock');
  });

  it('stays silent while the issued balance is still above the reorder level', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    const itemId = approved.body.data.request.items[0].id as string;

    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 50 }] });
    expect(issued.status).toBe(200);
    expect(await getStock(foodItemId)).toBe(50); // 50 > reorderLevel 20

    const alerts = await prisma.notification.findMany({
      where: {
        referenceType: 'FOOD_ITEM',
        referenceId: foodItemId,
        type: { in: ['LOW_STOCK', 'OUT_OF_STOCK', 'REORDER_REQUIRED'] },
      },
    });
    expect(alerts).toHaveLength(0);
  });
});
