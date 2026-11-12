import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — TC-22: ADDITIONAL MATERIAL REQUEST (§35–§37), 12 cases.
 *
 * Golden rule: the stage-gate chain is identical to INITIAL requests —
 * EXECUTOR creates, ADMIN approves/issues; approval NEVER deducts stock.
 *
 * RECORDED DEVIATIONS (spec vs implemented):
 * - TC-ADD-001 spec text says the additional request starts as `DRAFT`;
 *   the implementation creates it directly in PENDING_APPROVAL
 *   (create + submit in one action — see createAdditional docstring §35–§37).
 *   Pinned here as implemented behaviour.
 * - TC-ADD-005 spec says referenceType EVENT deep link; implementation uses
 *   referenceType MATERIAL_REQUEST (deep link to the request detail).
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

async function createTestUser(role: 'ADMIN' | 'EXECUTOR'): Promise<{ user: User; password: string }> {
  const password = `ValidPass${randomUUID()}-add`;
  const user = await authService.createUserRecord({
    firstName: 'Add',
    lastName: role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `add-${randomUUID()}@example.test`,
    password,
    role,
  });
  createdUserIds.push(user.id);
  return { user, password };
}

function extractCookie(response: request.Response): string {
  const setCookie = response.headers['set-cookie'];
  return Array.isArray(setCookie) && setCookie.length > 0 ? setCookie[0].split(';')[0] : '';
}

async function createUserWithSession(role: 'ADMIN' | 'EXECUTOR') {
  const { user, password } = await createTestUser(role);
  const response = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  return { user, cookie: extractCookie(response) };
}

async function createExecutorAssignedTo(admin: User) {
  const created = await createUserWithSession('EXECUTOR');
  await prisma.adminExecutorAssignment.create({ data: { adminId: admin.id, executorId: created.user.id } });
  return created;
}

async function createFoodItemWithStock(stock: number): Promise<{ foodItemId: string }> {
  const category = await prisma.category.create({ data: { name: `AddCat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: { name: `AddUnit-${randomUUID()}`, symbol: `A${randomUUID().slice(0, 5).toUpperCase()}`, unitType: 'WEIGHT' },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: {
      name: `AddDal-${randomUUID().slice(0, 8)}`,
      categoryId: category.id,
      unitId: unit.id,
      minimumStock: 10,
      reorderLevel: 20,
    },
  });
  createdFoodItemIds.push(food.id);
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: stock } });
  return { foodItemId: food.id };
}

async function getStock(foodItemId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { foodItemId } });
  return row?.currentQuantity ?? -1;
}

/** Event + committed plan line (40) + executor INITIAL request (submitted + approved). */
async function buildEventWithInitial(adminCookie: string, executorCookie: string) {
  const { foodItemId } = await createFoodItemWithStock(100);

  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `AddDish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Add Event ${randomUUID().slice(0, 8)}`,
      eventDate: '2026-12-26',
      startTime: '10:00',
      numberOfPeople: 40,
    });
  expect(event.status).toBe(201);
  const eventId = event.body.data.id as string;
  createdEventIds.push(eventId);

  await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', adminCookie).send({ status: 'PLANNING' });
  const addDish = await request(app)
    .post(`/api/v1/events/${eventId}/dishes`)
    .set('Cookie', adminCookie)
    .send({ dishId: dish.body.data.id });
  const eventDishId = addDish.body.data.dishes.at(-1).id as string;
  const addMaterial = await request(app)
    .post(`/api/v1/event-dishes/${eventDishId}/materials`)
    .set('Cookie', adminCookie)
    .send({ foodItemId, plannedQuantity: 40, unitId: dish.body.data.unitId ?? undefined });
  expect(addMaterial.status).toBe(201);
  const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminCookie);
  const eventMaterialId = detail.body.data.dishes
    .flatMap((d: { materials: { id: string }[] }) => d.materials)
    .at(-1).id as string;

  const initial = await request(app)
    .post('/api/v1/material-requests')
    .set('Cookie', executorCookie)
    .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 40 }] });
  expect(initial.status).toBe(201);
  const initialRequestId = initial.body.data.request.id as string;
  createdRequestIds.push(initialRequestId);
  await request(app).post(`/api/v1/material-requests/${initialRequestId}/submit`).set('Cookie', executorCookie);

  const approved = await request(app)
    .post(`/api/v1/material-requests/${initialRequestId}/approve`)
    .set('Cookie', adminCookie)
    .send({});
  expect(approved.status).toBe(200);

  return { eventId, eventDishId, eventMaterialId, initialRequestId, foodItemId };
}

/** Executor raises an additional request against the committed line. */
async function createAdditional(
  executorCookie: string,
  eventId: string,
  eventMaterialId: string,
  requestedQuantity: number,
) {
  return request(app)
    .post(`/api/v1/events/${eventId}/material-requests`)
    .set('Cookie', executorCookie)
    .send({ reason: 'Additional guests expected', items: [{ eventMaterialId, requestedQuantity }] });
}

afterAll(async () => {
  await withDeadlockRetry(async () => {
    const eventIds = createdEventIds;
    // Requests (items/timeline cascade), notifications by reference + owner.
    await prisma.notification.deleteMany({ where: { referenceId: { in: [...createdRequestIds, ...createdEventIds] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.materialRequest.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
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

describe('TC-ADD-001 — executor creates ADDITIONAL request from committed lines', () => {
  it('201; new ADDITIONAL row linked to parent; stock unchanged; audit + admin notification', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, initialRequestId, foodItemId } = await buildEventWithInitial(
      admin.cookie,
      executor.cookie,
    );

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    expect(created.status).toBe(201);
    const req = created.body.data.request;
    createdRequestIds.push(req.id);
    expect(req.requestType).toBe('ADDITIONAL');
    expect(req.parentRequestId).toBe(initialRequestId); // auto-linked to latest INITIAL
    expect(String(req.requestCode)).toMatch(/^REQ-\d{4}-/);
    // RECORDED: implemented as create+submit-in-one → PENDING_APPROVAL (spec text said DRAFT).
    expect(req.status).toBe('PENDING_APPROVAL');

    const item = await prisma.materialRequestItem.findFirst({ where: { requestId: req.id } });
    expect(item?.sourceEventMaterialId).toBe(eventMaterialId);
    expect(Number(item?.requestedQuantity)).toBe(10);
    expect(item?.status).toBe('REQUESTED');

    // Approval never deducts stock — creation must not either.
    expect(await getStock(foodItemId)).toBe(100);
    expect(await prisma.inventoryTransaction.count({ where: { foodItemId } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: req.id, action: 'REQUEST_ADDITIONAL_CREATED' } });
    expect(audit?.userId).toBe(executor.user.id);

    const notification = await prisma.notification.findFirst({
      where: { referenceId: req.id, userId: admin.user.id, type: 'REQUEST_ADDITIONAL_CREATED' },
    });
    expect(notification).not.toBeNull();
  });
});

describe('TC-ADD-002 — ADMIN cannot create an additional request', () => {
  it('403 (route guard + service); no row; no notification', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const created = await createAdditional(admin.cookie, eventId, eventMaterialId, 10);
    expect(created.status).toBe(403);

    const rows = await prisma.materialRequest.count({ where: { eventId, requestType: 'ADDITIONAL' } });
    expect(rows).toBe(0);
    expect(
      await prisma.notification.count({ where: { type: 'REQUEST_ADDITIONAL_CREATED', userId: admin.user.id } }),
    ).toBe(0);
  });
});

describe('TC-ADD-003 — parentRequestId linkage visible; parent history untouched', () => {
  it('detail exposes the parent link; parent row + timeline unchanged', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, initialRequestId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const parentBefore = await prisma.materialRequest.findUnique({ where: { id: initialRequestId } });
    const parentTimelineBefore = await prisma.materialRequestTimeline.count({ where: { requestId: initialRequestId } });

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    createdRequestIds.push(created.body.data.request.id as string);
    const additionalId = created.body.data.request.id as string;

    const detail = await request(app).get(`/api/v1/material-requests/${additionalId}`).set('Cookie', executor.cookie);
    expect(detail.status).toBe(200);
    expect(String(detail.body.data.request?.parentRequestId ?? detail.body.data.parentRequestId)).toBe(initialRequestId);

    const parentAfter = await prisma.materialRequest.findUnique({ where: { id: initialRequestId } });
    expect(parentAfter?.status).toBe(parentBefore?.status);
    expect(await prisma.materialRequestTimeline.count({ where: { requestId: initialRequestId } })).toBe(
      parentTimelineBefore,
    );
  });
});

describe('TC-ADD-004 — only committed lines selectable', () => {
  it('foreign eventMaterialId → 400; parked isDraft line → 400 (spec §35)', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventDishId, eventMaterialId } = await buildEventWithInitial(
      admin.cookie,
      executor.cookie,
    );

    // (a) id that belongs to no event → 400.
    const foreign = await createAdditional(executor.cookie, eventId, randomUUID(), 10);
    expect(foreign.status).toBe(400);

    // (b) shortfall line parked as draft must NOT be requestable.
    // EventMaterial is unique per (eventDish, foodItem), so the draft uses a
    // SECOND food item.
    const { foodItemId: draftFoodId } = await createFoodItemWithStock(0);
    const draft = await prisma.eventMaterial.create({
      data: { eventDishId, foodItemId: draftFoodId, unitId: (await prisma.foodItem.findUnique({ where: { id: draftFoodId } }))!.unitId, plannedQuantity: 5, isDraft: true },
    });
    const draftProbe = await createAdditional(executor.cookie, eventId, draft.id, 5);
    expect(draftProbe.status, 'draft (isDraft) line must be rejected — spec TC-ADD-004').toBe(400);
    void eventMaterialId;
  });
});

describe('TC-ADD-005 — §52 notification: admin receives, executor does not', () => {
  it('REQUEST_ADDITIONAL_CREATED row targets the admin only', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    createdRequestIds.push(created.body.data.request.id as string);
    const requestId = created.body.data.request.id as string;

    const row = await prisma.notification.findFirst({ where: { referenceId: requestId } });
    expect(row?.userId).toBe(admin.user.id);
    expect(row?.type).toBe('REQUEST_ADDITIONAL_CREATED');
    expect(row?.category).toBe('REQUEST');
    expect(row?.priority).toBe('HIGH');
    // RECORDED: referenceType is MATERIAL_REQUEST (deep link to the request), not EVENT.
    expect(row?.referenceType).toBe('MATERIAL_REQUEST');

    const executorList = await request(app)
      .get('/api/v1/notifications?pageSize=100')
      .set('Cookie', executor.cookie);
    expect(JSON.stringify(executorList.body.data ?? executorList.body)).not.toContain('REQUEST_ADDITIONAL_CREATED');
  });
});

describe('TC-ADD-006 — approve ADDITIONAL → dedicated audit + notification, stock untouched', () => {
  it('APPROVED; REQUEST_ADDITIONAL_APPROVED; zero ledger rows; inventory unchanged', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    createdRequestIds.push(created.body.data.request.id as string);
    const requestId = created.body.data.request.id as string;

    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe('APPROVED');

    const audit = await prisma.auditLog.findFirst({ where: { entityId: requestId, action: 'REQUEST_ADDITIONAL_APPROVED' } });
    expect(audit?.userId).toBe(admin.user.id);

    const notification = await prisma.notification.findFirst({
      where: { referenceId: requestId, userId: executor.user.id, type: 'REQUEST_ADDITIONAL_APPROVED' },
    });
    expect(notification).not.toBeNull();

    // Approval NEVER deducts stock.
    expect(await getStock(foodItemId)).toBe(100);
    expect(await prisma.inventoryTransaction.count({ where: { foodItemId } })).toBe(0);
  });
});

describe('TC-ADD-007 — issue ADDITIONAL moves stock exactly once; §39 aggregates both requests', () => {
  it('STOCK_OUT ledger row references the ADDITIONAL request; summary totals include it', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, initialRequestId, foodItemId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    createdRequestIds.push(created.body.data.request.id as string);
    const requestId = created.body.data.request.id as string;
    await request(app).post(`/api/v1/material-requests/${requestId}/approve`).set('Cookie', admin.cookie).send({});

    // Issue the INITIAL request (40) first so §39 truly aggregates BOTH requests.
    const initialDetail = await request(app)
      .get(`/api/v1/material-requests/${initialRequestId}`)
      .set('Cookie', admin.cookie);
    const initialItemId = initialDetail.body.data.request.items[0].id as string;
    const initialIssued = await request(app)
      .post(`/api/v1/material-requests/${initialRequestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId: initialItemId, quantity: 40 }] });
    expect(initialIssued.status).toBe(200);

    const approvedDetail = await request(app).get(`/api/v1/material-requests/${requestId}`).set('Cookie', admin.cookie);
    const itemId = approvedDetail.body.data.request.items[0].id as string;

    const issued = await request(app)
      .post(`/api/v1/material-requests/${requestId}/issue`)
      .set('Cookie', admin.cookie)
      .send({ items: [{ itemId, quantity: 10 }] });
    expect(issued.status).toBe(200);
    expect(issued.body.data.request.status).toBe('ISSUED');

    // Exactly one STOCK_OUT row per issued request; the ADDITIONAL row references it.
    const ledger = await prisma.inventoryTransaction.findMany({ where: { foodItemId }, orderBy: { createdAt: 'asc' } });
    expect(ledger.length).toBe(2);
    const additionalRow = ledger.find((row) => row.referenceId === requestId);
    expect(additionalRow?.transactionType).toBe('STOCK_OUT');
    expect(Number(additionalRow?.quantity)).toBe(10);
    expect(Number(additionalRow?.balanceAfter)).toBe(50);
    expect(additionalRow?.performedBy).toBe(admin.user.id);
    expect(await getStock(foodItemId)).toBe(50); // 100 − 40 (initial) − 10 (additional)

    const audit = await prisma.auditLog.findFirst({ where: { entityId: requestId, action: 'MATERIAL_ISSUED' } });
    expect(audit).not.toBeNull();

    // §39 summary aggregates BOTH requests: initial 40 + additional 10 issued.
    const summary = await request(app)
      .get(`/api/v1/events/${eventId}/material-summary`)
      .set('Cookie', admin.cookie);
    expect(summary.status).toBe(200);
    const totals = summary.body.data.totals;
    expect(Number(totals.issuedQuantity)).toBe(50);
  });
});

describe('TC-ADD-008 — reject stores reason; item quantities; executor notified', () => {
  it('REJECTED; rejectedQuantity = requested; REQUEST_ADDITIONAL_REJECTED to executor', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId, foodItemId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    createdRequestIds.push(created.body.data.request.id as string);
    const requestId = created.body.data.request.id as string;

    const rejected = await request(app)
      .post(`/api/v1/material-requests/${requestId}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Budget exhausted for this event.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.request.status).toBe('REJECTED');

    const item = await prisma.materialRequestItem.findFirst({ where: { requestId } });
    expect(item?.status).toBe('REJECTED');
    expect(Number(item?.rejectedQuantity)).toBe(10);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: requestId, action: 'REQUEST_ADDITIONAL_REJECTED' } });
    expect(audit).not.toBeNull();
    const stored = await prisma.materialRequest.findUnique({ where: { id: requestId } });
    expect(stored?.requestType).toBe('ADDITIONAL');
    expect(stored?.rejectionReason).toBe('Budget exhausted for this event.');
    const timeline = await prisma.materialRequestTimeline.findFirst({
      where: { requestId, action: 'REJECTED' },
    });
    expect(timeline).not.toBeNull();

    const notification = await prisma.notification.findFirst({
      where: { referenceId: requestId, userId: executor.user.id, type: 'REQUEST_ADDITIONAL_REJECTED' },
    });
    expect(notification).not.toBeNull();
    expect(await getStock(foodItemId)).toBe(100);
  });
});

describe('TC-ADD-009 — event cancellation cascades zero-issued ADDITIONAL only', () => {
  it('APPROVED additional → CANCELLED_BY_EVENT; ISSUED additional untouched', async () => {
    // Event A: additional APPROVED (zero issued) — must cascade.
    const adminA = await createUserWithSession('ADMIN');
    const executorA = await createExecutorAssignedTo(adminA.user);
    const a = await buildEventWithInitial(adminA.cookie, executorA.cookie);
    const addA = await createAdditional(executorA.cookie, a.eventId, a.eventMaterialId, 10);
    createdRequestIds.push(addA.body.data.request.id as string);
    const addAId = addA.body.data.request.id as string;
    await request(app).post(`/api/v1/material-requests/${addAId}/approve`).set('Cookie', adminA.cookie).send({});

    const cancelA = await request(app)
      .post(`/api/v1/events/${a.eventId}/cancel`)
      .set('Cookie', adminA.cookie)
      .send({ reason: 'Guest count dropped sharply.' });
    expect(cancelA.status).toBe(200);

    const afterA = await prisma.materialRequest.findUnique({ where: { id: addAId } });
    expect(afterA?.status).toBe('CANCELLED_BY_EVENT');
    const itemsA = await prisma.materialRequestItem.findMany({ where: { requestId: addAId } });
    for (const item of itemsA) expect(item.status).toBe('CANCELLED_BY_EVENT');
    expect(
      await prisma.materialRequestTimeline.count({ where: { requestId: addAId, action: 'CANCELLED_BY_EVENT' } }),
    ).toBeGreaterThan(0);

    // Event B: additional ISSUED — must be left untouched by the cascade.
    const adminB = await createUserWithSession('ADMIN');
    const executorB = await createExecutorAssignedTo(adminB.user);
    const b = await buildEventWithInitial(adminB.cookie, executorB.cookie);
    const addB = await createAdditional(executorB.cookie, b.eventId, b.eventMaterialId, 10);
    createdRequestIds.push(addB.body.data.request.id as string);
    const addBId = addB.body.data.request.id as string;
    await request(app).post(`/api/v1/material-requests/${addBId}/approve`).set('Cookie', adminB.cookie).send({});
    const detailB = await request(app).get(`/api/v1/material-requests/${addBId}`).set('Cookie', adminB.cookie);
    const itemBId = detailB.body.data.request.items[0].id as string;
    const issuedB = await request(app)
      .post(`/api/v1/material-requests/${addBId}/issue`)
      .set('Cookie', adminB.cookie)
      .send({ items: [{ itemId: itemBId, quantity: 10 }] });
    expect(issuedB.status).toBe(200);

    const cancelB = await request(app)
      .post(`/api/v1/events/${b.eventId}/cancel`)
      .set('Cookie', adminB.cookie)
      .send({ reason: 'Venue unavailable.' });
    expect(cancelB.status).toBe(200);

    const afterB = await prisma.materialRequest.findUnique({ where: { id: addBId } });
    expect(afterB?.status).toBe('ISSUED'); // untouched — history is never rewritten
  });
});

describe('TC-ADD-010 — CANCELLED event blocks additional-request creation', () => {
  it('409 with the cancelled-event message; nothing persisted', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await buildEventWithInitial(admin.cookie, executor.cookie);

    const cancelled = await request(app)
      .post(`/api/v1/events/${eventId}/cancel`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Test cancellation.' });
    expect(cancelled.status).toBe(200);

    const created = await createAdditional(executor.cookie, eventId, eventMaterialId, 10);
    expect(created.status).toBe(409);
    expect(String(created.body.error?.message ?? '')).toMatch(/cancel/i);

    const rows = await prisma.materialRequest.count({ where: { eventId, requestType: 'ADDITIONAL' } });
    expect(rows).toBe(0);
  });
});

describe('TC-ADD-011 — empty list / zero quantity rejected', () => {
  it('400 on empty items, zero quantity, and missing reason; no rows', async () => {
    const admin = await createUserWithSession('ADMIN');
    const executor = await createExecutorAssignedTo(admin.user);
    const { eventId, eventMaterialId } = await buildEventWithInitial(admin.cookie, executor.cookie);
    const base = { eventId, eventMaterialId };

    const empty = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Empty probe', items: [] });
    expect(empty.status).toBe(400);

    const zero = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ reason: 'Zero probe', items: [{ eventMaterialId, requestedQuantity: 0 }] });
    expect(zero.status).toBe(400);

    const noReason = await request(app)
      .post(`/api/v1/events/${eventId}/material-requests`)
      .set('Cookie', executor.cookie)
      .send({ items: [{ eventMaterialId, requestedQuantity: 10 }] });
    expect(noReason.status).toBe(400);

    const rows = await prisma.materialRequest.count({
      where: { eventId, requestType: 'ADDITIONAL' },
    });
    expect(rows).toBe(0);
    void base;
  });
});

describe('TC-ADD-012 — executor of another admin denied', () => {
  it('403 for foreign-scope executor; nothing persisted', async () => {
    const adminA = await createUserWithSession('ADMIN');
    const adminB = await createUserWithSession('ADMIN');
    const executorX = await createExecutorAssignedTo(adminA.user);
    const executorY = await createExecutorAssignedTo(adminB.user);
    const { eventId, eventMaterialId } = await buildEventWithInitial(adminA.cookie, executorX.cookie);

    const created = await createAdditional(executorY.cookie, eventId, eventMaterialId, 10);
    expect(created.status).toBe(403);

    const rows = await prisma.materialRequest.count({ where: { eventId, requestType: 'ADDITIONAL' } });
    expect(rows).toBe(0);
  });
});
