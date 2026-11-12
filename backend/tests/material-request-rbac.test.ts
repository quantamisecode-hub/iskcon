import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * MATERIAL REQUEST SEPARATION OF DUTIES
 * Rule: only an EXECUTOR can request materials and only an ADMIN can
 * approve/reject. An admin can never create a request they could approve.
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
  role: 'ADMIN' | 'EXECUTOR';
  password?: string;
}): Promise<User> {
  const user = await authService.createUserRecord({
    firstName: 'Test',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `test-${randomUUID()}@example.test`,
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
  const unit = await prisma.unit.create({
    data: {
      name: `Unit-${randomUUID()}`,
      symbol: `U${randomUUID().slice(0, 5).toUpperCase()}`,
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

/** Creates an event with one dish and one committed material line. */
async function createPlannedEvent(adminCookie: string): Promise<string> {
  const { foodItemId, unitId } = await createFoodItemWithStock(500);

  const dish = await request(app)
    .post('/api/v1/dishes')
    .set('Cookie', adminCookie)
    .send({ name: `Dish-${randomUUID().slice(0, 8)}` });
  expect(dish.status).toBe(201);
  createdDishIds.push(dish.body.data.id);

  const event = await request(app)
    .post('/api/v1/events')
    .set('Cookie', adminCookie)
    .send({
      name: `Request Event ${randomUUID().slice(0, 8)}`,
      eventDate: '2026-12-20',
      startTime: '10:00',
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
    .send({ foodItemId, plannedQuantity: 25, unitId });
  expect(addMaterial.status).toBe(201);

  return eventId;
}

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
  // Events cascade to event dishes/materials and material requests/items.
  await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
  await prisma.dish.deleteMany({ where: { id: { in: createdDishIds } } });
  // Scoped to this file's food items — test files run in parallel on one DB.
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

describe('Material request separation of duties', () => {
  it('ADMIN cannot create a material request (403)', async () => {
    const admin = await createAdminWithSession();
    const eventId = await createPlannedEvent(admin.cookie);

    const response = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', admin.cookie)
      .send({ eventId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const rows = await prisma.materialRequest.count({ where: { eventId } });
    expect(rows).toBe(0);
  });

  it('EXECUTOR creates and submits; ADMIN approves; EXECUTOR cannot approve', async () => {
    const admin = await createAdminWithSession();
    const executor = await createExecutorAssignedTo(admin.user);
    const eventId = await createPlannedEvent(admin.cookie);

    // Executor raises the request.
    const created = await request(app)
      .post('/api/v1/material-requests')
      .set('Cookie', executor.cookie)
      .send({ eventId });
    expect(created.status).toBe(201);
    expect(created.body.data.request.requestedById).toBe(executor.user.id);
    expect(created.body.data.request.adminId).toBe(admin.user.id);
    expect(created.body.data.request.status).toBe('DRAFT');

    const requestId = created.body.data.request.id as string;

    // Executor submits for approval.
    const submitted = await request(app)
      .post(`/api/v1/material-requests/${requestId}/submit`)
      .set('Cookie', executor.cookie);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.request.status).toBe('PENDING_APPROVAL');

    // Executor cannot approve, even their own request.
    const executorApprove = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', executor.cookie);
    expect(executorApprove.status).toBe(403);

    // Admin approves the executor's request.
    const approved = await request(app)
      .post(`/api/v1/material-requests/${requestId}/approve`)
      .set('Cookie', admin.cookie);
    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe('APPROVED');
    expect(approved.body.data.request.approverId).toBe(admin.user.id);
  });

  it('ADMIN cannot submit, approve or reject a request they created themselves', async () => {
    const admin = await createAdminWithSession();
    const eventId = await createPlannedEvent(admin.cookie);

    // Legacy/self-created record: requester and scoped admin are the same person.
    const selfCreated = await prisma.materialRequest.create({
      data: {
        requestCode: `REQ-LEGACY-${randomUUID().slice(0, 8)}`,
        eventId,
        requestedById: admin.user.id,
        adminId: admin.user.id,
        status: 'DRAFT',
      },
    });

    // Admin cannot push their own draft into the approval queue.
    const submit = await request(app)
      .post(`/api/v1/material-requests/${selfCreated.id}/submit`)
      .set('Cookie', admin.cookie);
    expect(submit.status).toBe(403);

    await prisma.materialRequest.update({
      where: { id: selfCreated.id },
      data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
    });

    const approve = await request(app)
      .post(`/api/v1/material-requests/${selfCreated.id}/approve`)
      .set('Cookie', admin.cookie);
    expect(approve.status).toBe(403);
    expect(approve.body.error.message).toBe('You cannot approve a material request you created.');

    const reject = await request(app)
      .post(`/api/v1/material-requests/${selfCreated.id}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Self decision should be blocked.' });
    expect(reject.status).toBe(403);
    expect(reject.body.error.message).toBe('You cannot reject a material request you created.');

    // Still awaiting a genuine decision.
    const stored = await prisma.materialRequest.findUnique({ where: { id: selfCreated.id } });
    expect(stored?.status).toBe('PENDING_APPROVAL');
  });
});
