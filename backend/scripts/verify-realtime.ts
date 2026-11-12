/**
 * Dev/QA check: drives the REST API as the QA admin + executor and asserts
 * that every realtime (Socket.IO) side effect reaches the right user.
 *
 * Self-contained: it builds its own event with ISSUED material for the return
 * checks, so it works on a freshly seeded database. Writes real rows
 * (events, a material request, a stock issue, a return) — dev DB only.
 *
 * Prereqs: backend running, `npm run prisma:seed` with QA_* set in backend/.env.
 * Usage (inside backend/):
 *   npm run verify:realtime                          # http://localhost:$PORT
 *   npm run verify:realtime -- http://localhost:5001 # explicit origin
 */
import 'dotenv/config';
import { io, type Socket } from 'socket.io-client';

const ORIGIN = (process.argv[2] ?? process.env['VERIFY_API_ORIGIN'] ?? `http://localhost:${process.env['PORT'] ?? 5000}`).replace(/\/+$/, '');
const API = `${ORIGIN}/api/v1`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[realtime-verify] ${name} is not set in backend/.env (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const ADMIN = { email: requireEnv('QA_ADMIN_EMAIL'), password: requireEnv('QA_ADMIN_PASSWORD') };
const EXECUTOR = { email: requireEnv('QA_EXECUTOR_EMAIL'), password: requireEnv('QA_EXECUTOR_PASSWORD') };

const CHANNELS = ['notification:new', 'event:cancelled', 'material-return:created', 'material-return:rejected'];

type InboxEntry = { at: number; socket: string; ev: string; type: string | null; payload: unknown };
const inbox: InboxEntry[] = [];

// The API wraps every success as { success, data }; payload shapes vary per route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function log(...args: unknown[]): void {
  console.log('[realtime-verify]', ...args);
}

async function login({ email, password }: { email: string; password: string }): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  if (!setCookie) throw new Error(`no session cookie returned for ${email}`);
  return setCookie.split(';')[0]!;
}

async function api(cookie: string, method: string, path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function connectSocket(cookie: string, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(ORIGIN, { path: '/socket.io', extraHeaders: { cookie }, reconnection: false });
    const timer = setTimeout(() => reject(new Error(`${label}: socket connect timeout`)), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      for (const ev of CHANNELS) {
        socket.on(ev, (payload: Json) => {
          inbox.push({ at: Date.now(), socket: label, ev, type: payload?.type ?? null, payload });
        });
      }
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`${label}: socket connect_error: ${err.message}`));
    });
  });
}

async function waitFor(description: string, predicate: (e: InboxEntry) => boolean, timeoutMs = 6000): Promise<InboxEntry> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = inbox.find(predicate);
    if (hit) return hit;
    if (Date.now() > deadline) {
      throw new Error(`TIMEOUT waiting for: ${description}\nInbox so far: ${JSON.stringify(inbox.map((e) => `${e.socket}:${e.ev}:${e.type}`))}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const results: { name: string; ok: boolean; err?: string }[] = [];
function pass(name: string): void {
  results.push({ name, ok: true });
  log(`PASS  ${name}`);
}
function fail(name: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  results.push({ name, ok: false, err: message });
  log(`FAIL  ${name} — ${message}`);
}

async function ensureAssignment(adminCookie: string, executorEmail: string): Promise<string> {
  const list = await api(adminCookie, 'GET', '/assignments?activeOnly=true');
  const rows: Json[] = list?.data?.assignments ?? [];
  const executor = await api(adminCookie, 'GET', `/users?search=${encodeURIComponent(executorEmail)}&pageSize=5`);
  const user = (executor?.data?.users ?? []).find((u: Json) => u.email === executorEmail);
  if (!user) throw new Error(`executor ${executorEmail} not found — run npm run prisma:seed`);
  const already = rows.some((r) => (r.executor?.id ?? r.executorId) === user.id && !r.endedAt);
  if (!already) {
    await api(adminCookie, 'POST', '/assignments', { executorId: user.id });
    log(`created assignment for ${executorEmail}`);
  }
  return user.id;
}

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Builds an event whose material has actually been ISSUED to the executor
 * (plan -> request -> submit -> approve -> issue), so a return is possible.
 */
async function createEventWithIssuedMaterial(adminCookie: string, execCookie: string): Promise<string> {
  const created = await api(adminCookie, 'POST', '/events', {
    name: 'Realtime Verify (returns)',
    eventDate: futureDate(14),
    startTime: '10:00',
    numberOfPeople: 10,
    status: 'PLANNING',
  });
  const eventId: string | undefined = created?.data?.id;
  if (!eventId) throw new Error('no event id returned');

  const dishes = await api(adminCookie, 'GET', '/dishes?pageSize=50');
  const dish = (dishes?.data?.dishes ?? []).find((d: Json) => d.isActive);
  if (!dish) throw new Error('no active dish found — run npm run prisma:seed');

  const foods = await api(adminCookie, 'GET', '/food-items?isActive=true&pageSize=100');
  const food = (foods?.data?.foodItems ?? [])[0];
  if (!food) throw new Error('no active food item found — run npm run prisma:seed');

  const withDish = await api(adminCookie, 'POST', `/events/${eventId}/dishes`, { dishId: dish.id });
  const eventDish = (withDish?.data?.dishes ?? []).find((d: Json) => d.dishId === dish.id);
  if (!eventDish) throw new Error('event dish not returned after adding the dish');

  await api(adminCookie, 'POST', `/event-dishes/${eventDish.id}/materials`, { foodItemId: food.id, plannedQuantity: 2 });

  const request = await api(execCookie, 'POST', '/material-requests', { eventId });
  const requestId: string | undefined = request?.data?.request?.id;
  if (!requestId) throw new Error('no material request id returned');
  await api(execCookie, 'POST', `/material-requests/${requestId}/submit`);
  const approved = await api(adminCookie, 'POST', `/material-requests/${requestId}/approve`, {});
  const items: Json[] = approved?.data?.request?.items ?? [];
  if (items.length === 0) throw new Error('approved request has no items');
  await api(adminCookie, 'POST', `/material-requests/${requestId}/issue`, {
    items: items.map((item) => ({ itemId: item.id, quantity: Math.max(1, Math.floor(Number(item.approvedQuantity))) })),
  });

  log(`prepared event ${created?.data?.eventCode} with issued ${food.name}`);
  return eventId;
}

async function main(): Promise<void> {
  log(`target ${ORIGIN}`);
  log('logging in admin + executor…');
  const adminCookie = await login(ADMIN);
  const execCookie = await login(EXECUTOR);

  await ensureAssignment(adminCookie, EXECUTOR.email);

  log('connecting sockets (admin + executor)…');
  const [adminSock, execSock] = await Promise.all([
    connectSocket(adminCookie, 'admin'),
    connectSocket(execCookie, 'executor'),
  ]);
  log(`sockets connected: admin=${adminSock.id} executor=${execSock.id}`);

  // --- 1. ADMIN creates an event -> EXECUTOR is notified live -------------
  try {
    const created = await api(adminCookie, 'POST', '/events', {
      name: 'Realtime Verify',
      eventDate: futureDate(13),
      startTime: '10:00',
      numberOfPeople: 10,
      status: 'PLANNING',
    });
    const eventId: string | undefined = created?.data?.id;
    if (!eventId) throw new Error('no event id returned');
    log(`created event ${created?.data?.eventCode}`);

    await waitFor(
      'executor notification:new EVENT_CREATED',
      (e) => e.socket === 'executor' && e.ev === 'notification:new' && e.type === 'EVENT_CREATED',
    );
    pass('1. EVENT_CREATED reaches EXECUTOR in realtime');

    // --- 2. READY milestone -> EXECUTOR notified live ---------------------
    await api(adminCookie, 'PATCH', `/events/${eventId}/status`, { status: 'READY' });
    await waitFor(
      'executor notification:new EVENT_READY',
      (e) => e.socket === 'executor' && e.ev === 'notification:new' && e.type === 'EVENT_READY',
    );
    pass('2. EVENT_READY reaches EXECUTOR in realtime');

    // --- 3. Cancel -> notification AND dedicated channel ------------------
    await api(adminCookie, 'POST', `/events/${eventId}/cancel`, { reason: 'Realtime verification run' });
    await waitFor(
      'executor notification:new EVENT_CANCELLED',
      (e) => e.socket === 'executor' && e.ev === 'notification:new' && e.type === 'EVENT_CANCELLED',
    );
    pass('3a. EVENT_CANCELLED reaches EXECUTOR via notification:new');
    await waitFor(
      'executor dedicated event:cancelled',
      (e) => e.socket === 'executor' && e.ev === 'event:cancelled',
    );
    pass('3b. dedicated event:cancelled channel reaches EXECUTOR');
  } catch (err) {
    fail('event lifecycle realtime (create/ready/cancel)', err);
  }

  // --- 4. EXECUTOR submits a return -> ADMIN notified live ----------------
  let returnId: string | null = null;
  try {
    const eventId = await createEventWithIssuedMaterial(adminCookie, execCookie);
    const returnable = await api(execCookie, 'GET', `/events/${eventId}/returns/returnable`);
    const line = (returnable?.data?.lines ?? []).find((l: Json) => l.returnableQuantity > 0);
    if (!line) throw new Error('no returnable line on the prepared event');
    const createdReturn = await api(execCookie, 'POST', `/events/${eventId}/returns`, {
      reason: 'EXTRA_MATERIAL',
      items: [{ foodItemId: line.foodItemId, quantity: 1 }],
    });
    returnId = createdReturn?.data?.return?.id ?? null;
    if (!returnId) throw new Error('no return id returned');
    log(`created return ${createdReturn?.data?.return?.returnCode}`);

    await waitFor(
      'admin dedicated material-return:created',
      (e) => e.socket === 'admin' && e.ev === 'material-return:created',
    );
    pass('4a. material-return:created reaches ADMIN in realtime');
    await waitFor(
      'admin notification:new RETURN_*',
      (e) => e.socket === 'admin' && e.ev === 'notification:new' && String(e.type).startsWith('RETURN_'),
    );
    pass('4b. RETURN_* notification reaches ADMIN in realtime');
  } catch (err) {
    fail('return submission realtime (executor -> admin)', err);
  }

  // --- 5. ADMIN rejects the return -> EXECUTOR notified live -------------
  try {
    if (!returnId) throw new Error('no return created in step 4');
    await api(adminCookie, 'POST', `/returns/${returnId}/reject`, { reason: 'Realtime verification run' });
    await waitFor(
      'executor dedicated material-return:rejected',
      (e) => e.socket === 'executor' && e.ev === 'material-return:rejected',
    );
    pass('5a. material-return:rejected reaches EXECUTOR in realtime');
    await waitFor(
      'executor notification:new RETURN_REJECTED',
      (e) => e.socket === 'executor' && e.ev === 'notification:new' && e.type === 'RETURN_REJECTED',
    );
    pass('5b. RETURN_REJECTED notification reaches EXECUTOR in realtime');
  } catch (err) {
    fail('return rejection realtime (admin -> executor)', err);
  }

  // --- 6. Logout revokes the session -> its socket is kicked -------------
  try {
    const kicked = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('executor socket still connected after logout')), 6000);
      execSock.once('disconnect', (reason) => {
        clearTimeout(timer);
        resolve(reason);
      });
    });
    await api(execCookie, 'POST', '/auth/logout');
    const reason = await kicked;
    if (reason !== 'io server disconnect') throw new Error(`unexpected disconnect reason: ${reason}`);
    pass('6. logout disconnects the session socket server-side');
  } catch (err) {
    fail('logout socket revocation', err);
  }

  adminSock.close();
  execSock.close();

  const failed = results.filter((r) => !r.ok);
  log(`\nRESULT: ${results.length - failed.length}/${results.length} realtime checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  log('FATAL', err);
  process.exit(1);
});
