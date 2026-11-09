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
  const testUrl =
    process.env['FIS_TEST_DATABASE_URL'] ??
    'mysql://food_inventory_user:FisApp_2026!zK9mQ2vX7wR4@localhost:3306/food_inventory_test';
  process.env['DATABASE_URL'] = testUrl;

  execSync('npx.cmd prisma migrate deploy --schema prisma/schema.prisma', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  // Clean stale rows from previous runs (test DB only). The client is
  // constructed lazily NOW, after DATABASE_URL points at the test DB.
  const prisma = getTestClient();
  await prisma.auditLog.deleteMany();
  await prisma.adminExecutorAssignment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
}
