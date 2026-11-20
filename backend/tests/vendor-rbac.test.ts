import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';
import { ApiError } from '../src/middleware/error.middleware.js';
import { canManageVendors, requireVendorAdmin } from '../src/policies/vendor.policy.js';
import type { User } from '@prisma/client';

/**
 * VENDOR MANAGEMENT RBAC / AUTHORIZATION HARDENING TESTS.
 *
 * Vendor master data (supplier/payment information) is ADMIN-only. These tests
 * exercise the full HTTP matrix plus the centralized policy helper directly.
 * Runs against the dedicated food_inventory_test database only.
 */

const app = createApp();
const prisma = getTestClient();

const createdUserIds: string[] = [];
const createdVendorIds: string[] = [];
const createdFoodItemIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdUnitIds: string[] = [];

let adminCookie = '';
let executorCookie = '';
let baseVendorId = '';

async function createTestUser(role: 'ADMIN' | 'EXECUTOR'): Promise<{ user: User; password: string }> {
  const password = `ValidPass${randomUUID()}-x7`;
  const user = await authService.createUserRecord({
    firstName: 'VendorRbac',
    lastName: role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `vendor-rbac-${randomUUID()}@example.test`,
    password,
    role,
  });
  createdUserIds.push(user.id);
  return { user, password };
}

async function login(email: string, password: string): Promise<request.Response> {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

function extractCookieString(response: request.Response): string {
  const setCookie = response.headers['set-cookie'];
  if (!Array.isArray(setCookie) || setCookie.length === 0) return '';
  return setCookie[0].split(';')[0] ?? '';
}

function authHeaders(cookie?: string): Record<string, string> {
  return cookie ? { Cookie: cookie } : {};
}

/** Every vendor endpoint, exercised with an optional session cookie. */
function vendorEndpoints(vendorId: string, newName: string) {
  return [
    {
      name: 'GET /vendors',
      call: (cookie?: string) => request(app).get('/api/v1/vendors').set(authHeaders(cookie)),
    },
    {
      name: 'GET /vendors/:id',
      call: (cookie?: string) => request(app).get(`/api/v1/vendors/${vendorId}`).set(authHeaders(cookie)),
    },
    {
      name: 'POST /vendors',
      call: (cookie?: string) =>
        request(app).post('/api/v1/vendors').set(authHeaders(cookie)).send({ name: newName }),
    },
    {
      name: 'PATCH /vendors/:id',
      call: (cookie?: string) =>
        request(app).patch(`/api/v1/vendors/${vendorId}`).set(authHeaders(cookie)).send({ notes: 'rbac' }),
    },
    {
      name: 'POST /vendors/:id/activate',
      call: (cookie?: string) => request(app).post(`/api/v1/vendors/${vendorId}/activate`).set(authHeaders(cookie)),
    },
    {
      name: 'POST /vendors/:id/deactivate',
      call: (cookie?: string) => request(app).post(`/api/v1/vendors/${vendorId}/deactivate`).set(authHeaders(cookie)),
    },
    {
      name: 'GET /vendors/:id/audit',
      call: (cookie?: string) => request(app).get(`/api/v1/vendors/${vendorId}/audit`).set(authHeaders(cookie)),
    },
    {
      name: 'GET /vendors/audit',
      call: (cookie?: string) => request(app).get('/api/v1/vendors/audit').set(authHeaders(cookie)),
    },
  ];
}

beforeAll(async () => {
  const admin = await createTestUser('ADMIN');
  adminCookie = extractCookieString(await login(admin.user.email, admin.password));
  expect(adminCookie).not.toBe('');

  const executor = await createTestUser('EXECUTOR');
  executorCookie = extractCookieString(await login(executor.user.email, executor.password));
  expect(executorCookie).not.toBe('');

  const baseVendor = await prisma.vendor.create({ data: { name: `rbac-base-${randomUUID()}` } });
  baseVendorId = baseVendor.id;
  createdVendorIds.push(baseVendor.id);
});

afterAll(async () => {
  // FK-safe cleanup: audit logs -> stock ledger -> dependent masters -> vendor -> users.
  await withDeadlockRetry(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdVendorIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { vendorId: { in: createdVendorIds } } });
    await prisma.foodItem.deleteMany({ where: { id: { in: createdFoodItemIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.unit.deleteMany({ where: { id: { in: createdUnitIds } } });
    await prisma.vendor.deleteMany({ where: { id: { in: createdVendorIds } } });
    // Sessions cascade with the user (onDelete: Cascade).
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

// =============================================================================
// CENTRALIZED POLICY HELPER (fail closed for unknown/future roles)
// =============================================================================

describe('vendor policy helper', () => {
  it('allows strictly ADMIN and denies everyone else, including future roles', () => {
    expect(canManageVendors({ id: 'u1', role: 'ADMIN' })).toBe(true);
    expect(canManageVendors({ id: 'u2', role: 'EXECUTOR' })).toBe(false);
    expect(canManageVendors({ id: 'u3', role: 'FUTURE_ROLE' })).toBe(false);
    expect(canManageVendors(null)).toBe(false);
    expect(canManageVendors(undefined)).toBe(false);

    expect(() => requireVendorAdmin({ id: 'u1', role: 'ADMIN' })).not.toThrow();

    let missing: unknown;
    try {
      requireVendorAdmin(null);
    } catch (error) {
      missing = error;
    }
    expect(missing).toBeInstanceOf(ApiError);
    expect((missing as ApiError).statusCode).toBe(401);

    for (const role of ['EXECUTOR', 'FUTURE_ROLE']) {
      let denied: unknown;
      try {
        requireVendorAdmin({ id: 'u4', role });
      } catch (error) {
        denied = error;
      }
      expect(denied, role).toBeInstanceOf(ApiError);
      expect((denied as ApiError).statusCode, role).toBe(403);
      expect((denied as ApiError).errorCode, role).toBe('FORBIDDEN');
      // The message must not reveal the caller's role or internals.
      expect((denied as ApiError).message, role).not.toContain(role);
    }
  });
});

// =============================================================================
// ADMIN — full happy path
// =============================================================================

describe('Vendor Management (ADMIN only)', () => {
  it('ADMIN can list vendors', async () => {
    const response = await request(app).get('/api/v1/vendors').set('Cookie', adminCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.vendors).toBeInstanceOf(Array);
  });

  it('ADMIN can create a vendor (201)', async () => {
    const response = await request(app)
      .post('/api/v1/vendors')
      .set('Cookie', adminCookie)
      .send({ name: `rbac-created-${randomUUID()}` });
    expect(response.status).toBe(201);
    const id = response.body.data.id as string;
    expect(id).toBeTruthy();
    createdVendorIds.push(id);
  });

  it('ADMIN can read a vendor by id and patch it', async () => {
    const read = await request(app).get(`/api/v1/vendors/${baseVendorId}`).set('Cookie', adminCookie);
    expect(read.status).toBe(200);

    const patched = await request(app)
      .patch(`/api/v1/vendors/${baseVendorId}`)
      .set('Cookie', adminCookie)
      .send({ notes: `rbac-${randomUUID()}` });
    expect(patched.status).toBe(200);
  });

  it('ADMIN can deactivate and activate a vendor', async () => {
    const deactivate = await request(app)
      .post(`/api/v1/vendors/${baseVendorId}/deactivate`)
      .set('Cookie', adminCookie);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.vendor?.isActive ?? deactivate.body.data.isActive).toBe(false);

    const activate = await request(app)
      .post(`/api/v1/vendors/${baseVendorId}/activate`)
      .set('Cookie', adminCookie);
    expect(activate.status).toBe(200);
    expect(activate.body.data.vendor?.isActive ?? activate.body.data.isActive).toBe(true);
  });

  it('ADMIN can read vendor audit history (all and by id)', async () => {
    // Ensure a fresh entry exists for this vendor.
    const patch = await request(app)
      .patch(`/api/v1/vendors/${baseVendorId}`)
      .set('Cookie', adminCookie)
      .send({ contactPerson: `Rbac ${randomUUID()}` });
    expect(patch.status).toBe(200);

    const byId = await request(app)
      .get(`/api/v1/vendors/${baseVendorId}/audit`)
      .set('Cookie', adminCookie);
    expect(byId.status).toBe(200);
    expect(byId.body.data).toBeInstanceOf(Array);
    expect(byId.body.data.length).toBeGreaterThan(0);
    expect(byId.body.data.some((entry: { action: string }) => entry.action === 'UPDATE_VENDOR')).toBe(true);

    const all = await request(app).get('/api/v1/vendors/audit').set('Cookie', adminCookie);
    expect(all.status).toBe(200);
    expect(all.body.data).toBeInstanceOf(Array);
    expect(all.body.data.length).toBeGreaterThan(0);
  });

  it('deactivate is refused (409) when a stock transaction references the vendor', async () => {
    const vendor = await prisma.vendor.create({ data: { name: `rbac-blocked-${randomUUID()}` } });
    createdVendorIds.push(vendor.id);

    const category = await prisma.category.create({ data: { name: `rbac-cat-${randomUUID()}` } });
    createdCategoryIds.push(category.id);
    const unit = await prisma.unit.create({
      data: {
        name: `rbac-unit-${randomUUID()}`,
        symbol: `U${randomUUID().slice(0, 6)}`,
        unitType: 'COUNT',
      },
    });
    createdUnitIds.push(unit.id);
    const foodItem = await prisma.foodItem.create({
      data: {
        name: `rbac-item-${randomUUID()}`,
        categoryId: category.id,
        unitId: unit.id,
        minimumStock: 0,
        reorderLevel: 0,
      },
    });
    createdFoodItemIds.push(foodItem.id);
    await prisma.inventoryTransaction.create({
      data: {
        foodItemId: foodItem.id,
        transactionType: 'STOCK_IN',
        quantity: 1,
        balanceBefore: 0,
        balanceAfter: 1,
        vendorId: vendor.id,
        idempotencyKey: randomUUID(),
      },
    });

    const response = await request(app)
      .post(`/api/v1/vendors/${vendor.id}/deactivate`)
      .set('Cookie', adminCookie);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });
});

// =============================================================================
// EXECUTOR — forbidden on every vendor endpoint
// =============================================================================

describe('Vendor Management (EXECUTOR denied)', () => {
  it('EXECUTOR receives 403 on every vendor endpoint', async () => {
    for (const endpoint of vendorEndpoints(baseVendorId, `executor-forbidden-${randomUUID()}`)) {
      const response = await endpoint.call(executorCookie);
      expect(response.status, endpoint.name).toBe(403);
      expect(response.body.error.code, endpoint.name).toBe('FORBIDDEN');
    }
  });

  it('EXECUTOR create does not add a vendor row', async () => {
    const name = `executor-must-not-exist-${randomUUID()}`;
    expect(await prisma.vendor.count({ where: { name } })).toBe(0);

    const response = await request(app)
      .post('/api/v1/vendors')
      .set('Cookie', executorCookie)
      .send({ name });
    expect(response.status).toBe(403);
    expect(await prisma.vendor.count({ where: { name } })).toBe(0);

    // Cross-check from the ADMIN view: no such vendor exists.
    const adminList = await request(app)
      .get('/api/v1/vendors')
      .query({ search: name })
      .set('Cookie', adminCookie);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.total).toBe(0);
  });

  it('role spoofing in the request body is ignored (role comes from the session)', async () => {
    const response = await request(app)
      .post('/api/v1/vendors')
      .set('Cookie', executorCookie)
      .send({ name: `executor-spoof-${randomUUID()}`, role: 'ADMIN' });
    expect(response.status).toBe(403);
  });
});

// =============================================================================
// UNAUTHENTICATED — 401 on every vendor endpoint
// =============================================================================

describe('Vendor Management (unauthenticated denied)', () => {
  it('every vendor endpoint returns 401 without a session', async () => {
    for (const endpoint of vendorEndpoints(baseVendorId, `unauth-forbidden-${randomUUID()}`)) {
      const response = await endpoint.call();
      expect(response.status, endpoint.name).toBe(401);
      expect(response.body.error.code, endpoint.name).toBe('UNAUTHORIZED');
    }
  });
});
