import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

/** EVENT_CREATOR: create + view own events only, denied everywhere else. */
const app = createApp();
const prisma = getTestClient();
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];
let adminCookie = '';
let creatorCookie = '';
let creatorId = '';
let otherAdminCookie = '';

async function createUser(role: 'ADMIN' | 'EVENT_CREATOR'): Promise<{ id: string; email: string; password: string; cookie: string }> {
  const password = `ValidPass${randomUUID()}-ec!`;
  const user = await authService.createUserRecord({
    firstName: 'Role', lastName: role === 'ADMIN' ? 'Admin' : 'Creator',
    email: `event-creator-${role.toLowerCase()}-${randomUUID()}@example.test`, password, role,
  });
  createdUserIds.push(user.id);
  const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  const setCookie = res.headers['set-cookie'];
  return { id: user.id, email: user.email, password, cookie: Array.isArray(setCookie) ? String(setCookie[0]).split(';')[0] : '' };
}

const eventBody = (name: string) => ({
  name, eventDate: '2026-12-25', startTime: '10:00', numberOfPeople: 100,
  eventType: 'BACE', contactPerson: 'Test Contact', mobileNumber: '7000000000',
});

beforeAll(async () => {
  const admin = await createUser('ADMIN');
  adminCookie = admin.cookie;
  const otherAdmin = await createUser('ADMIN');
  otherAdminCookie = otherAdmin.cookie;
  const creator = await createUser('EVENT_CREATOR');
  creatorCookie = creator.cookie;
  creatorId = creator.id;
});

afterAll(async () => {
  await withDeadlockRetry(async () => {
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds }, OR: [{ adminId: { in: createdUserIds } }, { createdBy: { in: createdUserIds } }] } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.adminExecutorAssignment.deleteMany({
      where: { OR: [{ adminId: { in: createdUserIds } }, { executorId: { in: createdUserIds } }] },
    });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

describe('EVENT_CREATOR — role creation', () => {
  it('ADMIN can create a user with the EVENT_CREATOR role', async () => {
    const res = await request(app).post('/api/v1/users').set('Cookie', adminCookie).send({
      firstName: 'New', lastName: 'Creator', email: `new-creator-${randomUUID()}@example.test`,
      password: 'ValidPass123#', role: 'EVENT_CREATOR',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('EVENT_CREATOR');
    createdUserIds.push(res.body.data.user.id);
    await prisma.session.deleteMany({ where: { userId: res.body.data.user.id } });
    await prisma.user.delete({ where: { id: res.body.data.user.id } });
  });

  it('unknown roles are still rejected', async () => {
    const res = await request(app).post('/api/v1/users').set('Cookie', adminCookie).send({
      firstName: 'Bad', lastName: 'Role', email: `bad-role-${randomUUID()}@example.test`,
      password: 'ValidPass123#', role: 'SUPER_ADMIN',
    });
    expect(res.status).toBe(400);
  });
});

describe('EVENT_CREATOR — allowed event access', () => {
  it('creates an event owned by themselves, ignoring admin-only donation fields', async () => {
    const res = await request(app).post('/api/v1/events').set('Cookie', creatorCookie).send({
      ...eventBody('Creator Event'), donationAmount: 99999, donationGivenBy: 'Should Be Ignored', trNumber: 'TX',
    });
    expect(res.status).toBe(201);
    const event = res.body.data;
    expect(event.adminId).toBe(creatorId);
    expect(event.createdBy).toBe(creatorId);
    expect(event.donationAmount).toBeNull();
    expect(event.donationGivenBy).toBeNull();
    createdEventIds.push(event.id);

    const detail = await request(app).get(`/api/v1/events/${event.id}`).set('Cookie', creatorCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(event.id);
  });

  it('lists and calendars only their own events', async () => {
    const other = await request(app).post('/api/v1/events').set('Cookie', otherAdminCookie).send(eventBody('Other Admin Event'));
    expect(other.status).toBe(201);
    createdEventIds.push(other.body.data.id);

    const list = await request(app).get('/api/v1/events?pageSize=100').set('Cookie', creatorCookie);
    expect(list.status).toBe(200);
    expect(list.body.data.events.every((event: { creator?: { id: string } | null }) => event.creator?.id === creatorId)).toBe(true);
    expect(list.body.data.events.some((event: { id: string }) => event.id === other.body.data.id)).toBe(false);

    const foreign = await request(app).get(`/api/v1/events/${other.body.data.id}`).set('Cookie', creatorCookie);
    expect(foreign.status).toBe(403);
  });
});

describe('EVENT_CREATOR — denied mutations and other modules', () => {
  let ownedEventId = '';

  beforeAll(async () => {
    const created = await request(app).post('/api/v1/events').set('Cookie', creatorCookie).send(eventBody('Creator Locked Event'));
    ownedEventId = created.body.data.id;
    createdEventIds.push(ownedEventId);
  });

  it('cannot mutate events or access event sub-resources', async () => {
    const cases: Array<[string, string, unknown]> = [
      ['patch', `/events/${ownedEventId}`, { name: 'Nope' }],
      ['patch', `/events/${ownedEventId}/status`, { status: 'PLANNING' }],
      ['delete', `/events/${ownedEventId}`, undefined],
      ['post', `/events/${ownedEventId}/undo`, undefined],
      ['post', `/events/${ownedEventId}/dispatch`, { destinationAddress: 'x', verifiedById: randomUUID() }],
      ['get', `/events/${ownedEventId}/dispatch/verifiers`, undefined],
      ['get', `/events/${ownedEventId}/material-summary`, undefined],
      ['get', `/events/${ownedEventId}/returns/returnable`, undefined],
      ['get', `/events/${ownedEventId}/dishes`, undefined],
      ['post', `/events/${ownedEventId}/dishes`, { dishId: randomUUID() }],
    ];
    for (const [method, path, body] of cases) {
      let req = request(app)[method](`/api/v1${path}`).set('Cookie', creatorCookie);
      if (body !== undefined) req = req.send(body);
      const res = await req;
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
    }
  });

  it('cannot access any other business module', async () => {
    const paths = [
      '/dashboard/summary', '/users', '/assignments', '/categories', '/units', '/vendors',
      '/food-items', `/food-items/${randomUUID()}`, '/dishes', '/ledger',
      '/material-requests', '/returns', '/notifications', '/stock-lots',
      '/fifo/preview?foodItemId=' + randomUUID() + '&quantity=1', '/inventory/valuation',
      '/event-expenses?eventId=' + ownedEventId, '/financial/summary',
    ];
    for (const path of paths) {
      const res = await request(app).get(`/api/v1${path}`).set('Cookie', creatorCookie);
      expect(res.status, `GET ${path}`).toBe(403);
    }
  });

  it('can still use self-service auth endpoints', async () => {
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', creatorCookie)).status).toBe(200);
  });
});
