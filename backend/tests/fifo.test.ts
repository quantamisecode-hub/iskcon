import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import getTestClient from './helpers/test-client.js';
import { authService } from '../src/services/auth.service.js';
import { withDeadlockRetry } from '../src/lib/dbRetry.js';

type Num = string | number;
type LotRow = {
  lotNumber: string;
  quantityReceived: Num;
  quantityRemaining: Num;
  unitCost: Num | null;
  totalCost: Num | null;
  receivedDate: string;
  status: string;
};
type PreviewLine = { quantityAllocated: Num; unitCost: Num | null };

/**
 * FIFO LOT-BASED INVENTORY — ACCEPTANCE TESTS.
 * Real HTTP requests against the test database. No mocks.
 */
const app = createApp();
const prisma = getTestClient();

const createdUserIds: string[] = [];
const createdFoodItemIds: string[] = [];
const createdVendorIds: string[] = [];
let cookie = '';

async function createAdmin(): Promise<void> {
  const password = `ValidPass${randomUUID()}-fifo`;
  const user = await authService.createUserRecord({
    firstName: 'Fifo', lastName: 'Admin', email: `fifo-${randomUUID()}@example.test`, password, role: 'ADMIN',
  });
  createdUserIds.push(user.id);
  const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
  const setCookie = res.headers['set-cookie'];
  cookie = Array.isArray(setCookie) && setCookie.length > 0 ? String(setCookie[0]).split(';')[0] : '';
}

async function createItem(): Promise<string> {
  const category = await prisma.category.create({ data: { name: `FifoCat-${randomUUID()}` } });
  const unit = await prisma.unit.create({
    data: { name: `FifoUnit-${randomUUID()}`, symbol: `F${randomUUID().slice(0, 5).toUpperCase()}`, unitType: 'WEIGHT' },
  });
  const food = await prisma.foodItem.create({
    data: {
      name: `FifoRice-${randomUUID().slice(0, 8)}`,
      categoryId: category.id, unitId: unit.id, minimumStock: 1, reorderLevel: 1,
    },
  });
  createdFoodItemIds.push(food.id);
  await prisma.inventory.create({ data: { foodItemId: food.id, currentQuantity: 0 } });
  return food.id;
}

async function createVendor(name: string): Promise<string> {
  const v = await prisma.vendor.create({ data: { name: `${name}-${randomUUID().slice(0, 8)}` } });
  createdVendorIds.push(v.id);
  return v.id;
}

async function stockIn(itemId: string, body: Record<string, unknown>): Promise<request.Response> {
  return request(app).post(`/api/v1/food-items/${itemId}/stock-in`).set('Cookie', cookie).send(body);
}

async function stockOut(itemId: string, quantity: number, idempotencyKey?: string): Promise<request.Response> {
  const req = request(app)
    .post(`/api/v1/food-items/${itemId}/stock-out`)
    .set('Cookie', cookie)
    .send({ quantity, reason: 'FIFO acceptance test' });
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req;
}

async function lots(itemId: string) {
  const res = await request(app).get(`/api/v1/stock-lots?foodItemId=${itemId}&pageSize=100`).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body.data.lots as LotRow[];
}

async function allocations(itemId: string) {
  return prisma.stockAllocation.findMany({ where: { foodItemId: itemId }, orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }] });
}

async function stock(itemId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { foodItemId: itemId } });
  return Number(row?.currentQuantity ?? -1);
}

beforeAll(async () => {
  await createAdmin();
});

afterAll(async () => {
  await withDeadlockRetry(async () => {
    const items = createdFoodItemIds;
    await prisma.stockAllocation.deleteMany({ where: { foodItemId: { in: items } } });
    await prisma.inventoryTransaction.deleteMany({ where: { foodItemId: { in: items } } });
    await prisma.stockLot.deleteMany({ where: { foodItemId: { in: items } } });
    await prisma.inventory.deleteMany({ where: { foodItemId: { in: items } } });
    await prisma.foodItem.deleteMany({ where: { id: { in: items } } });
    await prisma.vendor.deleteMany({ where: { id: { in: createdVendorIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }, 5);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe('FIFO — lot creation & ordering', () => {
  it('three purchases create three lots with vendor/date/cost and oldest-first order', async () => {
    const item = await createItem();
    const a = await createVendor('Vendor A');
    const b = await createVendor('Vendor B');

    expect((await stockIn(item, { quantity: 100, vendorId: a, unitCost: 15, purchaseDate: '2026-11-01', receivedDate: '2026-11-01' })).status).toBe(200);
    expect((await stockIn(item, { quantity: 200, vendorId: b, unitCost: 20, purchaseDate: '2026-11-10', receivedDate: '2026-11-10' })).status).toBe(200);
    expect((await stockIn(item, { quantity: 150, vendorId: a, unitCost: 22, purchaseDate: '2026-11-18', receivedDate: '2026-11-18' })).status).toBe(200);

    const list = await lots(item);
    expect(list).toHaveLength(3);
    expect(list.map((l) => Number(l.quantityReceived))).toEqual([100, 200, 150]);
    expect(list.map((l) => Number(l.unitCost))).toEqual([15, 20, 22]);
    expect(list.map((l) => l.receivedDate.slice(0, 10))).toEqual(['2026-11-01', '2026-11-10', '2026-11-18']);
    expect(list[0].lotNumber).toMatch(/^LOT-\d{8}-\d{6}$/);
    expect(Number(list[0].totalCost)).toBe(1500);
    expect(await stock(item)).toBe(450);
  });
});

// ---------------------------------------------------------------------------
describe('FIFO — allocation scenarios from the specification', () => {
  it('preview is non-mutating and returns the oldest lots first', async () => {
    const item = await createItem();
    const a = await createVendor('Vendor A');
    const b = await createVendor('Vendor B');
    await stockIn(item, { quantity: 100, vendorId: a, unitCost: 15, receivedDate: '2026-11-01' });
    await stockIn(item, { quantity: 200, vendorId: b, unitCost: 20, receivedDate: '2026-11-10' });

    const before = await stock(item);
    const res = await request(app)
      .get(`/api/v1/fifo/preview?foodItemId=${item}&quantity=180`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(p.sufficient).toBe(true);
    expect(p.allocations.map((x: PreviewLine) => Number(x.quantityAllocated))).toEqual([100, 80]);
    expect(p.allocations.map((x: PreviewLine) => Number(x.unitCost))).toEqual([15, 20]);
    expect(Number(p.totalCost)).toBe(3100);
    expect(await stock(item)).toBe(before);
    expect(await allocations(item)).toHaveLength(0);
  });

  it('issues 180 KG as 100@15 + 80@20 and leaves 0 / 120 / 150', async () => {
    const item = await createItem();
    const a = await createVendor('Vendor A');
    const b = await createVendor('Vendor B');
    await stockIn(item, { quantity: 100, vendorId: a, unitCost: 15, receivedDate: '2026-11-01' });
    await stockIn(item, { quantity: 200, vendorId: b, unitCost: 20, receivedDate: '2026-11-10' });
    await stockIn(item, { quantity: 150, vendorId: a, unitCost: 22, receivedDate: '2026-11-18' });

    const res = await stockOut(item, 180);
    expect(res.status).toBe(200);
    const list = await lots(item);
    expect(list.map((l: LotRow) => Number(l.quantityRemaining))).toEqual([0, 120, 150]);
    expect(list.map((l: LotRow) => l.status)).toEqual(['CONSUMED', 'PARTIALLY_CONSUMED', 'AVAILABLE']);

    const alloc = await allocations(item);
    expect(alloc.map((x) => Number(x.quantityAllocated))).toEqual([100, 80]);
    expect(alloc.map((x) => Number(x.unitCost))).toEqual([15, 20]);
    expect(Number(alloc[0].totalCost) + Number(alloc[1].totalCost)).toBe(3100);
    expect(await stock(item)).toBe(270);
  });

  it('second issue of 200 KG consumes 120@20 + 80@22', async () => {
    const item = await createItem();
    const a = await createVendor('Vendor A');
    const b = await createVendor('Vendor B');
    await stockIn(item, { quantity: 100, vendorId: a, unitCost: 15, receivedDate: '2026-11-01' });
    await stockIn(item, { quantity: 200, vendorId: b, unitCost: 20, receivedDate: '2026-11-10' });
    await stockIn(item, { quantity: 150, vendorId: a, unitCost: 22, receivedDate: '2026-11-18' });
    await stockOut(item, 180);
    expect((await stockOut(item, 200)).status).toBe(200);

    const alloc = await allocations(item);
    const second = alloc.slice(2);
    expect(second.map((x) => Number(x.quantityAllocated))).toEqual([120, 80]);
    expect(second.map((x) => Number(x.unitCost))).toEqual([20, 22]);
    expect(Number(second[0].totalCost) + Number(second[1].totalCost)).toBe(4160);
    expect((await lots(item)).map((l: LotRow) => Number(l.quantityRemaining))).toEqual([0, 0, 70]);
  });

  it('new expensive lot does not jump the FIFO queue', async () => {
    const item = await createItem();
    const c = await createVendor('Vendor C');
    await stockIn(item, { quantity: 150, vendorId: c, unitCost: 22, receivedDate: '2026-11-18' });
    await stockIn(item, { quantity: 500, vendorId: c, unitCost: 25, receivedDate: '2026-11-22' });

    expect((await stockOut(item, 100)).status).toBe(200);
    const alloc = await allocations(item);
    expect(alloc.map((x) => Number(x.quantityAllocated))).toEqual([100]);
    expect(Number(alloc[0].unitCost)).toBe(22);
  });

  it('never consumes cheaper/newer lots out of order after multiple issues', async () => {
    const item = await createItem();
    const v = await createVendor('Vendor D');
    await stockIn(item, { quantity: 20, vendorId: v, unitCost: 15, receivedDate: '2026-11-01' });
    await stockIn(item, { quantity: 50, vendorId: v, unitCost: 20, receivedDate: '2026-11-02' });
    await stockIn(item, { quantity: 100, vendorId: v, unitCost: 22, receivedDate: '2026-11-03' });
    expect((await stockOut(item, 80)).status).toBe(200);
    expect((await allocations(item)).map((x) => Number(x.quantityAllocated))).toEqual([20, 50, 10]);
  });
});

// ---------------------------------------------------------------------------
describe('FIFO — safety, immutability, concurrency, idempotency', () => {
  it('rejects an over-request with no stock or allocation changes', async () => {
    const item = await createItem();
    const v = await createVendor('Vendor E');
    await stockIn(item, { quantity: 100, vendorId: v, unitCost: 15, receivedDate: '2026-11-01' });
    await stockIn(item, { quantity: 50, vendorId: v, unitCost: 20, receivedDate: '2026-11-02' });
    const before = await stock(item);
    const res = await stockOut(item, 180);
    expect(res.status).toBe(409);
    expect(await stock(item)).toBe(before);
    expect(await allocations(item)).toHaveLength(0);
  });

  it('historical allocation cost is immutable after a later purchase', async () => {
    const item = await createItem();
    const v = await createVendor('Vendor F');
    await stockIn(item, { quantity: 100, vendorId: v, unitCost: 15, receivedDate: '2026-11-01' });
    await stockOut(item, 60);
    const first = await allocations(item);
    expect(Number(first[0].unitCost)).toBe(15);
    await stockIn(item, { quantity: 100, vendorId: v, unitCost: 99, receivedDate: '2026-11-30' });
    const again = await allocations(item);
    expect(again).toHaveLength(1);
    expect(Number(again[0].unitCost)).toBe(15);
  });

  it('concurrent stock-outs never create negative inventory', async () => {
    const item = await createItem();
    const v = await createVendor('Vendor G');
    await stockIn(item, { quantity: 100, vendorId: v, unitCost: 15, receivedDate: '2026-11-01' });
    const results = await Promise.allSettled([stockOut(item, 80), stockOut(item, 50)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as Array<PromiseFulfilledResult<request.Response>>;
    const ok = fulfilled.filter((r) => r.value.status === 200);
    const rejected = fulfilled.filter((r) => r.value.status === 409);
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await stock(item)).toBeGreaterThanOrEqual(0);
    const total = (await allocations(item)).reduce((s, a) => s + Number(a.quantityAllocated), 0);
    expect(total).toBeLessThanOrEqual(100);
  });

  it('duplicate stock-out with the same idempotency key creates one movement', async () => {
    const item = await createItem();
    const v = await createVendor('Vendor H');
    await stockIn(item, { quantity: 100, vendorId: v, unitCost: 15, receivedDate: '2026-11-01' });
    const key = randomUUID();
    const [a, b] = await Promise.all([stockOut(item, 30, key), stockOut(item, 30, key)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const outRows = await prisma.inventoryTransaction.findMany({
      where: { foodItemId: item, transactionType: 'STOCK_OUT', idempotencyKey: key },
    });
    expect(outRows).toHaveLength(1);
    expect(await stock(item)).toBe(70);
  });

  it('supports fractional quantities with Decimal precision', async () => {
    const item = await createItem();
    const v = await createVendor('Vendor I');
    await stockIn(item, { quantity: 20.25, vendorId: v, unitCost: 10.5, receivedDate: '2026-11-01' });
    expect((await stockOut(item, 5.75)).status).toBe(200);
    expect(await stock(item)).toBeCloseTo(14.5, 3);
    const alloc = await allocations(item);
    expect(Number(alloc[0].unitCost)).toBe(10.5);
    expect(Number(alloc[0].totalCost)).toBeCloseTo(60.38, 2);
  });
});
