import 'dotenv/config';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import { randomUUID } from 'node:crypto';

/**
 * DEVELOPMENT SEED (labeled development-only data).
 *
 * Creates one ADMIN and one EXECUTOR dev account plus an active
 * Admin -> Executor assignment. Passwords come ONLY from environment
 * variables (backend/.env, git-ignored) - never hard-coded here.
 *
 * Run: npm.cmd run prisma:seed  (inside backend/)
 */

const seedEnvSchema = z
  .object({
    DEV_ADMIN_EMAIL: z.string().min(1),
    DEV_ADMIN_PASSWORD: z.string().min(1),
    DEV_EXECUTOR_EMAIL: z.string().min(1),
    DEV_EXECUTOR_PASSWORD: z.string().min(1),
  })
  .strict();

const seedEnvSubset = {
  DEV_ADMIN_EMAIL: process.env['DEV_ADMIN_EMAIL'] ?? '',
  DEV_ADMIN_PASSWORD: process.env['DEV_ADMIN_PASSWORD'] ?? '',
  DEV_EXECUTOR_EMAIL: process.env['DEV_EXECUTOR_EMAIL'] ?? '',
  DEV_EXECUTOR_PASSWORD: process.env['DEV_EXECUTOR_PASSWORD'] ?? '',
};

const parsed = seedEnvSchema.safeParse(seedEnvSubset);
if (!parsed.success) {
  console.error(
    'Seed failed: set DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD, DEV_EXECUTOR_EMAIL, DEV_EXECUTOR_PASSWORD in backend/.env (see .env.example).',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD, DEV_EXECUTOR_EMAIL, DEV_EXECUTOR_PASSWORD } =
    parsed.data;

  const admin = await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL.toLowerCase() },
    update: {}, // do NOT reset an existing admin's password silently
    create: {
      id: randomUUID(),
      firstName: 'Development',
      lastName: 'Admin',
      email: DEV_ADMIN_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(DEV_ADMIN_PASSWORD),
      role: 'ADMIN',
    },
  });

  const executor = await prisma.user.upsert({
    where: { email: DEV_EXECUTOR_EMAIL.toLowerCase() },
    update: {},
    create: {
      id: randomUUID(),
      firstName: 'Development',
      lastName: 'Executor',
      email: DEV_EXECUTOR_EMAIL.toLowerCase(),
      passwordHash: await hashPassword(DEV_EXECUTOR_PASSWORD),
      role: 'EXECUTOR',
    },
  });

  // Active Admin -> Executor assignment (idempotent).
  const existing = await prisma.adminExecutorAssignment.findFirst({
    where: { adminId: admin.id, executorId: executor.id, isActive: true },
  });
  if (!existing) {
    await prisma.adminExecutorAssignment.create({
      data: { adminId: admin.id, executorId: executor.id },
    });
  }

  console.log('Seed complete (development-only accounts):');
  console.log(`  ADMIN    ${admin.email}`);
  console.log(`  EXECUTOR ${executor.email}`);
  console.log(`  Assignment: active (history preserved on future changes)`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
