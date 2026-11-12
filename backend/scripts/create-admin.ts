/**
 * PRODUCTION — create or promote an ADMIN account.
 * Never seeds weak/default credentials.
 *
 * Usage (on the VPS, inside backend/):
 *   npx tsx scripts/create-admin.ts admin@example.org "StrongPass#1"
 *
 * Idempotent: if the email already exists, the account is promoted to
 * ADMIN and re-activated (password is NOT reset unless you pass one).
 * Password must satisfy the password policy (min 8 chars, letter + number/capital).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword, checkPasswordPolicy } from '../src/utils/password.js';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>');
    process.exit(1);
  }

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) {
    console.error(`Refusing weak password: ${policy.reason}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN', isActive: true, passwordHash },
    });
    console.log(`Promoted existing user to ADMIN and reset password: ${updated.email}`);
  } else {
    const created = await prisma.user.create({
      data: {
        id: randomUUID(),
        firstName: 'System',
        lastName: 'Administrator',
        email,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log(`Created production ADMIN: ${created.email}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
