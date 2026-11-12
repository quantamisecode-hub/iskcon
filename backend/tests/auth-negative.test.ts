import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/**
 * PHASE 11 — AUTH NEGATIVE + API SECURITY SUITE (TC-01 / TC-32 P0 gaps).
 *
 * Covers:
 *  - TC-AUTH-003/004: wrong password vs unknown email → identical generic 401
 *    (no user enumeration), no cookie.
 *  - TC-AUTH-005/006/007: login validation sweep → 400 VALIDATION_ERROR,
 *    validation BEFORE credential check, strict (extra fields rejected).
 *  - TC-AUTH-008: deactivated user → login 401 generic AND existing session
 *    rejected by /me (middleware re-checks isActive).
 *  - TC-AUTH-010: logout revokes the session; /me → 401 afterwards.
 *  - TC-AUTH-013: forged cookie / revoked (deleted) session row → 401.
 *  - TC-AUTH-015: no sensitive data in login/me/logout responses; errors never
 *    echo the submitted password.
 *  - TC-SEC-001: every protected router 401s without a cookie (health+login
 *    excepted); no stack traces in any error body (TC-SEC-006 partial).
 *  - TC-SEC-002: session cookie is HttpOnly + SameSite (Secure is off in the
 *    test env by config — recorded; prod sets it).
 *  - TC-SEC-005: helmet security headers present (partial: the always-on set).
 *  - TC-SEC-007: unknown route → structured 404, no leak.
 *
 * Rate-limiter cases (TC-AUTH-009 / TC-SEC-004) are NOT automatable here: the
 * test environment deliberately raises RATE_LIMIT_MAX (setup-env.ts), so a 429
 * can only be proven against a real limiter window — left to a dedicated
 * process-level suite.
 *
 * Runs against the dedicated food_inventory_test database only.
 */

const app = createApp();
const prisma = getTestClient();

const createdUserIds: string[] = [];

async function createTestUser(input: {
  role: 'ADMIN' | 'EXECUTOR';
  password: string;
}): Promise<User> {
  const user = await authService.createUserRecord({
    firstName: 'AuthNeg',
    lastName: input.role === 'ADMIN' ? 'Admin' : 'Executor',
    email: `authneg-${randomUUID()}@example.test`,
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

afterAll(async () => {
  // Cleanup flake fix: parallel suites' afterAll deleteMany calls can deadlock
  // each other (P2034). deleteMany is idempotent, so replaying the whole
  // cleanup body on a deadlock is always safe.
  await withDeadlockRetry(async () => {
    // FK-safe order: notifications → auditLog → assignments → sessions → users.
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } });
    await prisma.adminExecutorAssignment.deleteMany({
      where: { OR: [{ adminId: { in: createdUserIds } }, { executorId: { in: createdUserIds } }] },
    });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

describe('TC-AUTH-003/004 — no user enumeration on login failure', () => {
  it('wrong password and unknown email produce the IDENTICAL generic 401', async () => {
    const password = `ValidPass${randomUUID()}-an`;
    const user = await createTestUser({ role: 'EXECUTOR', password });

    const wrongPassword = await login(user.email, `WrongPass${randomUUID()}-x`);
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(extractCookie(wrongPassword)).toBeUndefined();

    const unknownEmail = await login(`nobody-${randomUUID()}@example.test`, password);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(extractCookie(unknownEmail)).toBeUndefined();

    // Enumeration resistance: identical status, code and message.
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
    expect(unknownEmail.body).toEqual({
      ...unknownEmail.body,
      error: { ...unknownEmail.body.error, message: wrongPassword.body.error.message },
    });
    expect(unknownEmail.body.error.message).not.toContain('not found');
    expect(unknownEmail.body.error.message.toLowerCase()).not.toContain('inactive');
  });
});

describe('TC-AUTH-005/006/007 — login validation sweep (before credential check)', () => {
  it('rejects empty, malformed and extra-field logins with 400 and no session', async () => {
    const password = `ValidPass${randomUUID()}-an`;
    const user = await createTestUser({ role: 'EXECUTOR', password });

    const cases: Array<Record<string, unknown>> = [
      {},
      { email: '', password: '' },
      { email: user.email, password: '' },
      { email: '', password },
      { email: 'not-an-email', password },
      // loginSchema is .strict() — unknown fields are rejected (mass assignment).
      { email: user.email, password, remember: 'true' },
    ];

    for (const body of cases) {
      const response = await request(app).post('/api/v1/auth/login').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(extractCookie(response)).toBeUndefined();
      // Validation precedes credential logic: response never hints about the user.
      expect(JSON.stringify(response.body)).not.toContain(user.email);
    }

    // No session rows were created for this user by any rejected attempt.
    const sessions = await prisma.session.count({ where: { userId: user.id } });
    expect(sessions).toBe(0);
  });
});

describe('TC-AUTH-008 — deactivated user cannot authenticate', () => {
  it('login 401 generic AND the pre-existing session is rejected by /me', async () => {
    const adminPassword = `ValidPass${randomUUID()}-an`;
    const admin = await createTestUser({ role: 'ADMIN', password: adminPassword });
    const adminLogin = await login(admin.email, adminPassword);
    const adminCookie = extractCookie(adminLogin) ?? '';
    expect(adminLogin.status).toBe(200);

    const executorPassword = `ValidPass${randomUUID()}-an`;
    const executor = await createTestUser({ role: 'EXECUTOR', password: executorPassword });
    const firstLogin = await login(executor.email, executorPassword);
    expect(firstLogin.status).toBe(200);
    const cookie = extractCookie(firstLogin) ?? '';

    // Session works before deactivation.
    const meBefore = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(meBefore.status).toBe(200);

    // Admin deactivates the executor.
    const deactivated = await request(app)
      .patch(`/api/v1/users/${executor.id}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'INACTIVE' });
    expect(deactivated.status).toBe(200);

    // Fresh login → generic 401 (inactive treated exactly like invalid creds).
    const relogin = await login(executor.email, executorPassword);
    expect(relogin.status).toBe(401);
    expect(relogin.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(relogin.body.error.message).toBe('Invalid email or password.');

    // The OLD session is rejected too — middleware re-checks isActive.
    const meAfter = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('TC-AUTH-010 — logout revokes the session', () => {
  it('after logout, /me with the same cookie is 401', async () => {
    const password = `ValidPass${randomUUID()}-an`;
    const user = await createTestUser({ role: 'ADMIN', password });
    const first = await login(user.email, password);
    const cookie = extractCookie(first) ?? '';
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);

    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('UNAUTHORIZED');

    // The session row is really revoked server-side (soft revoke: revokedAt
    // set; findValidByTokenHash rejects revoked rows) — DB-verified.
    const rows = await prisma.session.findMany({ where: { userId: user.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });
});

describe('TC-AUTH-013 — forged / revoked session cookies are refused', () => {
  it('a forged token and a DB-deleted session both 401', async () => {
    // Forged: syntactically plausible token that exists in no Session row.
    const forged = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `fis_session=${randomUUID()}${randomUUID()}`);
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('UNAUTHORIZED');
    expect(forged.body.error.message).toBe('Authentication required.');

    // Revoked: a REAL session whose row is deleted server-side.
    const password = `ValidPass${randomUUID()}-an`;
    const user = await createTestUser({ role: 'ADMIN', password });
    const first = await login(user.email, password);
    const cookie = extractCookie(first) ?? '';
    await prisma.session.deleteMany({ where: { userId: user.id } });

    const revoked = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('TC-AUTH-015 — sensitive-data scan on auth responses', () => {
  it('login/me bodies never expose password hashes, tokens, or other users', async () => {
    const password = `S3cretPass${randomUUID()}-an`;
    const user = await createTestUser({ role: 'EXECUTOR', password });

    const loginResponse = await login(user.email, password);
    const loginBody = JSON.stringify(loginResponse.body);
    expect(loginBody).not.toContain('passwordHash');
    expect(loginBody).not.toContain('tokenHash');
    expect(loginBody).not.toContain(password); // the secret itself never echoed
    expect(loginBody).not.toContain(extractCookie(loginResponse) ?? '\u0000'); // no raw token in body

    const cookie = extractCookie(loginResponse) ?? '';
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    const meBody = JSON.stringify(me.body);
    expect(meBody).not.toContain('passwordHash');
    expect(meBody).not.toContain('tokenHash');
    expect(meBody).not.toContain(password);

    // Failure responses never echo the submitted password either.
    const failed = await login(user.email, `TyposPass${randomUUID()}-x`);
    expect(JSON.stringify(failed.body)).not.toContain(`TyposPass`);

    // /me leaks no other user's record.
    const adminPassword = `ValidPass${randomUUID()}-an`;
    const admin = await createTestUser({ role: 'ADMIN', password: adminPassword });
    const executorMeEmails = meBody.match(/"@example\.test/g) ?? [];
    expect(executorMeEmails.length).toBeLessThanOrEqual(1);
    expect(meBody).not.toContain(admin.email);
  });
});

describe('TC-SEC-001/006 — unauthenticated sweep of every protected router', () => {
  // health (public probe) and login (the gate itself) are the documented
  // exceptions. /auth/logout and /auth/me are auth-gated and included.
  const protectedEndpoints: Array<[string, 'get' | 'post' | 'patch' | 'delete']> = [
    ['users', 'get'],
    ['users', 'post'],
    ['assignments', 'get'],
    ['assignments', 'post'],
    ['categories', 'get'],
    ['units', 'get'],
    ['food-items', 'get'],
    ['food-items', 'post'],
    ['events', 'get'],
    ['events', 'post'],
    ['dishes', 'get'],
    ['calendar/events', 'get'],
    ['dashboard/summary', 'get'],
    ['ledger', 'get'],
    ['material-requests', 'get'],
    ['material-requests', 'post'],
    ['returns', 'get'],
    ['notifications', 'get'],
    ['auth/me', 'get'],
    ['auth/profile', 'patch'],
    ['auth/change-password', 'post'],
  ];

  it('every endpoint answers 401 UNAUTHORIZED without a cookie — no leaks', async () => {
    for (const [path, method] of protectedEndpoints) {
      const response = await request(app)[method](`/api/v1/${path}`).send({});
      expect(response.status, `GET/POST ${path} must be auth-gated`).toBe(401);
      expect(response.body.error.code, path).toBe('UNAUTHORIZED');
      // TC-SEC-006 (partial): error bodies leak nothing.
      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/stack|node_modules|prisma|D:\\/i);
    }
  });

  it('logout is an idempotent no-op without a session (recorded behavior, TC-SEC-001 exception)', async () => {
    // No cookie → still 200: logout just clears whatever cookie the client
    // holds; there is no session row to revoke and no data is returned.
    // Safe-by-design; recorded here so a future change is deliberate.
    const anon = await request(app).post('/api/v1/auth/logout').send({});
    expect(anon.status).toBe(200);
    expect(JSON.stringify(anon.body)).not.toMatch(/stack|node_modules|prisma/i);
  });

  it('health stays public; auth/login is reachable unauthenticated', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    // Login with garbage creds is reachable (401) — not 401-because-no-cookie.
    const gate = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `anon-${randomUUID()}@example.test`, password: 'whatever' });
    expect(gate.status).toBe(401);
    expect(gate.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('TC-SEC-002/005 — cookie flags and security headers', () => {
  it('session cookie is HttpOnly + SameSite=Lax (Secure off in test env, recorded); helmet headers present', async () => {
    const password = `ValidPass${randomUUID()}-an`;
    const user = await createTestUser({ role: 'ADMIN', password });
    const response = await login(user.email, password);
    expect(response.status).toBe(200);

    const setCookie = (response.headers['set-cookie'] as string[])[0];
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    // Recorded: COOKIE_SECURE=false in the TEST environment (http dev host);
    // production config sets Secure. Token never appears in the body.
    expect(setCookie).not.toMatch(/Secure/i);
    expect(JSON.stringify(response.body)).not.toContain('fis_session=');

    // Helmet's always-on set (P1 header check, partial).
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(
      response.headers['x-frame-options'] ?? response.headers['content-security-policy'],
    ).toBeDefined();
  });
});

describe('TC-SEC-007 — unknown routes answer a clean structured 404', () => {
  it('/api/v1/nonexistent → structured 404, no stack/paths', async () => {
    const response = await request(app).get('/api/v1/nonexistent');
    expect(response.status).toBe(404);
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/stack|node_modules|D:\\/i);
  });
});
