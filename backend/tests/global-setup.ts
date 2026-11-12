/**
 * GLOBAL TEST SETUP
 * Points the process at the DEDICATED test database FIRST, applies
 * migrations with a safe, non-destructive command (`prisma migrate
 * deploy`), then clears stale rows from previous runs. The development
 * or any shared database is never touched.
 */
import { execSync } from 'node:child_process';
import 'dotenv/config';
import getTestClient from './helpers/test-client.js';

export default async function setup(): Promise<void> {
  const testUrl = process.env['FIS_TEST_DATABASE_URL'];

  if (!testUrl) {
    throw new Error(
      'FIS_TEST_DATABASE_URL is required for tests. ' +
        'Set it in backend/.env (see backend/.env.example). Tests never run against the app database.',
    );
  }

  process.env['DATABASE_URL'] = testUrl;

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execSync(`${npx} prisma migrate deploy --schema prisma/schema.prisma`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  // Clean stale rows from previous runs (test DB only). The client is
  // constructed lazily NOW, after DATABASE_URL points at the test DB.
  const prisma = getTestClient();
  await prisma.eventMaterial.deleteMany();
  await prisma.eventDish.deleteMany();
  await prisma.dishMaterial.deleteMany();
  await prisma.event.deleteMany();
  await prisma.dish.deleteMany();
  await prisma.eventCodeCounter.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.foodItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adminExecutorAssignment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
}
