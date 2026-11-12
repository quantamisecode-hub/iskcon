import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — SECURITY SUITE (TC-32 remaining / TC-33 IDOR / TC-34 validation /
 * TC-35 injection, API half).
 *
 * Method (TC-33): two admins + two executors, foreign ids everywhere; probes
 * assert 403/404 WITHOUT effect-leaks (stock, timeline, read-flags).
 *
 * Findings protocol: deviations from the ideal are RECORDED inline (this file
 * is the evidence) and mirrored into docs/test-cases + TC-44 ledger when they
 * are real bugs.
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

async function createTestUser(input: {
  role: 'ADMIN' | 'EXECUTOR';
  password: string;
}): Promise<User> {
  const user = await authService.createUserRecord({
    firstName: 'Sec',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `sec-${randomUUID()}@example.test`,
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

async function createUserWithSession(role: 'ADMIN' | 'EXECUTOR') {
  const password = `ValidPass${randomUUID()}-sec`;
  const user = await createTestUser({ role, password });
  const response = await login(user.email, password);
  return { user, cookie: extractCookie(response) ?? '' };
}

async function createExecutorAssignedTo(admin: User) {
  const created = await createUserWithSession('EXECUTOR');
  await prisma.adminExecutorAssignment.create({
    data: { adminId: admin.id, executorId: created.user.id },
  });
  return created;
}

async function createFoodItemWithStock(stock: number): Promise<{ foodItemId: string; unitId: string }> {
  const category = await prisma.category.create({ data: { name: `SecCat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({
    data: {
      name: `SecUnit-${randomUUID()}`,
      symbol: `S${randomUUID().slice(0, 5).toUpperCase()}`,
      unitType: 'WEIGHT',
    },
  });
  createdUnitIds.push(unit.id);
  const food = await prisma.foodItem.create({
    data: {
      name: `SecDal-${randomUUID().slice(0, 8)}`,
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

async function getStock(foodItemId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { foodItemId } });
  return row?.currentQuantity ?? -1;
}

/** Full lifecycle fixture for admin A: event + planned line + submitted request + issued material. */
async function buildIssuedMaterial(adminCookie: string, executorCookie: string) {
  const { foodItemId, unitId } = await createFoodItemWithStock(100);

  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `SecDish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Sec Event ${randomUUID().slice(0, 8)}`,
      eventDate: '2026-12-25',
      startTime: '10:00',
      numberOfPeople: 50,
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
    .send({ foodItemId, plannedQuantity: 40, unitId });
  expect(addMaterial.status).toBe(201);
  const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminCookie);
  const eventMaterialId = detail.body.data.dishes
    .flatMap((d: { materials: { id: string }[] }) => d.materials)
    .at(-1).id as string;

  const created = await request(app)
    .post('/api/v1/material-requests')
    .set('Cookie', executorCookie)
    .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 40 }] });
  expect(created.status).toBe(201);
  const requestId = created.body.data.request.id as string;
  createdRequestIds.push(requestId);
  await request(app).post(`/api/v1/material-requests/${requestId}/submit`).set('Cookie', executorCookie);

  const approved = await request(app)
    .post(`/api/v1/material-requests/${requestId}/approve`)
    .set('Cookie', adminCookie)
    .send({});
  expect(approved.status).toBe(200);
  const itemId = approved.body.data.request.items[0].id as string;

  const issued = await request(app)
    .post(`/api/v1/material-requests/${requestId}/issue`)
    .set('Cookie', adminCookie)
    .send({ items: [{ itemId, quantity: 40 }] });
  expect(issued.status).toBe(200);

  return { eventId, requestId, itemId, foodItemId };
}

afterAll(async () => {
  await withDeadlockRetry(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.notification.deleteMany({ where: { referenceId: { in: [...createdRequestIds, ...createdEventIds] } } });
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
// TC-33 — IDOR / object-level authorization
// ---------------------------------------------------------------------------

describe('TC-IDOR-001 — foreign event detail + mutation', () => {
  it('other-scope admin and foreign executor get 403 with no data leak', async () => {
    const adminA = await createUserWithSession('ADMIN');
    const adminB = await createUserWithSession('ADMIN');
    const executorY = await createExecutorAssignedTo(adminB.user);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', adminA.cookie)
      .send({
        name: `A-Secret-Event-${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-25',
        startTime: '09:00',
        numberOfPeople: 10,
      });
    expect(event.status).toBe(201);
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    for (const actor of [adminB.cookie, executorY.cookie]) {
      const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', actor);
      expect(detail.status).toBe(403);
      const body = JSON.stringify(detail.body);
      expect(body).not.toContain('A-Secret-Event'); // no name/status/reason leak

      const mutated = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set('Cookie', actor)
        .send({ name: 'Hijacked' });
      expect(mutated.status).toBe(403);
    }

    // No effect leak: name unchanged in DB.
    const stored = await prisma.event.findUnique({ where: { id: eventId } });
    expect(stored?.name).toContain('A-Secret-Event');
  });
});

describe('TC-IDOR-002 — foreign admin cannot approve/reject/issue; zero rows written', () => {
  it('admin B and executor Y are refused on admin A\'s pending request', async () => {
    const adminA = await createUserWithSession('ADMIN');
    const adminB = await createUserWithSession('ADMIN');
    const executorX = await createExecutorAssignedTo(adminA.user);
    const executorY = await createExecutorAssignedTo(adminB.user);

    const { eventId, requestId, foodItemId } = await buildIssuedMaterialPending(adminA.cookie, executorX.cookie);

    const timelineBefore = await prisma.materialRequestTimeline.count({ where: { requestId } });
    const itemBefore = await prisma.materialRequestItem.findFirst({ where: { requestId } });

    for (const [actor, label] of [
      [adminB.cookie, 'foreign admin'],
      [executorY.cookie, 'foreign executor'],
    ] as const) {
      const approve = await request(app)
        .post(`/api/v1/material-requests/${requestId}/approve`)
        .set('Cookie', actor)
        .send({});
      expect(approve.status, label).toBe(403);

      const reject = await request(app)
        .post(`/api/v1/material-requests/${requestId}/reject`)
        .set('Cookie', actor)
        .send({ reason: 'IDOR probe' });
      expect(reject.status, label).toBe(403);

      const issue = await request(app)
        .post(`/api/v1/material-requests/${requestId}/issue`)
        .set('Cookie', actor)
        .send({ items: [{ itemId: itemBefore?.id, quantity: 1 }] });
      expect(issue.status, label).toBe(403);
    }

    // Zero rows written by denied calls.
    const timelineAfter = await prisma.materialRequestTimeline.count({ where: { requestId } });
    expect(timelineAfter).toBe(timelineBefore);
    const itemAfter = await prisma.materialRequestItem.findFirst({ where: { requestId } });
    expect(Number(itemAfter?.approvedQuantity)).toBe(Number(itemBefore?.approvedQuantity));
    expect(await getStock(foodItemId)).toBe(100);
    void eventId;
  });
});

/** Pending (not yet approved) variant — separate helper to keep TC-IDOR-003 independent. */
async function buildIssuedMaterialPending(adminCookie: string, executorCookie: string) {
  return buildLifecycle(adminCookie, executorCookie, { approve: false, issue: false });
}

async function buildLifecycle(
  adminCookie: string,
  executorCookie: string,
  opts: { approve: boolean; issue: boolean },
) {
  const { foodItemId, unitId } = await createFoodItemWithStock(100);
  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `SecDish-${randomUUID().slice(0, 8)}` });
  createdDishIds.push(dish.body.data.id);
  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Sec Event ${randomUUID().slice(0, 8)}`,
      eventDate: '2026-12-25',
      startTime: '10:00',
      numberOfPeople: 50,
    });
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
    .send({ foodItemId, plannedQuantity: 40, unitId });
  expect(addMaterial.status).toBe(201);
  const detail = await request(app).get(`/api/v1/events/${eventId}`).set('Cookie', adminCookie);
  const eventMaterialId = detail.body.data.dishes
    .flatMap((d: { materials: { id: string }[] }) => d.materials)
    .at(-1).id as string;

  const created = await request(app)
    .post('/api/v1/material-requests')
    .set('Cookie', executorCookie)
    .send({ eventId, items: [{ eventMaterialId, requestedQuantity: 40 }] });
  const requestId = created.body.data.request.id as string;
  createdRequestIds.push(requestId);
  await request(app).post(`/api/v1/material-requests/${requestId}/submit`).set('Cookie', executorCookie);

  let itemId: string | undefined;
  if (opts.approve) {
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', adminCookie)
      .send({});
    itemId = approved.body.data.request.items[0].id as string;
    if (opts.issue) {
      const issued = await request(app)
        .post(`/api/v1/material-requests/${requestId}/issue`)
        .set('Cookie', adminCookie)
        .send({ items: [{ itemId, quantity: 40 }] });
      expect(issued.status).toBe(200);
    }
  }
  return { eventId, requestId, itemId, foodItemId };
}

// Re-run the IDOR-002 scenario using the shared builder (the first describe
// used buildIssuedMaterialPending, which is buildLifecycle(false,false)).
// buildIssuedMaterial above remains for the fully-issued fixtures (returns).

describe('TC-IDOR-003 — foreign return accept/reject/detail; stock never moves', () => {
  it('admin B is refused everywhere on admin A\'s pending return', async () => {
    const adminA = await createUserWithSession('ADMIN');
    const adminB = await createUserWithSession('ADMIN');
    const executorX = await createExecutorAssignedTo(adminA.user);
    const executorY = await createExecutorAssignedTo(adminB.user);

    const { eventId, foodItemId } = await buildIssuedMaterial(adminA.cookie, executorX.cookie);
    expect(await getStock(foodItemId)).toBe(60); // issued 40 of 100

    const returnCreated = await request(app)
      .post(`/api/v1/events/${eventId}/returns`)
      .set('Cookie', executorX.cookie)
      .send({ items: [{ foodItemId, quantity: 15 }] });
    expect(returnCreated.status).toBe(201);
    const returnId = returnCreated.body.data.return.id as string;

    for (const actor of [adminB.cookie, executorY.cookie]) {
      const detail = await request(app).get(`/api/v1/returns/${returnId}`).set('Cookie', actor);
      expect(detail.status).toBe(403);

      const accept = await request(app)
        .post(`/api/v1/returns/${returnId}/accept`)
        .set('Cookie', actor)
        .send({});
      expect(accept.status).toBe(403);

      const reject = await request(app)
        .post(`/api/v1/returns/${returnId}/reject`)
        .set('Cookie', actor)
        .send({ reason: 'IDOR probe' });
      expect(reject.status).toBe(403);
    }

    // Stock never moved; return still pending for the real admin.
    expect(await getStock(foodItemId)).toBe(60);
    const ledger = await prisma.inventoryTransaction.count({
      where: { foodItemId, transactionType: 'RETURN' },
    });
    expect(ledger).toBe(0);
    const stored = await prisma.materialReturn.findUnique({ where: { id: returnId } });
    expect(stored?.status).toBe('PENDING_ADMIN_REVIEW');
  });
});

describe('TC-IDOR-004 — foreign notification read/mark; list shows own only', () => {
  it('executor Y cannot see or mark admin A\'s submission notification', async () => {
    const adminA = await createUserWithSession('ADMIN');
    const adminB = await createUserWithSession('ADMIN');
    const executorX = await createExecutorAssignedTo(adminA.user);
    const executorY = await createExecutorAssignedTo(adminB.user);

    const { requestId } = await buildIssuedMaterialPending(adminA.cookie, executorX.cookie);

    const notification = await prisma.notification.findFirst({
      where: { referenceId: requestId, userId: adminA.user.id },
    });
    expect(notification).not.toBeNull();

    // Foreign users' lists never contain it.
    const listB = await request(app).get('/api/v1/notifications').set('Cookie', adminB.cookie);
    const listY = await request(app).get('/api/v1/notifications').set('Cookie', executorY.cookie);
    expect(JSON.stringify(listB.body.data)).not.toContain(notification!.id);
    expect(JSON.stringify(listY.body.data)).not.toContain(notification!.id);

    // Foreign mark-read → not marked (404; updateMany scoped by userId).
    const foreignMark = await request(app)
      .patch(`/api/v1/notifications/${notification!.id}/read`)
      .set('Cookie', adminB.cookie);
    expect([403, 404]).toContain(foreignMark.status);

    const still = await prisma.notification.findUnique({ where: { id: notification!.id } });
    expect(still?.isRead).toBe(false);

    // Owner marks it → 200 + DB flag flips.
    const ownMark = await request(app)
      .patch(`/api/v1/notifications/${notification!.id}/read`)
      .set('Cookie', adminA.cookie);
    expect(ownMark.status).toBe(200);
    const marked = await prisma.notification.findUnique({ where: { id: notification!.id } });
    expect(marked?.isRead).toBe(true);
  });
});

describe('TC-IDOR-005 — executor blocked from user management (route-level)', () => {
  it('403 on foreign user detail and status change', async () => {
    const adminB = await createUserWithSession('ADMIN');
    const executorX = await createUserWithSession('EXECUTOR');

    const detail = await request(app).get(`/api/v1/users/${adminB.user.id}`).set('Cookie', executorX.cookie);
    expect(detail.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/users/${adminB.user.id}/status`)
      .set('Cookie', executorX.cookie)
      .send({ status: 'INACTIVE' });
    expect(patch.status).toBe(403);

    const reset = await request(app)
      .post(`/api/v1/users/${adminB.user.id}/reset-password`)
      .set('Cookie', executorX.cookie)
      .send({ newPassword: 'ValidPass123!' });
    expect(reset.status).toBe(403);

    const stored = await prisma.user.findUnique({ where: { id: adminB.user.id } });
    expect(stored?.isActive).toBe(true);
  });
});

describe('TC-IDOR-006 — identity spoofing via body params is rejected', () => {
  it('create-request body with injected identity fields → 400 (strict schema), nothing persisted', async () => {
    const adminA = await createUserWithSession('ADMIN');
    const adminB = await createUserWithSession('ADMIN');
    const executorX = await createExecutorAssignedTo(adminA.user);

    // Fresh event so the "nothing persisted" check is meaningful.
    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', adminA.cookie)
      .send({
        name: `SpoofEvent-${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-25',
        startTime: '10:00',
        numberOfPeople: 10,
      });
    expect(event.status).toBe(201);
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    const probe = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executorX.cookie)
      .send({
        eventId,
        items: [{ eventMaterialId: randomUUID(), requestedQuantity: 1 }],
        requestedById: adminB.user.id,
        adminId: adminB.user.id,
        userId: adminB.user.id,
      });
    // Strict schema rejects the injected identity fields outright.
    expect(probe.status).toBe(400);
    expect(probe.body.error.code).toBe('VALIDATION_ERROR');

    // No request row was created by the rejected call.
    const count = await prisma.materialRequest.count({ where: { eventId } });
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-32 — CORS grant / mass assignment / method abuse
// ---------------------------------------------------------------------------

describe('TC-SEC-003 — CORS allowlist', () => {
  const LEGIT = 'http://localhost:5173';

  it('disallowed origin gets NO CORS grant; legit origin gets origin+credentials', async () => {
    const evil = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(evil.status).toBe(200); // server answers; the BROWSER would block
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const legit = await request(app)
      .get('/api/v1/health')
      .set('Origin', LEGIT);
    expect(legit.headers['access-control-allow-origin']).toBe(LEGIT);

    // Preflight with evil origin → no grant, no method echo.
    const preflight = await request(app)
      .options('/api/v1/material-requests')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();

    const preflightLegit = await request(app)
      .options('/api/v1/material-requests')
      .set('Origin', LEGIT)
      .set('Access-Control-Request-Method', 'POST');
    expect(preflightLegit.headers['access-control-allow-origin']).toBe(LEGIT);
    expect(preflightLegit.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('TC-SEC-008 — mass assignment via JSON bodies', () => {
  it('strict routers (dishes/events/requests) reject unknown fields with 400', async () => {
    const admin = await createUserWithSession('ADMIN');

    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `MasDish-${randomUUID().slice(0, 6)}`, role: 'ADMIN', passwordHash: 'x' });
    expect(dish.status).toBe(400);
    expect(dish.body.error.code).toBe('VALIDATION_ERROR');

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({
        name: `MasEvent-${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-25',
        startTime: '10:00',
        numberOfPeople: 10,
        adminId: admin.user.id,
      });
    expect(event.status).toBe(400);
    expect(event.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('inline routers (categories/units/food-items) IGNORE extra fields — no effect leak', async () => {
    const admin = await createUserWithSession('ADMIN');

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Cookie', admin.cookie)
      .send({ name: `MasCat-${randomUUID().slice(0, 6)}`, role: 'ADMIN', isActive: 'banana' });
    expect([200, 201]).toContain(category.status);
    createdCategoryIds.push(category.body.data.id);
    // Injected fields not persisted; isActive not corrupted by the string.
    expect(category.body.data.role).toBeUndefined();
    expect(typeof category.body.data.isActive).toBe('boolean');

    const unit = await request(app)
      .post('/api/v1/units')
      .set('Cookie', admin.cookie)
      .send({
        name: `MasUnit-${randomUUID().slice(0, 6)}`,
        symbol: `M${randomUUID().slice(0, 4).toUpperCase()}`,
        unitType: 'WEIGHT',
        role: 'ADMIN',
      });
    expect([200, 201]).toContain(unit.status);
    createdUnitIds.push(unit.body.data.id);
    expect(unit.body.data.role).toBeUndefined();
    // BUG-VAL-001 regression lock: a unit created WITHOUT an explicit isActive
    // flag is born ACTIVE (was false before the fix — every UI-created unit
    // was unusable for food items).
    expect(unit.body.data.isActive).toBe(true);

    // Food item create uses categoryName/unitSymbol; an injected `stock` field
    // must NOT seed inventory (whitelisted inputs only).
    const category2 = await request(app)
      .post('/api/v1/categories')
      .set('Cookie', admin.cookie)
      .send({ name: `MasCat2-${randomUUID().slice(0, 6)}` });
    createdCategoryIds.push(category2.body.data.id);
    const unit2 = await request(app)
      .post('/api/v1/units')
      .set('Cookie', admin.cookie)
      .send({
        name: `MasUnit2-${randomUUID().slice(0, 6)}`,
        symbol: `N${randomUUID().slice(0, 4).toUpperCase()}`,
        unitType: 'WEIGHT',
      });
    createdUnitIds.push(unit2.body.data.id);
    const food = await request(app)
      .post('/api/v1/food-items')
      .set('Cookie', admin.cookie)
      .send({
        name: `MasFood-${randomUUID().slice(0, 6)}`,
        categoryName: category2.body.data.name,
        unitSymbol: unit2.body.data.symbol,
        minimumStock: 5,
        reorderLevel: 10,
        stock: 999, // injected
      });
    expect([200, 201]).toContain(food.status);
    createdFoodItemIds.push(food.body.data.id);
    const inventory = await prisma.inventory.findUnique({ where: { foodItemId: food.body.data.id } });
    // No inventory row seeded from the injected field (default creation path).
    expect(inventory?.currentQuantity ?? 0).not.toBe(999);
  });
});

describe('TC-SEC-007 — method abuse on read-only routes', () => {
  it('DELETE is refused on delete-less routes; events delete is a real guarded route (recorded)', async () => {
    const admin = await createUserWithSession('ADMIN');

    // Routes with NO delete handler → clean 404 (no route confusion).
    for (const path of ['/dashboard/summary', '/health', '/ledger']) {
      const deleted = await request(app).delete(`/api/v1${path}`).set('Cookie', admin.cookie);
      expect([404, 405], `DELETE ${path}`).toContain(deleted.status);
    }

    // RECORDED: DELETE /events/:id exists for editable (non-terminal) events
    // under event scope (service refuses terminal events with 409). Probed on
    // a completed event to prove history is protected.
    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({
        name: `MethodEvent-${randomUUID().slice(0, 6)}`,
        eventDate: '2026-12-25',
        startTime: '10:00',
        numberOfPeople: 10,
      });
    const eventId = event.body.data.id as string;
    createdEventIds.push(eventId);

    const terminal = await request(app)
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'PLANNING' });
    expect(terminal.status).toBe(200);
    const ready = await request(app)
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'READY' });
    expect(ready.status).toBe(200);
    const completed = await request(app)
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);

    const deleted = await request(app).delete(`/api/v1/events/${eventId}`).set('Cookie', admin.cookie);
    expect(deleted.status).toBe(409); // terminal events cannot be deleted — history
    const still = await prisma.event.findUnique({ where: { id: eventId } });
    expect(still).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-34 — input validation sweep (type confusion, boundaries, uuid params)
// ---------------------------------------------------------------------------

describe('TC-VAL-002/004 — stock operations fail closed on bad quantities', () => {
  it('string/negative/zero/huge quantities are refused or DB-safe, stock never corrupt', async () => {
    const admin = await createUserWithSession('ADMIN');
    const { foodItemId } = await createFoodItemWithStock(50);

    for (const [quantity, acceptable] of [
      ['100', [400]],
      [-5, [400]],
      [0, [400]],
      [1e308, [400, 500]], // huge finite: recorded if 500 (generic message)
    ] as const) {
      const response = await request(app)
        .post(`/api/v1/food-items/${foodItemId}/stock-in`)
        .set('Cookie', admin.cookie)
        .send({ quantity });
      expect(acceptable).toContain(response.status);
      // Leak check regardless of path.
      expect(JSON.stringify(response.body)).not.toMatch(/prisma|node_modules|D:\\/i);
      expect(await getStock(foodItemId)).toBe(50); // nothing moved
    }
  });
});

describe('TC-VAL-005 — uuid params validated (no injection via :id)', () => {
  it('injection strings in :id are 400 on validated routers and harmless on manual ones', async () => {
    const admin = await createUserWithSession('ADMIN');

    // Validated routers → clean 400 VALIDATION_ERROR.
    const probes: Array<['get' | 'patch', string]> = [
      ['get', `/events/${"' OR 1=1--"}`],
      ['get', '/events/<script>'],
      ['patch', '/users/abc/status'],
      ['get', '/material-requests/%2E%2E%2Fauth%2Fme'],
    ];
    for (const [method, path] of probes) {
      const response = await request(app)[method](`/api/v1${path.replace(/^\/api\/v1/, '')}`)
        .set('Cookie', admin.cookie)
        .send({});
      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }

    // Manually-validated routers (category GET/:id): no Prisma-internals leak
    // whatever the status (recorded; clean 4xx would be nicer — see findings).
    const manual = await request(app)
      .get(`/api/v1/categories/${"' OR 1=1--"}`)
      .set('Cookie', admin.cookie);
    expect(JSON.stringify(manual.body)).not.toMatch(/prisma|node_modules|D:\\|Invalid `/i);
  });
});

describe('TC-VAL-006 — list query params validated/clamped', () => {
  it('bad enum/page values never 500 and never leak', async () => {
    const admin = await createUserWithSession('ADMIN');
    const bad = await request(app)
      .get('/api/v1/material-requests?status=HACKED&page=-5&pageSize=99999')
      .set('Cookie', admin.cookie);
    expect([200, 400]).toContain(bad.status); // clamped or rejected, never 500
    expect(bad.status === 200 ? true : bad.body.error.code).toBeDefined();

    const food = await request(app)
      .get("/api/v1/food-items?search='; DROP TABLE `FoodItem`;--")
      .set('Cookie', admin.cookie);
    expect(food.status).toBe(200);
    // Table intact — the DROP TABLE probe had no effect.
    const count = await prisma.foodItem.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TC-35 — XSS / SQLi payloads (API half; UI rendering is React-escaped by
// default and the codebase has zero dangerous sinks — grep evidence recorded
// in the docs).
// ---------------------------------------------------------------------------

describe('TC-XSS-001/004 — stored payloads stay inert data; SQL probes harmless', () => {
  it('script/SQLi names are stored verbatim as JSON, DB intact', async () => {
    const admin = await createUserWithSession('ADMIN');

    const payloads = [
      `<script>alert(1)</script>`,
      `"><svg onload=alert(1)>`,
      `'; DROP TABLE \`Category\`;--`,
      `')) OR ('1'='1`,
    ];
    for (const payload of payloads) {
      // Re-run safety: drop stale rows from a previous crashed attempt.
      await prisma.category.deleteMany({ where: { name: payload } });
      const created = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', admin.cookie)
        .send({ name: payload });
      expect([200, 201]).toContain(created.status);
      const id = created.body.data.id;
      createdCategoryIds.push(id);

      // Round-trip: verbatim JSON text, correct content type.
      expect(created.headers['content-type']).toMatch(/application\/json/i);
      expect(created.body.data.name).toBe(payload);

      const fetched = await request(app).get(`/api/v1/categories/${id}`).set('Cookie', admin.cookie);
      expect(fetched.body.data.name).toBe(payload);
    }

    // Dish (validated router) accepts payload text in the name field.
    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `<img src=x onerror=alert(1)>-${randomUUID().slice(0, 4)}` });
    expect(dish.status).toBe(201);
    createdDishIds.push(dish.body.data.id);
    expect(dish.body.data.name).toContain('<img src=x');

    // DB unharmed by any DROP TABLE/SQLi attempt.
    const categories = await prisma.category.count();
    expect(categories).toBeGreaterThan(0);
    const foodItems = await prisma.foodItem.count();
    expect(foodItems).toBeGreaterThan(0);
  });
});
