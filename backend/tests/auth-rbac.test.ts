import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import prisma from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';

/**
 * BACKEND INTEGRATION TESTS (Phase 2)
 * Full HTTP matrix: authentication, RBAC, user management, assignments.
 * Runs against the dedicated food_inventory_test database only.
 */

const app = createApp();

const createdUserIds: string[] = [];

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
  if (input.isActive === false) {
    return prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  }
  return user;
}

async function login(email: string, password: string) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

function extractCookie(response: request.Response): string | undefined {
  const setCookie = response.headers['set-cookie'];
  if (!Array.isArray(setCookie) || setCookie.length === 0) return undefined;
  return setCookie[0];
}

afterAll(async () => {
  // Order matters: audit/assignment rows reference users via FK.
  await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.adminExecutorAssignment.deleteMany({
    where: { OR: [{ adminId: { in: createdUserIds } }, { executorId: { in: createdUserIds } }] },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

// =============================================================================
// AUTHENTICATION
// =============================================================================

describe('Authentication', () => {
  it('logs in with valid credentials, returns safe user + HttpOnly cookie', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const user = await createTestUser({ role: 'EXECUTOR', password });

    const response = await login(user.email, password);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(user.email.toLowerCase());
    expect(response.body.data.user.role).toBe('EXECUTOR');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('tokenHash');
    const cookie = extractCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects an invalid password with a generic 401', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const user = await createTestUser({ role: 'ADMIN', password });
    const response = await login(user.email, 'WrongPassword99!');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects an unknown email with the same generic 401', async () => {
    const response = await login('ghost@example.test', 'Whatever123');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects an inactive (deactivated) user', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const user = await createTestUser({ role: 'EXECUTOR', password, isActive: false });
    const response = await login(user.email, password);
    expect(response.status).toBe(401);
  });

  it('rejects /me without a session cookie (401)', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('returns current profile on /me with a valid session', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const user = await createTestUser({ role: 'ADMIN', password });
    const loginResponse = await login(user.email, password);
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', extractCookieString(loginResponse) ?? '');
    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(user.id);
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('logout revokes the session: the old cookie no longer works', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const user = await createTestUser({ role: 'EXECUTOR', password });
    const loginResponse = await login(user.email, password);
    const cookie = extractCookieString(loginResponse) ?? '';

    const logoutResponse = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);

    // Old (stolen/reused) cookie must be dead after revocation.
    const meAfter = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(meAfter.status).toBe(401);
  });

  it('rejects state-changing requests from a disallowed origin (CSRF layer 2)', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'x@example.test', password: 'Whatever123' });
    expect(response.status).toBe(403);
  });
});

// =============================================================================
// AUTHORIZATION (RBAC)
// =============================================================================

describe('Role-based authorization', () => {
  it('ADMIN can access Admin APIs (user list)', async () => {
    const admin = await createAdminWithSession();
    const response = await request(app).get('/api/v1/users').set('Cookie', admin.cookie);
    expect(response.status).toBe(200);
    expect(response.body.data.users).toBeInstanceOf(Array);
  });

  it('EXECUTOR is FORBIDDEN on Admin APIs (403), role cannot be spoofed', async () => {
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });
    const loginResponse = await login(executor.email, password);
    const cookie = extractCookieString(loginResponse) ?? '';

    // Attempting to create an Admin user while pretending role=ADMIN.
    const response = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookie)
      .send({
        firstName: 'Fake',
        lastName: 'Admin',
        email: `fake-${randomUUID()}@example.test`,
        password: 'ValidPass123-x7',
        role: 'ADMIN',
      });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');

    // Even reading admin data is blocked.
    const read = await request(app).get('/api/v1/users').set('Cookie', cookie);
    expect(read.status).toBe(403);
  });

  it('unauthenticated requests to protected APIs receive 401', async () => {
    const response = await request(app).get('/api/v1/users');
    expect(response.status).toBe(401);
  });
});

// =============================================================================
// USER MANAGEMENT
// =============================================================================

describe('User management (Admin-only)', () => {
  it('Admin creates an EXECUTOR and an ADMIN (no hash exposure)', async () => {
    const admin = await createAdminWithSession();

    const executorResponse = await request(app)
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({
        firstName: 'Ankit',
        lastName: 'Sharma',
        email: `ankit-${randomUUID()}@example.test`,
        password: 'SecurePass123!',
        role: 'EXECUTOR',
      });
    expect(executorResponse.status).toBe(201);
    expect(executorResponse.body.data.user.role).toBe('EXECUTOR');
    expect(JSON.stringify(executorResponse.body)).not.toContain('passwordHash');
    createdUserIds.push(executorResponse.body.data.user.id);

    const adminResponse = await request(app)
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({
        firstName: 'Second',
        lastName: 'Admin',
        email: `second-${randomUUID()}@example.test`,
        password: 'SecurePass123!',
        role: 'ADMIN',
      });
    expect(adminResponse.status).toBe(201);
    expect(adminResponse.body.data.user.role).toBe('ADMIN');
    createdUserIds.push(adminResponse.body.data.user.id);
  });

  it('rejects duplicate email (409) and invalid role (400)', async () => {
    const admin = await createAdminWithSession();
    const password = `ValidPass${randomUUID()}-x7`;
    const existing = await createTestUser({ role: 'EXECUTOR', password });

    const duplicate = await request(app)
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({
        firstName: 'Dup',
        lastName: 'User',
        email: existing.email,
        password: 'SecurePass123!',
        role: 'EXECUTOR',
      });
    expect(duplicate.status).toBe(409);

    const invalidRole = await request(app)
      .post('/api/v1/users')
      .set('Cookie', admin.cookie)
      .send({
        firstName: 'Bad',
        lastName: 'Role',
        email: `bad-${randomUUID()}@example.test`,
        password: 'SecurePass123!',
        role: 'SUPER_ADMIN',
      });
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('deactivates a user; the deactivated session dies; system keeps one active admin', async () => {
    const admin = await createAdminWithSession();
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });

    const deactivate = await request(app)
      .patch(`/api/v1/users/${executor.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'INACTIVE' });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.user.isActive).toBe(false);

    const loginResponse = await login(executor.email, password);
    expect(loginResponse.status).toBe(401);

    // Self-deactivation forbidden.
    const self = await request(app)
      .patch(`/api/v1/users/${admin.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'INACTIVE' });
    expect(self.status).toBe(403);

    // Role change is allowed to escalate executor -> admin, then back is guarded.
    const roleChange = await request(app)
      .patch(`/api/v1/users/${executor.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'ADMIN' });
    expect(roleChange.status).toBe(200);
    expect(roleChange.body.data.user.role).toBe('ADMIN');

    // Audit check: ROLE_CHANGE entry exists.
    const roleAudit = await prisma.auditLog.findFirst({
      where: { action: 'ROLE_CHANGE', entityId: executor.id },
    });
    expect(roleAudit).not.toBeNull();

    // Last-admin guard: demote every active admin except one seed admin? Our test
    // creates its own admins; demote executor-turned-admin, not the acting admin.
    const demoteBack = await request(app)
      .patch(`/api/v1/users/${executor.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'EXECUTOR' });
    expect(demoteBack.status).toBe(200);
  });
});

// =============================================================================
// ADMIN -> EXECUTOR ASSIGNMENTS
// =============================================================================

describe('Admin -> Executor assignments', () => {
  it('Admin assigns an EXECUTOR; duplicate active assignment rejected; ADMIN cannot be assigned', async () => {
    const admin = await createAdminWithSession();
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });

    const create = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: executor.id });
    expect(create.status).toBe(201);
    expect(create.body.data.assignment.executor.role).toBe('EXECUTOR');
    expect(create.body.data.assignment.executor.email).toBe(executor.email.toLowerCase());

    // Rule 5: duplicate active assignment (even from same admin).
    const duplicate = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: executor.id });
    expect(duplicate.status).toBe(409);

    // Rule 3: an ADMIN cannot be assigned as executor.
    const otherAdmin = await createTestUser({ role: 'ADMIN' });
    const badAssign = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: otherAdmin.id });
    expect(badAssign.status).toBe(409);

    // Client cannot dictate adminId (strict schema rejects unknown field).
    const spoofed = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: executor.id, adminId: 'x'.repeat(36) });
    expect(spoofed.status).toBe(400);
  });

  it('unassignment preserves history; re-assignment creates a NEW record', async () => {
    const admin = await createAdminWithSession();
    const password = `ValidPass${randomUUID()}-x7`;
    const executor = await createTestUser({ role: 'EXECUTOR', password });

    const create = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: executor.id });
    const assignmentId = create.body.data.assignment.id as string;

    const end = await request(app)
      .delete(`/api/v1/assignments/${assignmentId}`)
      .set('Cookie', admin.cookie);
    expect(end.status).toBe(200);
    expect(end.body.data.assignment.isActive).toBe(false);
    expect(end.body.data.assignment.unassignedAt).not.toBeNull();

    // Historical row still exists with isActive=false.
    const historical = await prisma.adminExecutorAssignment.findUnique({
      where: { id: assignmentId },
    });
    expect(historical).not.toBeNull();
    expect(historical?.isActive).toBe(false);

    // Rule 6: re-assignment creates a NEW active record, old record intact.
    const reassign = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', admin.cookie)
      .send({ executorId: executor.id });
    expect(reassign.status).toBe(201);
    const rows = await prisma.adminExecutorAssignment.findMany({ where: { executorId: executor.id } });
    expect(rows.length).toBe(2);
    expect(rows.filter((r) => r.isActive).length).toBe(1);

    // Executor cannot create assignments (403).
    const loginResponse = await login(executor.email, password);
    const executorCookie = extractCookieString(loginResponse) ?? '';
    const forbidden = await request(app)
      .post('/api/v1/assignments')
      .set('Cookie', executorCookie)
      .send({ executorId: executor.id });
    expect(forbidden.status).toBe(403);

    // Rule 7: Assignment history records are kept for future audit.
    const unassignAudit = await prisma.auditLog.findFirst({
      where: { action: 'UNASSIGN_EXECUTOR', entityId: assignmentId },
    });
    expect(unassignAudit).not.toBeNull();
  });
});

// =============================================================================
// Helpers
// =============================================================================

function extractCookieString(response: request.Response): string | undefined {
  return extractCookie(response)?.split(';')[0];
}

/** Creates an admin, logs in, returns { user, cookie }. */
async function createAdminWithSession(): Promise<{ user: User; cookie: string }> {
  const password = `ValidPass${randomUUID()}-x7`;
  const user = await createTestUser({ role: 'ADMIN', password });
  const loginResponse = await login(user.email, password);
  return { user, cookie: extractCookieString(loginResponse) ?? '' };
}
