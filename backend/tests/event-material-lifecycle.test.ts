import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 7 EXTENSION — EVENT MATERIAL LIFECYCLE (spec §94 IDOR + §95–§104).
 *
 * Golden rules under test:
 *  - Event cancellation is ADMIN-only, reason mandatory, cascades only requests
 *    with ZERO issued quantity to CANCELLED_BY_EVENT; issued history survives
 *    so material can still be returned.
 *  - Only an EXECUTOR raises an ADDITIONAL request (new row, parent link,
 *    reason required); only an ADMIN approves/issues it.
 *  - Returns exist only for ACTUALLY ISSUED material; submit never moves stock;
 *    only ACCEPTED returns increment inventory (RETURN ledger rows).
 *  - No over-return: accepted quantity is capped at issued - acceptedReturned.
 *  - IDOR: another admin's scope, another executor's returns → 403/404.
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
    firstName: 'P7X',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `p7x-${randomUUID()}@example.test`,
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
  const category = await prisma.category.create({ data: { name: `P7XCat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: {
      name: `P7XUnit-${randomUUID()}`,
      symbol: `X${randomUUID().slice(0, 5).toUpperCase()}`,
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

/** Event in PLANNING with one dish + one committed material line. */
async function createPlannedEvent(
  adminCookie: string,
  plannedQuantity = 50,
  stock = 100,
): Promise<{ eventId: string; eventMaterialId: string; foodItemId: string }> {
  const { foodItemId, unitId } = await createFoodItemWithStock(stock);

  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `P7XDish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `P7X Event ${randomUUID().slice(0, 8)}`,
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

/** Executor raises + submits a request for `requestedQuantity`. */
async function executorRequests(
  executorCookie: string,
  eventId: string,
  eventMaterialId: string,
  requestedQuantity: number,
): Promise<string> {
  const created = await request(app)
    .post('/api/v1/material-requests')
    .set('Cookie', executorCookie)
    .send({ eventId, items: [{ eventMaterialId, requestedQuantity }] });
  expect(created.status).toBe(201);
  const requestId = created.body.data.request.id as string;

  const submitted = await request(app)
    .post(`/api/v1/material-requests/${requestId}/submit`)
    .set('Cookie', executorCookie);
  expect(submitted.status).toBe(200);
  return requestId;
}

async function approveAndIssue(
  adminCookie: string,
  requestId: string,
  quantity: number,
): Promise<{ status: string; itemId: string }> {
  const approved = await request(app)
    .post(`/api/v1/material-requests/${requestId}/approve`)
    .set('Cookie', adminCookie)
    .send({});
  expect(approved.status).toBe(200);
  const itemId = approved.body.data.request.items[0].id as string;
  const issued = await request(app)
    .post(`/api/v1/material-requests/${requestId}/issue`)
    .set('Cookie', adminCookie)
    .send({ items: [{ itemId, quantity }] });
  expect(issued.status).toBe(200);
  return { status: issued.body.data.request.status as string, itemId };
}

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  // Events cascade to dishes/materials, requests + items + timeline, returns + items + timeline.
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
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

describe('§95 event cancellation', () => {
  it('cancels with a reason, cascades unissued requests, keeps issued history', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const issuedRequestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    await approveAndIssue(admin.cookie, issuedRequestId, 20); // PARTIALLY_ISSUED, stock 100 → 80
    expect(await getStock(foodItemId)).toBe(80);

    const cancelled = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Venue flooded.' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.cancellationReason).toBe('Venue flooded.');
    expect(cancelled.body.data.cancelledAt).not.toBeNull();

    // Issued history is NEVER rewritten: the partially issued request survives.
    const survivor = await request(app)
      .get(`/api/v1/material-requests/${issuedRequestId}`)
      .set('Cookie', admin.cookie);
    expect(survivor.status).toBe(200);
    expect(survivor.body.data.request.status).toBe('PARTIALLY_ISSUED');
    expect(survivor.body.data.request.items[0].issuedQuantity).toBe(20);
    expect(await getStock(foodItemId)).toBe(80); // cancellation never moves stock

    // A second, unissued request cascades to CANCELLED_BY_EVENT.
    const unissued = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 10 }] });
    // Creation is blocked on a cancelled event, so assert the guard itself.
    expect(unissued.status).toBe(409);
  });

  it('cancels pending requests to CANCELLED_BY_EVENT with an append-only timeline', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 40, 60);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 40);

    const cancelled = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Chief guest unwell.' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.cancelledRequests).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/v1/material-requests/${requestId}`)
      .set('Cookie', admin.cookie);
    expect(detail.status).toBe(200);
    const req = detail.body.data.request;
    expect(req.status).toBe('CANCELLED_BY_EVENT');
    expect(req.items[0].itemStatus).toBe('CANCELLED_BY_EVENT');

    const actions = req.timeline.map((t: { action: string }) => t.action);
    expect(actions).toContain('CREATED');
    expect(actions).toContain('SUBMITTED');
    expect(actions).toContain('CANCELLED_BY_EVENT');

    // Cancellation is terminal: no approve / issue / submit afterwards.
    const approve = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approve.status).toBe(409);
    const issue = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: req.items[0].id, quantity: 1 }] });
    expect(issue.status).toBe(409);
    const submit = await request(app)
      .post(`/api/v1/material-requests/${requestId}/submit`)
      .set('Cookie', executor.cookie);
    expect(submit.status).toBe(409);
  });

  it('requires a reason, is ADMIN-only, and is idempotent-guarded', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId } = await createPlannedEvent(admin.cookie, 10, 20);

    const noReason = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(noReason.status).toBe(400);

    const byExecutor = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Not mine to cancel.' });
    expect(byExecutor.status).toBe(403);

    const first = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'First reason.' });
    expect(first.status).toBe(200);

    const again = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Second reason.' });
    expect(again.status).toBe(409);

    // History is never rewritten: the original reason stands.
    const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', admin.cookie);
    expect(detail.body.data.cancellationReason).toBe('First reason.');
  });
});

describe('§96 additional material requests', () => {
  it('creates a new ADDITIONAL row linked to the parent, directly pending review', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 30, 50);

    const initialId = await executorRequests(executor.cookie, eventId, eventMaterialId, 30);
    await approveAndIssue(admin.cookie, initialId, 30);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({
        reason: 'Other',
        note: 'Guest count rose by 40.',
        items: [{ eventMaterialId, requestedQuantity: 20 }],
      });
    expect(created.status).toBe(201);
    const additional = created.body.data.request;
    expect(additional.requestType).toBe('ADDITIONAL');
    expect(additional.status).toBe('PENDING_APPROVAL');
    expect(additional.parentRequestId).toBe(initialId);
    expect(additional.reason).toContain('Guest count rose by 40.');

    // The original request was NEVER mutated.
    const original = await request(app)
      .get(`/api/v1/material-requests/${initialId}`)
      .set('Cookie', admin.cookie);
    expect(original.body.data.request.status).toBe('ISSUED');
    expect(original.body.data.request.items[0].issuedQuantity).toBe(30);

    // Admin approves + issues the additional row as usual.
    const approved = await request(app)
      .post(`/api/v1/material-requests/${additional.id}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe('APPROVED');
  });

  it('is EXECUTOR-only and requires a reason', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 10, 20);

    const byAdmin = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Extra', items: [{ eventMaterialId, requestedQuantity: 5 }] });
    expect(byAdmin.status).toBe(403);

    const noReason = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ eventMaterialId, requestedQuantity: 5 }] });
    expect(noReason.status).toBe(400);

    // "Other" without a note is refused.
    const otherNoNote = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Other', items: [{ eventMaterialId, requestedQuantity: 5 }] });
    expect(otherNoNote.status).toBe(400);
  });

  it('is restricted to the event’s dish materials and blocked on cancelled events', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 10, 20);
    const foreign = await createPlannedEvent(admin.cookie, 5, 10);

    const foreignLine = await request(app)
      .get(`/api/v1/events/${foreign.eventId}`)
      .set('Cookie', admin.cookie);
    const foreignMaterialId = foreignLine.body.data.dishes
      .flatMap((d: { materials: { id: string }[] }) => d.materials)
      .at(-1).id as string;

    const wrongEvent = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Extra', items: [{ eventMaterialId: foreignMaterialId, requestedQuantity: 5 }] });
    expect(wrongEvent.status).toBe(400);

    const cancelled = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Cancelled before the extra run.' });
    expect(cancelled.status).toBe(200);

    const afterCancel = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Extra', items: [{ eventMaterialId, requestedQuantity: 5 }] });
    expect(afterCancel.status).toBe(409);
    expect(afterCancel.body.error.message).toContain('cancelled');
  });

  it('refuses an identical duplicate within 10 seconds (§104)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await createPlannedEvent(admin.cookie, 10, 20);

    const payload = {
      reason: 'Extra trays needed.',
      items: [{ eventMaterialId, requestedQuantity: 7 }],
    };
    const first = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send(payload);
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send(payload);
    expect(duplicate.status).toBe(409);
  });
});

describe('§97–§100 material returns', () => {
  it('submitting a return NEVER moves stock; only ACCEPT does (golden rule)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    await approveAndIssue(admin.cookie, requestId, 50); // stock 100 → 50
    expect(await getStock(foodItemId)).toBe(50);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'EVENT_CANCELLED', items: [{ foodItemId, quantity: 20 }] });
    expect(created.status).toBe(201);
    const materialReturn = created.body.data.return;
    expect(materialReturn.returnCode).toMatch(/^RET-\d{4}-\d{6}$/);
    expect(materialReturn.status).toBe('PENDING_ADMIN_REVIEW');
    expect(await getStock(foodItemId)).toBe(50); // submit never restocks

    const accepted = await request(app)
      .post(`/api/v1/returns/${materialReturn.id}/accept`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.return.status).toBe('ACCEPTED');
    expect(accepted.body.data.return.completedAt).not.toBeNull();
    expect(await getStock(foodItemId)).toBe(70); // 50 + 20

    const ledger = await prisma.inventoryTransaction.findFirst({
      where: { foodItemId, referenceId: materialReturn.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger?.transactionType).toBe('RETURN');
    expect(ledger?.referenceType).toBe('MATERIAL_RETURN');
    expect(ledger?.balanceBefore).toBe(50);
    expect(ledger?.balanceAfter).toBe(70);
  });

  it('rejects a return without moving stock and marks every line rejected', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 30, 40);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 30);
    await approveAndIssue(admin.cookie, requestId, 30); // stock 40 → 10
    expect(await getStock(foodItemId)).toBe(10);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Damaged in transit.', items: [{ foodItemId, quantity: 10 }] });
    expect(created.status).toBe(201);
    const id = created.body.data.return.id as string;

    const rejected = await request(app)
      .post(`/api/v1/returns/${id}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Quantity does not match the issue record.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.return.status).toBe('REJECTED');
    expect(rejected.body.data.return.items[0].acceptedReturnQuantity).toBe(0);
    expect(rejected.body.data.return.items[0].rejectedReturnQuantity).toBe(10);
    expect(await getStock(foodItemId)).toBe(10); // reject never restocks
  });

  it('supports PARTIAL accept with per-item quantities (completedAt stays null)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 60, 80);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 60);
    await approveAndIssue(admin.cookie, requestId, 60); // stock 80 → 20
    expect(await getStock(foodItemId)).toBe(20);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 40 }] });
    expect(created.status).toBe(201);
    const id = created.body.data.return.id as string;
    const itemId = created.body.data.return.items[0].id as string;

    const partial = await request(app)
      .post(`/api/v1/returns/${id}/accept`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, acceptedQuantity: 25 }] });
    expect(partial.status).toBe(200);
    expect(partial.body.data.return.status).toBe('PARTIALLY_ACCEPTED');
    expect(partial.body.data.return.completedAt).toBeNull(); // §45 unresolved remainder
    expect(partial.body.data.return.items[0].acceptedReturnQuantity).toBe(25);
    expect(partial.body.data.return.items[0].rejectedReturnQuantity).toBe(15);
    expect(await getStock(foodItemId)).toBe(45); // 20 + 25
  });

  it('refuses over-return: only issued − acceptedReturned is returnable', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 50);
    await approveAndIssue(admin.cookie, requestId, 30); // only 30 issued → returnable 30
    expect(await getStock(foodItemId)).toBe(70);

    const tooMuch = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 40 }] });
    expect(tooMuch.status).toBe(409);

    const ok = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 30 }] });
    expect(ok.status).toBe(201);
    const id = ok.body.data.return.id as string;

    // Accept it: returnable drops to 0, so a second return of the same stock fails.
    const accepted = await request(app)
      .post(`/api/v1/returns/${id}/accept`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(accepted.status).toBe(200);
    expect(await getStock(foodItemId)).toBe(100);

    const second = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 1 }] });
    expect(second.status).toBe(409);
  });

  it('refuses returns for material that was never issued', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, foodItemId } = await createPlannedEvent(admin.cookie, 20, 30);

    const nothingIssued = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 5 }] });
    expect(nothingIssued.status).toBe(409);
    expect(nothingIssued.body.error.message).toContain('actually been issued');
    expect(await getStock(foodItemId)).toBe(30);
  });

  it('requires ADMIN to accept/reject and EXECUTOR to create', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 20, 30);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 20);
    await approveAndIssue(admin.cookie, requestId, 20);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 5 }] });
    expect(created.status).toBe(201);
    const id = created.body.data.return.id as string;

    const executorAccept = await request(app)
      .post(`/api/v1/returns/${id}/accept`)
      .set('Cookie', executor.cookie)
      .send({});
    expect(executorAccept.status).toBe(403);
    expect(await getStock(foodItemId)).toBe(10);

    const executorReject = await request(app)
      .post(`/api/v1/returns/${id}/reject`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'nope' });
    expect(executorReject.status).toBe(403);

    const adminCreate = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ foodItemId, quantity: 5 }] });
    expect(adminCreate.status).toBe(403);
    expect(await getStock(foodItemId)).toBe(10);
  });

  it('cannot review a return twice (terminal states are immutable)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 20, 30);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 20);
    await approveAndIssue(admin.cookie, requestId, 20);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 10 }] });
    const id = created.body.data.return.id as string;

    const first = await request(app)
      .post(`/api/v1/returns/${id}/accept`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(first.status).toBe(200);
    expect(await getStock(foodItemId)).toBe(20); // 10 + 10

    const second = await request(app)
      .post(`/api/v1/returns/${id}/accept`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(second.status).toBe(409);
    expect(await getStock(foodItemId)).toBe(20); // no double restock
  });
});

describe('§94 IDOR + RBAC across scopes', () => {
  it('another admin cannot read or review a return outside their scope', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();
    const executorA = await createExecutorAssignedTo(adminA.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(adminA.cookie, 20, 30);

    const requestId = await executorRequests(executorA.cookie, eventId, eventMaterialId, 20);
    await approveAndIssue(adminA.cookie, requestId, 20);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executorA.cookie)
      .send({ items: [{ foodItemId, quantity: 5 }] });
    expect(created.status).toBe(201);
    const id = created.body.data.return.id as string;

    const readB = await request(app).get(`/api/v1/returns/${id}`).set('Cookie', adminB.cookie);
    expect(readB.status).toBe(403);

    const acceptB = await request(app)
      .post(`/api/v1/returns/${id}/accept`)
      .set('Cookie', adminB.cookie)
      .send({});
    expect(acceptB.status).toBe(403);
    expect(await getStock(foodItemId)).toBe(10); // untouched

    const listB = await request(app).get('/api/v1/returns').set('Cookie', adminB.cookie);
    expect(listB.status).toBe(200);
    expect(listB.body.data.returns).toHaveLength(0);
  });

  it('an unassigned executor cannot read another scope’s return', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();
    const executorA = await createExecutorAssignedTo(adminA.user);
    const executorB = await createExecutorAssignedTo(adminB.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(adminA.cookie, 20, 30);

    const requestId = await executorRequests(executorA.cookie, eventId, eventMaterialId, 20);
    await approveAndIssue(adminA.cookie, requestId, 20);

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executorA.cookie)
      .send({ items: [{ foodItemId, quantity: 5 }] });
    const id = created.body.data.return.id as string;

    const read = await request(app).get(`/api/v1/returns/${id}`).set('Cookie', executorB.cookie);
    expect(read.status).toBe(403);

    const createOnForeignEvent = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executorB.cookie)
      .send({ items: [{ foodItemId, quantity: 1 }] });
    expect(createOnForeignEvent.status).toBe(403);
  });

  it('another admin cannot cancel an event outside their scope', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();
    const { eventId } = await createPlannedEvent(adminA.cookie, 10, 20);

    const cancel = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', adminB.cookie)
      .send({ reason: 'Sneaky cancel.' });
    expect(cancel.status).toBe(403);

    const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminB.cookie);
    expect(detail.status).toBe(403);
  });
});

describe('§101–§104 material summary + dashboards', () => {
  it('computes Planned/Requested/Approved/Issued/Returned + lifecycle status (§39/§40)', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 50, 100);

    // No request yet → PLANNED.
    const planned = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(planned.status).toBe(200);
    expect(planned.body.data.lifecycleStatus).toBe('PLANNED');
    expect(planned.body.data.totals.plannedQuantity).toBe(50);
    expect(planned.body.data.totals.issuedQuantity).toBe(0);

    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 40);
    const pending = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(pending.body.data.lifecycleStatus).toBe('APPROVAL_PENDING');
    expect(pending.body.data.totals.requestedQuantity).toBe(40);
    expect(pending.body.data.totals.pendingApprovalQuantity).toBe(40);

    await approveAndIssue(admin.cookie, requestId, 30);
    const issued = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(issued.body.data.lifecycleStatus).toBe('ISSUE_PENDING'); // 10 approved not yet issued
    expect(issued.body.data.totals.approvedQuantity).toBe(40);
    expect(issued.body.data.totals.issuedQuantity).toBe(30);
    expect(issued.body.data.totals.pendingIssueQuantity).toBe(10);
    expect(issued.body.data.totals.returnableQuantity).toBe(30); // unreturned issued

    const created = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 10 }] });
    const accepted = await request(app)
      .post(`/api/v1/returns/${created.body.data.return.id}/accept`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(accepted.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(after.body.data.totals.returnedQuantity).toBe(10);
    expect(after.body.data.totals.returnableQuantity).toBe(20);
    expect(after.body.data.lines[0].foodItemId).toBe(foodItemId);
    expect(after.body.data.lines[0].availableStock).toBe(80); // 100 - 30 + 10
  });

  it('lists returns for the admin scope with status filters', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await createPlannedEvent(admin.cookie, 20, 30);
    const requestId = await executorRequests(executor.cookie, eventId, eventMaterialId, 20);
    await approveAndIssue(admin.cookie, requestId, 20);

    await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ foodItemId, quantity: 5 }] });

    const all = await request(app).get('/api/v1/returns').set('Cookie', admin.cookie);
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBeGreaterThanOrEqual(1);

    const pending = await request(app)
      .get('/api/v1/returns?status=PENDING_ADMIN_REVIEW')
      .set('Cookie', admin.cookie);
    expect(pending.status).toBe(200);
    expect(pending.body.data.returns.every((r: { status: string }) => r.status === 'PENDING_ADMIN_REVIEW')).toBe(true);

    const badStatus = await request(app)
      .get('/api/v1/returns?status=NOT_A_STATUS')
      .set('Cookie', admin.cookie);
    expect(badStatus.status).toBe(400);
  });
});
