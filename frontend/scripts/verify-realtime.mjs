
import { io } from 'socket.io-client';

const ORIGIN = 'http://localhost:5000';
const API = `${ORIGIN}/api/v1`;
const EVENT_ID = '86392505-b58c-4fa1-845f-5b2eaa192360'; // EVT-2026-000003 (has issued material)

const ADMIN = { email: 'vishnu@iskcon.com', password: 'ISKCON#2026!Admin1' };
const EXECUTOR = { email: 'qa-phase7@dev.local', password: 'DevExec#2026!Qa7' };

const CHANNELS = ['notification:new', 'event:cancelled', 'material-return:created', 'material-return:rejected'];
const inbox = [];

function log(...args) {
  console.log('[realtime-verify]', ...args);
}

async function login({ email, password }) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  if (!setCookie) throw new Error(`no session cookie returned for ${email}`);
  return setCookie.split(';')[0];
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function connectSocket(cookie, label) {
  return new Promise((resolve, reject) => {
    const socket = io(ORIGIN, { path: '/socket.io', extraHeaders: { cookie }, reconnection: false });
    const timer = setTimeout(() => reject(new Error(`${label}: socket connect timeout`)), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      for (const ev of CHANNELS) {
        socket.on(ev, (payload) => {
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

async function waitFor(description, predicate, timeoutMs = 6000) {
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

const results = [];
function pass(name) {
  results.push({ name, ok: true });
  log(`PASS  ${name}`);
}
function fail(name, err) {
  results.push({ name, ok: false, err: String(err?.message ?? err) });
  log(`FAIL  ${name} — ${err?.message ?? err}`);
}

async function ensureAssignment(adminCookie, executorEmail) {
  const list = await api(adminCookie, 'GET', '/assignments?activeOnly=true');
  const rows = list?.data?.assignments ?? [];
  const executor = await api(adminCookie, 'GET', `/users?search=${encodeURIComponent(executorEmail)}&pageSize=5`);
  const user = (executor?.data?.users ?? []).find((u) => u.email === executorEmail);
  if (!user) throw new Error(`executor ${executorEmail} not found`);
  const already = rows.some((r) => (r.executor?.id ?? r.executorId) === user.id && !r.endedAt);
  if (!already) {
    await api(adminCookie, 'POST', '/assignments', { executorId: user.id });
    log(`created assignment for ${executorEmail}`);
  }
  return user.id;
}

async function main() {
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
      eventDate: '2026-11-25',
      startTime: '10:00',
      numberOfPeople: 10,
      status: 'PLANNING',
    });
    const eventId = created?.data?.id;
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
  let returnId = null;
  try {
    const returnable = await api(execCookie, 'GET', `/events/${EVENT_ID}/returns/returnable`);
    const line = (returnable?.data?.lines ?? []).find((l) => l.returnableQuantity > 0);
    if (!line) throw new Error('no returnable line on EVT-2026-000003');
    const createdReturn = await api(execCookie, 'POST', `/events/${EVENT_ID}/returns`, {
      reason: 'EXTRA_MATERIAL',
      items: [{ foodItemId: line.foodItemId, quantity: 1 }],
    });
    returnId = createdReturn?.data?.return?.id;
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
