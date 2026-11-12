/**
 * One-off dev helper: creates (or resets) the QA executor account for manually
 * verifying the Phase 7 executor flow in the browser, assigned to the QA admin.
 * Credentials come from backend/.env (QA_ADMIN_EMAIL, QA_EXECUTOR_EMAIL,
 * QA_EXECUTOR_PASSWORD) — never hard-coded here.
 * Usage: npx tsx scripts/mint-qa-executor.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in backend/.env (see .env.example).`);
  return value;
}

async function main() {
  const adminEmail = requireEnv('QA_ADMIN_EMAIL').toLowerCase();
  const email = requireEnv('QA_EXECUTOR_EMAIL').toLowerCase();
  const password = requireEnv('QA_EXECUTOR_PASSWORD');
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error(`Admin ${adminEmail} not found in dev DB — run npm run prisma:seed.`);

  const hashed = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      firstName: 'QA',
      lastName: 'Executor',
      email,
      passwordHash: hashed,
      role: 'EXECUTOR',
      isActive: true,
    },
    update: { passwordHash: hashed, role: 'EXECUTOR', isActive: true },
  });

  const existing = await prisma.adminExecutorAssignment.findFirst({
    where: { adminId: admin.id, executorId: user.id, isActive: true },
  });
  if (!existing) {
    await prisma.adminExecutorAssignment.create({
      data: { adminId: admin.id, executorId: user.id },
    });
  }

  console.log(`QA executor ready: ${email} (id=${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
