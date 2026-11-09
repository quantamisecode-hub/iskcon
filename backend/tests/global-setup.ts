/**
 * GLOBAL TEST SETUP
 * Applies migrations to the DEDICATED test database using a safe,
 * non-destructive command (`prisma migrate deploy`). This database is
 * test-only and may be REPLACED wholesale between runs - the development
 * or any shared database is never touched.
 */
import { execSync } from 'node:child_process';
import 'dotenv/config';
import prismaTest from './helpers/test-client.js';

export default async function setup(): Promise<void> {
  process.env['DATABASE_URL'] =
    process.env['FIS_TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];

  execSync('npx.cmd prisma migrate deploy --schema prisma/schema.prisma', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  // Clean stale rows from previous runs (test DB only).
  await prismaTest.auditLog.deleteMany();
  await prismaTest.adminExecutorAssignment.deleteMany();
  await prismaTest.session.deleteMany();
  await prismaTest.user.deleteMany();
  await prismaTest.$disconnect();
}
