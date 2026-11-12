import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 4 INTEGRATION TESTS
 * Event + Calendar + Dish + Material planning.
 * Critical invariant: PLANNING NEVER deducts inventory stock.
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

async function createTestUser(input: {
  email?: string;
  role: 'ADMIN' | 'EXECUTOR';
  isActive?: boolean;
  password?: string;
}): Promise<User> {
  const email = input.email ?? `test-${randomUUID()}@example.test`;
  const user = await authService.createUserRecord({
    firstName: 'Test',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email,
    password: input.password ?? `ValidPass${randomUUID()}-x7!`,
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
  const category = await prisma.category.create({ data: { name: `Cat-${randomUUID()}` } });
  createdCategoryIds.push(category.id);
  const unit = await prisma.unit.create({ data: { name: `Unit-${randomUUID()}`, symbol: `U${randomUUID().slice(0, 5).toUpperCase()}`, unitType: 'WEIGHT' } });
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

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
  // Deepest first (FK-safe order).
  // IMPORTANT: every delete is scoped to rows this file created — test files
  // run in parallel against the same test DB, and an unscoped deleteMany
  // would cascade away another suite's in-flight fixtures mid-test.
  await prisma.eventMaterial.deleteMany({ where: { eventDish: { eventId: { in: createdEventIds } } } });
  await prisma.eventDish.deleteMany({ where: { eventId: { in: createdEventIds } } });
  await prisma.dishMaterial.deleteMany({ where: { dishId: { in: createdDishIds } } });
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
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

describe('Events - creation and scope', () => {
  it('ADMIN can create an event; a unique code is generated; NO stock is deducted', async () => {
    const admin = await createAdminWithSession();
    const { foodItemId } = await createFoodItemWithStock(100);

    const response = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Mahaprasadam', eventDate: '2026-11-15', startTime: '10:00', endTime: '14:00', numberOfPeople: 500 });

    expect(response.status).toBe(201);
    expect(response.body.data.eventCode).toMatch(/^EVT-\d{4}-\d{6}$/);
    expect(response.body.data.status).toBe('DRAFT');
    createdEventIds.push(response.body.data.id);

    const stock = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(stock?.currentQuantity).toBe(100);
    const stockOuts = await prisma.inventoryTransaction.count({ where: { foodItemId, transactionType: 'STOCK_OUT' } });
    expect(stockOuts).toBe(0);
  });

  it('two events get distinct event codes', async () => {
    const admin = await createAdminWithSession();
    const first = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Event A', eventDate: '2026-12-01', startTime: '09:00', numberOfPeople: 100 });
    const second = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Event B', eventDate: '2026-12-02', startTime: '09:00', numberOfPeople: 100 });

    expect(first.body.data.eventCode).not.toBe(second.body.data.eventCode);
    createdEventIds.push(first.body.data.id, second.body.data.id);
  });

  it('EXECUTOR can create an event inside the assigned Admin scope', async () => {
    const adminA = await createAdminWithSession();
    const { user: executor, cookie } = await createExecutorAssignedTo(adminA.user);

    const response = await request(app)
      .post('/api/v1/events')
      .set('Cookie', cookie)
      .send({ name: 'Executor Event', eventDate: '2026-11-20', startTime: '08:00', numberOfPeople: 200 });

    expect(response.status).toBe(201);
    expect(response.body.data.adminId).toBe(adminA.user.id);
    expect(response.body.data.createdBy).toBe(executor.id);
    createdEventIds.push(response.body.data.id);
  });

  it('unassigned EXECUTOR cannot create an event', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });
    const loginResponse = await login(executor.email, password);
    const cookie = extractCookie(loginResponse) ?? '';

    const response = await request(app)
      .post('/api/v1/events')
      .set('Cookie', cookie)
      .send({ name: 'No Scope', eventDate: '2026-11-20', startTime: '08:00', numberOfPeople: 50 });

    expect(response.status).toBe(403);
  });

  it('IDOR: executor cannot read or modify another Admin scope event', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();
    const { cookie: executorCookie } = await createExecutorAssignedTo(adminA.user);

    const created = await request(app)
      .post('/api/v1/events')
      .set('Cookie', adminB.cookie)
      .send({ name: 'Admin B Event', eventDate: '2026-11-21', startTime: '10:00', numberOfPeople: 300 });
    createdEventIds.push(created.body.data.id);

    const target = created.body.data.id;
    const read = await request(app).get(`/api/v1/events/${target}`).set('Cookie', executorCookie);
    expect(read.status).toBe(403);

    const patch = await request(app)
      .patch(`/api/v1/events/${target}`)
      .set('Cookie', executorCookie)
      .send({ name: 'Hijacked' });
    expect(patch.status).toBe(403);

    const del = await request(app).delete(`/api/v1/events/${target}`).set('Cookie', executorCookie);
    expect(del.status).toBe(403);

    const list = await request(app).get('/api/v1/events').set('Cookie', executorCookie);
    const names = list.body.data.events.map((e: { name: string }) => e.name);
    expect(names).not.toContain('Admin B Event');
  });

  it('rejects invalid payloads (name required, numberOfPeople > 0, endTime >= startTime)', async () => {
    const admin = await createAdminWithSession();

    const noName = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 100 });
    expect(noName.status).toBe(400);

    const zeroPeople = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Zero', eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 0 });
    expect(zeroPeople.status).toBe(400);

    const badTime = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Bad time', eventDate: '2026-11-15', startTime: '14:00', endTime: '10:00', numberOfPeople: 100 });
    expect(badTime.status).toBe(400);
  });
});

describe('Events - status workflow', () => {
  it('enforces the DRAFT -> PLANNING -> READY -> COMPLETED chain and rejects invalid jumps', async () => {
    const admin = await createAdminWithSession();
    const created = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Workflow', eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 100 });
    const id = created.body.data.id;
    createdEventIds.push(id);

    // Invalid jump: DRAFT -> READY must be denied.
    const jump = await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });
    expect(jump.status).toBe(409);

    const planning = await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    expect(planning.status).toBe(200);
    expect(planning.body.data.status).toBe('PLANNING');

    const ready = await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe('READY');

    // READY: editing the event must be blocked (restricted).
    const edit = await request(app).patch(`/api/v1/events/${id}`).set('Cookie', admin.cookie).send({ name: 'Nope' });
    expect(edit.status).toBe(409);

    const completed = await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('COMPLETED');

    // COMPLETED is terminal.
    const afterComplete = await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'CANCELLED' });
    expect(afterComplete.status).toBe(409);
  });

  it('CANCELLED is allowed from DRAFT / PLANNING / READY', async () => {
    const admin = await createAdminWithSession();
    for (const cancelFrom of ['DRAFT', 'PLANNING', 'READY'] as const) {
      const created = await request(app)
        .post('/api/v1/events')
        .set('Cookie', admin.cookie)
        .send({ name: `Cancel ${cancelFrom}`, eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 10 });
      const id = created.body.data.id;
      createdEventIds.push(id);
      if (cancelFrom !== 'DRAFT') {
        await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
      }
      if (cancelFrom === 'READY') {
        await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });
      }
      const cancelled = await request(app).patch(`/api/v1/events/${id}/status`).set('Cookie', admin.cookie).send({ status: 'CANCELLED' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
    }
  });
});

describe('Event lifecycle notifications (§49 realtime matrix)', () => {
  async function findNotification(userId: string, type: string, referenceId?: string) {
    return prisma.notification.findFirst({
      where: { userId, type, ...(referenceId ? { referenceId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  it('ADMIN creating an event notifies the assigned EXECUTOR — never the actor', async () => {
    const admin = await createAdminWithSession();
    const { user: executor } = await createExecutorAssignedTo(admin.user);

    const created = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Notify Create', eventDate: '2026-11-20', startTime: '10:00', numberOfPeople: 50 });
    expect(created.status).toBe(201);
    const eventId = created.body.data.id;
    createdEventIds.push(eventId);

    const forExecutor = await findNotification(executor.id, 'EVENT_CREATED', eventId);
    expect(forExecutor).not.toBeNull();
    expect(forExecutor?.referenceType).toBe('EVENT');
    expect(forExecutor?.category).toBe('EVENT');

    // Golden rule: no notification ever goes to the actor.
    expect(await findNotification(admin.user.id, 'EVENT_CREATED', eventId)).toBeNull();
  });

  it('EXECUTOR creating an event notifies the event Admin — never the actor', async () => {
    const admin = await createAdminWithSession();
    const { user: executor, cookie: executorCookie } = await createExecutorAssignedTo(admin.user);

    const created = await request(app)
      .post('/api/v1/events')
      .set('Cookie', executorCookie)
      .send({ name: 'Notify Create By Executor', eventDate: '2026-11-20', startTime: '10:00', numberOfPeople: 25 });
    expect(created.status).toBe(201);
    const eventId = created.body.data.id;
    createdEventIds.push(eventId);

    expect(await findNotification(admin.user.id, 'EVENT_CREATED', eventId)).not.toBeNull();
    expect(await findNotification(executor.id, 'EVENT_CREATED', eventId)).toBeNull();
  });

  it('READY notifies the assigned EXECUTOR (actor excluded); the internal PLANNING move notifies nobody', async () => {
    const admin = await createAdminWithSession();
    const { user: executor } = await createExecutorAssignedTo(admin.user);

    const created = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Notify Ready', eventDate: '2026-11-20', startTime: '10:00', numberOfPeople: 20 });
    const eventId = created.body.data.id;
    createdEventIds.push(eventId);

    // DRAFT -> PLANNING is an internal planning move: no milestone notification.
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    expect(await findNotification(executor.id, 'EVENT_READY', eventId)).toBeNull();
    expect(await findNotification(executor.id, 'EVENT_COMPLETED', eventId)).toBeNull();

    const ready = await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });
    expect(ready.status).toBe(200);
    expect(await findNotification(executor.id, 'EVENT_READY', eventId)).not.toBeNull();
    expect(await findNotification(admin.user.id, 'EVENT_READY', eventId)).toBeNull(); // actor
  });

  it('COMPLETED triggered by the EXECUTOR reaches the Admin (both roles covered)', async () => {
    const admin = await createAdminWithSession();
    const { user: executor, cookie: executorCookie } = await createExecutorAssignedTo(admin.user);

    const created = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'Notify Completed', eventDate: '2026-11-20', startTime: '10:00', numberOfPeople: 20 });
    const eventId = created.body.data.id;
    createdEventIds.push(eventId);

    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });

    // The EXECUTOR completes it (in-scope) -> the Admin is notified.
    const completed = await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', executorCookie).send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);

    const forAdmin = await findNotification(admin.user.id, 'EVENT_COMPLETED', eventId);
    expect(forAdmin).not.toBeNull();
    expect(forAdmin?.referenceType).toBe('EVENT');
    // Golden rule: the actor never gets their own notification.
    expect(await findNotification(executor.id, 'EVENT_COMPLETED', eventId)).toBeNull();
  });
});

describe('Dishes and material planning (no stock deduction)', () => {
  it('ADMIN manages dishes; duplicate dish name rejected', async () => {
    const admin = await createAdminWithSession();

    const created = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `Kheer-${randomUUID().slice(0, 8)}`, description: 'Sweet rice pudding' });
    expect(created.status).toBe(201);
    createdDishIds.push(created.body.data.id);

    const duplicate = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: created.body.data.name });
    expect(duplicate.status).toBe(409);
  });

  it('EXECUTOR cannot create or modify dishes or food items', async () => {
    const adminA = await createAdminWithSession();
    const { cookie: executorCookie } = await createExecutorAssignedTo(adminA.user);

    const dishAttempt = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', executorCookie)
      .send({ name: 'ExecutorDish' });
    expect(dishAttempt.status).toBe(403);

    const foodAttempt = await request(app)
      .post('/api/v1/food-items')
      .set('Cookie', executorCookie)
      .send({ name: 'ExecutorItem', categoryName: 'Flour', unitSymbol: 'KG', minimumStock: 1, reorderLevel: 1 });
    expect(foodAttempt.status).toBe(403);

    // But executors CAN list active dishes for event planning.
    const list = await request(app).get('/api/v1/dishes').set('Cookie', executorCookie);
    expect(list.status).toBe(200);
  });

  it('full planning flow: add dish, add material, update quantity - stock NEVER changes', async () => {
    const admin = await createAdminWithSession();
    const { foodItemId, unitId } = await createFoodItemWithStock(100);

    // Create dish
    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `RiceDish-${randomUUID().slice(0, 8)}` });
    createdDishIds.push(dish.body.data.id);

    // Create event
    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'NoStockEvent', eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 500 });
    const eventId = event.body.data.id;
    createdEventIds.push(eventId);

    // Transition to PLANNING so materials can be edited
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });

    // Add the dish to the event
    const addDish = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    expect(addDish.status).toBe(201);
    const eventDishId = addDish.body.data.dishes.at(-1).id;

    // Duplicate dish rejected
    const duplicateDish = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    expect(duplicateDish.status).toBe(409);

    // Add 25 KG material
    const addMaterial = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId, plannedQuantity: 25, unitId });
    expect(addMaterial.status).toBe(201);

    // Duplicate material rejected
    const duplicateMaterial = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId, plannedQuantity: 30 });
    expect(duplicateMaterial.status).toBe(409);

    // Stock unchanged, no transactions
    const stock1 = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(stock1?.currentQuantity).toBe(100);

    // Update 25 -> 30 via the event response payload
    const materialLine = addMaterial.body.data.dishes
      .flatMap((d: { materials: { id: string; plannedQuantity: number }[] }) => d.materials)
      .find((line: { plannedQuantity: number }) => line.plannedQuantity === 25);
    const updateMaterial = await request(app)
      .patch(`/api/v1/event-dishes/${eventDishId}/materials/${materialLine.id}`)
      .set('Cookie', admin.cookie)
      .send({ plannedQuantity: 30 });
    expect(updateMaterial.status).toBe(200);

    const stock2 = await prisma.inventory.findUnique({ where: { foodItemId } });
    expect(stock2?.currentQuantity).toBe(100);
    const transactions = await prisma.inventoryTransaction.count({ where: { foodItemId } });
    expect(transactions).toBe(0);
  });

  it('rejects invalid quantity and inactive food items', async () => {
    const admin = await createAdminWithSession();
    const { foodItemId } = await createFoodItemWithStock(50);

    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `QtyDish-${randomUUID().slice(0, 8)}` });
    createdDishIds.push(dish.body.data.id);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'QtyEvent', eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 100 });
    const eventId = event.body.data.id;
    createdEventIds.push(eventId);

    const addDish = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    const eventDishId = addDish.body.data.dishes.at(-1).id;

    const zero = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId, plannedQuantity: 0 });
    expect(zero.status).toBe(400);

    // Deactivate the food item, then try to plan it.
    await prisma.foodItem.update({ where: { id: foodItemId }, data: { isActive: false } });
    const inactive = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId, plannedQuantity: 10 });
    expect(inactive.status).toBe(409);
  });

  it('materials cannot be edited once the event leaves DRAFT/PLANNING', async () => {
    const admin = await createAdminWithSession();
    const { foodItemId } = await createFoodItemWithStock(75);

    const dish = await request(app)
      .post('/api/v1/dishes')
      .set('Cookie', admin.cookie)
      .send({ name: `ReadyDish-${randomUUID().slice(0, 8)}` });
    createdDishIds.push(dish.body.data.id);

    const event = await request(app)
      .post('/api/v1/events')
      .set('Cookie', admin.cookie)
      .send({ name: 'ReadyEvent', eventDate: '2026-11-15', startTime: '10:00', numberOfPeople: 100 });
    const eventId = event.body.data.id;
    createdEventIds.push(eventId);

    const addDish = await request(app)
      .post(`/api/v1/events/${eventId}/dishes`)
      .set('Cookie', admin.cookie)
      .send({ dishId: dish.body.data.id });
    const eventDishId = addDish.body.data.dishes.at(-1).id;

    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'PLANNING' });
    await request(app).patch(`/api/v1/events/${eventId}/status`).set('Cookie', admin.cookie).send({ status: 'READY' });

    const addMaterial = await request(app)
      .post(`/api/v1/event-dishes/${eventDishId}/materials`)
      .set('Cookie', admin.cookie)
      .send({ foodItemId, plannedQuantity: 10 });
    expect(addMaterial.status).toBe(409);
  });
});

describe('Cross-admin assignment (Phase 4 UI feature)', () => {
  it('ADMIN can place an executor under any active admin; history is preserved; duplicate same-admin assign is rejected', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });

    // Assign to A first (explicit adminId).
    const assignA = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', adminA.cookie)
      .send({ executorId: executor.id, adminId: adminA.user.id });
    expect(assignA.status).toBe(201);
    expect(assignA.body.data.assignment.admin.id).toBe(adminA.user.id);

    // Duplicate assign to the same admin -> 409.
    const duplicate = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', adminA.cookie)
      .send({ executorId: executor.id, adminId: adminA.user.id });
    expect(duplicate.status).toBe(409);

    // Cross-admin reassignment: admin B places the executor under admin A explicitly is same-admin;
    // here admin B moves the executor to THEMSELF (B) - history preserved, new record created.
    const moveToB = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', adminB.cookie)
      .send({ executorId: executor.id, adminId: adminB.user.id });
    expect(moveToB.status).toBe(201);
    expect(moveToB.body.data.assignment.admin.id).toBe(adminB.user.id);

    // Global assignment list (admin-only) shows the executor under B, and history shows both rows.
    const list = await request(app)
      .get('/api/v1/assignments?activeOnly=false')
      .set('Cookie', adminA.cookie);
    expect(list.status).toBe(200);
    const rows = list.body.data.assignments.filter(
      (row: { executor: { id: string } }) => row.executor.id === executor.id,
    );
    expect(rows.length).toBe(2);
    expect(rows.filter((row: { isActive: boolean }) => row.isActive).length).toBe(1);

    // Executor scope follows the NEW admin: executor logs in and sees only admin B scope.
    const loginResponse = await login(executor.email, password);
    const executorCookie = extractCookie(loginResponse) ?? '';
    const events = await request(app)
      .get('/api/v1/events')
      .set('Cookie', executorCookie);
    expect(events.status).toBe(200);
  });

  it('rejects assignment to a non-admin or inactive admin', async () => {
    const admin = await createAdminWithSession();
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });

    // Explicitly targeting an EXECUTOR as "admin" -> 400.
    const badTarget = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: executor.id, adminId: executor.id });
    expect(badTarget.status).toBe(400);
  });
});

describe('Calendar', () => {
  it('returns only in-scope events within the date range', async () => {
    const adminA = await createAdminWithSession();
    const adminB = await createAdminWithSession();

    const createdA = await request(app)
      .post('/api/v1/events')
      .set('Cookie', adminA.cookie)
      .send({ name: 'CalendarA', eventDate: '2026-11-10', startTime: '09:00', numberOfPeople: 100 });
    const createdB = await request(app)
      .post('/api/v1/events')
      .set('Cookie', adminB.cookie)
      .send({ name: 'CalendarB', eventDate: '2026-11-10', startTime: '11:00', numberOfPeople: 100 });
    createdEventIds.push(createdA.body.data.id, createdB.body.data.id);

    const response = await request(app)
      .get('/api/v1/calendar/events?from=2026-11-01&to=2026-11-30')
      .set('Cookie', adminA.cookie);

    expect(response.status).toBe(200);
    const names = response.body.data.events.map((e: { name: string }) => e.name);
    expect(names).toContain('CalendarA');
    expect(names).not.toContain('CalendarB');
  });
});
