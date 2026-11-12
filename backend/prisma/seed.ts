import 'dotenv/config';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import { randomUUID } from 'node:crypto';

/**
 * DEVELOPMENT SEED (labeled development-only data).
 *
 * Creates one ADMIN and one EXECUTOR dev account plus an active
 * Admin -> Executor assignment.
 * Optionally creates a second QA ADMIN + EXECUTOR pair (used by
 * scripts/verify-realtime.ts) when the QA_* variables are set.
 * Also creates Category, Unit, and Food Item seed data.
 * Initial inventory records with 100 units each.
 *
 * Passwords come ONLY from environment variables (backend/.env, git-ignored) - never hard-coded here.
 *
 * Run: npm run prisma:seed  (inside backend/; npm.cmd on Windows PowerShell)
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

const qaEnvSchema = z
  .object({
    QA_ADMIN_EMAIL: z.string().min(1),
    QA_ADMIN_PASSWORD: z.string().min(1),
    QA_EXECUTOR_EMAIL: z.string().min(1),
    QA_EXECUTOR_PASSWORD: z.string().min(1),
  })
  .strict();

const qaEnvSubset = {
  QA_ADMIN_EMAIL: process.env['QA_ADMIN_EMAIL'] ?? '',
  QA_ADMIN_PASSWORD: process.env['QA_ADMIN_PASSWORD'] ?? '',
  QA_EXECUTOR_EMAIL: process.env['QA_EXECUTOR_EMAIL'] ?? '',
  QA_EXECUTOR_PASSWORD: process.env['QA_EXECUTOR_PASSWORD'] ?? '',
};

// The QA pair is optional, but all-or-nothing: a half-configured pair is a mistake.
const qaConfigured = Object.values(qaEnvSubset).some((value) => value !== '');
const qaParsed = qaConfigured ? qaEnvSchema.safeParse(qaEnvSubset) : null;
if (qaParsed && !qaParsed.success) {
  console.error(
    'Seed failed: set all of QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, QA_EXECUTOR_EMAIL, QA_EXECUTOR_PASSWORD in backend/.env, or none of them.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function upsertUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'EXECUTOR';
}) {
  const email = input.email.toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: randomUUID(),
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
    },
  });
}

/** Active Admin -> Executor assignment (idempotent). */
async function ensureAssignment(adminId: string, executorId: string): Promise<void> {
  const existing = await prisma.adminExecutorAssignment.findFirst({
    where: { adminId, executorId, isActive: true },
  });
  if (!existing) {
    await prisma.adminExecutorAssignment.create({ data: { adminId, executorId } });
  }
}

async function main(): Promise<void> {
  // Notifications point at events/requests/returns by id (no FK), so they
  // would dangle once the events below are wiped.
  await prisma.notification.deleteMany();

  // Clear Phase 4 data first (FK-safe order), then Phase 3 data (idempotent).
  // Deleting events cascades to their material requests and returns.
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

  const { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD, DEV_EXECUTOR_EMAIL, DEV_EXECUTOR_PASSWORD } =
    parsed.data;

  const admin = await upsertUser({
    email: DEV_ADMIN_EMAIL,
    password: DEV_ADMIN_PASSWORD,
    firstName: 'Development',
    lastName: 'Admin',
    role: 'ADMIN',
  });
  const executor = await upsertUser({
    email: DEV_EXECUTOR_EMAIL,
    password: DEV_EXECUTOR_PASSWORD,
    firstName: 'Development',
    lastName: 'Executor',
    role: 'EXECUTOR',
  });
  await ensureAssignment(admin.id, executor.id);

  let qaUsers: { admin: { email: string }; executor: { email: string } } | null = null;
  if (qaParsed?.success) {
    const { QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD, QA_EXECUTOR_EMAIL, QA_EXECUTOR_PASSWORD } = qaParsed.data;
    const qaAdmin = await upsertUser({
      email: QA_ADMIN_EMAIL,
      password: QA_ADMIN_PASSWORD,
      firstName: 'Vishnu',
      lastName: 'Admin',
      role: 'ADMIN',
    });
    const qaExecutor = await upsertUser({
      email: QA_EXECUTOR_EMAIL,
      password: QA_EXECUTOR_PASSWORD,
      firstName: 'QA',
      lastName: 'Executor',
      role: 'EXECUTOR',
    });
    await ensureAssignment(qaAdmin.id, qaExecutor.id);
    qaUsers = { admin: qaAdmin, executor: qaExecutor };
  }

  // --- Categories ---
  const categoryNames = [
    'Rice & Grains',
    'Pulses',
    'Vegetables',
    'Dairy',
    'Oil & Ghee',
    'Spices',
    'Dry Fruits',
    'Flour',
  ];
  await prisma.category.createMany({
    data: categoryNames.map((name) => ({ name, isActive: true })),
    skipDuplicates: true,
  });

  // --- Units ---
  const unitData = [
    { name: 'Kilogram', symbol: 'KG', unitType: 'WEIGHT' },
    { name: 'Gram', symbol: 'G', unitType: 'WEIGHT' },
    { name: 'Litre', symbol: 'L', unitType: 'VOLUME' },
    { name: 'Millilitre', symbol: 'ML', unitType: 'VOLUME' },
    { name: 'Piece', symbol: 'PCS', unitType: 'COUNT' },
    { name: 'Packet', symbol: 'PKT', unitType: 'COUNT' },
    { name: 'Box', symbol: 'BOX', unitType: 'COUNT' },
    { name: 'Bag', symbol: 'BAG', unitType: 'COUNT' },
  ];
  await prisma.unit.createMany({
    data: unitData.map((u) => ({ name: u.name, symbol: u.symbol, unitType: u.unitType, isActive: true })),
    skipDuplicates: true,
  });

  // --- Food Items ---
  // Build lookup maps AFTER categories/units are seeded
  const categories = await prisma.category.findMany();
  const categoryMap: Record<string, string> = {};
  categories.forEach((c) => {
    categoryMap[c.name] = c.id;
  });

  const units = await prisma.unit.findMany();
  const unitMap: Record<string, string> = {};
  units.forEach((u) => {
    unitMap[u.symbol] = u.id;
  });

  const foodItemData = [
    { name: 'Rice', categoryName: 'Rice & Grains', unitSymbol: 'KG', minimumStock: 20, reorderLevel: 50 },
    { name: 'Wheat Flour', categoryName: 'Flour', unitSymbol: 'KG', minimumStock: 10, reorderLevel: 30 },
    { name: 'Toor Dal', categoryName: 'Pulses', unitSymbol: 'KG', minimumStock: 15, reorderLevel: 30 },
    { name: 'Moong Dal', categoryName: 'Pulses', unitSymbol: 'KG', minimumStock: 15, reorderLevel: 30 },
    { name: 'Sugar', categoryName: 'Oil & Ghee', unitSymbol: 'KG', minimumStock: 10, reorderLevel: 30 },
    { name: 'Milk', categoryName: 'Dairy', unitSymbol: 'L', minimumStock: 10, reorderLevel: 20 },
    { name: 'Cooking Oil', categoryName: 'Oil & Ghee', unitSymbol: 'L', minimumStock: 5, reorderLevel: 10 },
    { name: 'Potato', categoryName: 'Vegetables', unitSymbol: 'KG', minimumStock: 15, reorderLevel: 40 },
    { name: 'Tomato', categoryName: 'Vegetables', unitSymbol: 'KG', minimumStock: 15, reorderLevel: 30 },
    { name: 'Salt', categoryName: 'Spices', unitSymbol: 'PKT', minimumStock: 10, reorderLevel: 20 },
  ];

  // Create food items and their initial inventory
  for (const item of foodItemData) {
    const catId = categoryMap[item.categoryName];
    const unitId = unitMap[item.unitSymbol];
    const food = await prisma.foodItem.create({
      data: {
        name: item.name,
        description: `${item.name} for kitchen use`,
        categoryId: catId,
        unitId: unitId,
        minimumStock: item.minimumStock,
        reorderLevel: item.reorderLevel,
        isActive: true,
      },
    });
    // Create initial inventory record with 100 units
    await prisma.inventory.create({
      data: {
        foodItemId: food.id,
        currentQuantity: 100,
      },
    });
  }

  // --- Phase 4: Dishes (recipe templates; NO stock is deducted) ---
  const dishNames = ['Kheer', 'Dal', 'Sabji', 'Rice', 'Puri', 'Halwa', 'Khichdi', 'Sweet Rice'];
  await prisma.dish.createMany({
    data: dishNames.map((name) => ({
      name,
      description: `${name} — development sample dish`,
      isActive: true,
    })),
  });

  const allFoodItems = await prisma.foodItem.findMany();
  const foodByName = new Map(allFoodItems.map((f) => [f.name, f]));
  const allDishes = await prisma.dish.findMany();
  const dishByName = new Map(allDishes.map((d) => [d.name, d]));

  // DishMaterial reference templates (recipe hints — NOT auto-calculated in Phase 4)
  const dishTemplates: Array<{ dish: string; items: Array<{ food: string; perPerson: number }> }> = [
    { dish: 'Kheer', items: [{ food: 'Rice', perPerson: 0.05 }, { food: 'Milk', perPerson: 0.2 }, { food: 'Sugar', perPerson: 0.03 }] },
    { dish: 'Dal', items: [{ food: 'Toor Dal', perPerson: 0.06 }, { food: 'Cooking Oil', perPerson: 0.01 }] },
    { dish: 'Sabji', items: [{ food: 'Potato', perPerson: 0.08 }, { food: 'Tomato', perPerson: 0.02 }, { food: 'Cooking Oil', perPerson: 0.008 }] },
  ];
  for (const template of dishTemplates) {
    for (const item of template.items) {
      const dish = dishByName.get(template.dish);
      const food = foodByName.get(item.food);
      if (dish && food) {
        await prisma.dishMaterial.create({
          data: {
            dishId: dish.id,
            foodItemId: food.id,
            quantityPerPerson: item.perPerson,
            unitId: food.unitId,
          },
        });
      }
    }
  }

  // --- Phase 4: example event 'Mahaprasadam' (PLANNING, 500 people) ---
  const event = await prisma.event.create({
    data: {
      eventCode: 'EVT-2026-000001',
      name: 'Mahaprasadam',
      description: 'Development seed event — festival offering',
      eventDate: new Date('2026-11-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '14:00',
      numberOfPeople: 500,
      location: 'Temple Kitchen',
      notes: 'Development sample event',
      status: 'PLANNING',
      adminId: admin.id,
      createdBy: admin.id,
    },
  });
  await prisma.eventCodeCounter.upsert({
    where: { year: 2026 },
    create: { year: 2026, lastNumber: 1 },
    update: {},
  });

  const eventDishSeeds: Array<{ dish: string; order: number }> = [
    { dish: 'Kheer', order: 1 },
    { dish: 'Dal', order: 2 },
    { dish: 'Sabji', order: 3 },
  ];
  const createdEventDishes: Record<string, string> = {};
  for (const seed of eventDishSeeds) {
    const dish = dishByName.get(seed.dish);
    if (!dish) continue;
    const created = await prisma.eventDish.create({
      data: { eventId: event.id, dishId: dish.id, displayOrder: seed.order },
    });
    createdEventDishes[seed.dish] = created.id;
  }

  const materialSeeds: Array<{ dish: string; food: string; qty: number }> = [
    { dish: 'Kheer', food: 'Rice', qty: 25 },
    { dish: 'Kheer', food: 'Milk', qty: 100 },
    { dish: 'Kheer', food: 'Sugar', qty: 15 },
    { dish: 'Dal', food: 'Toor Dal', qty: 30 },
    { dish: 'Dal', food: 'Cooking Oil', qty: 5 },
    { dish: 'Sabji', food: 'Potato', qty: 40 },
    { dish: 'Sabji', food: 'Tomato', qty: 10 },
    { dish: 'Sabji', food: 'Cooking Oil', qty: 4 },
  ];
  for (const row of materialSeeds) {
    const food = foodByName.get(row.food);
    const eventDishId = createdEventDishes[row.dish];
    if (!food || !eventDishId) continue;
    await prisma.eventMaterial.create({
      data: {
        eventDishId,
        foodItemId: food.id,
        plannedQuantity: row.qty,
        unitId: food.unitId,
      },
    });
  }

  console.log('Seed complete (development-only accounts + inventory master + Phase 4 events):');
  console.log(`  ADMIN    ${admin.email}`);
  console.log(`  EXECUTOR ${executor.email}`);
  if (qaUsers) {
    console.log(`  QA ADMIN    ${qaUsers.admin.email}`);
    console.log(`  QA EXECUTOR ${qaUsers.executor.email}`);
  }
  const allCategories = await prisma.category.findMany();
  console.log(`  Categories: ${allCategories.map((c) => c.name).join(', ')}`);
  const allUnits = await prisma.unit.findMany();
  console.log(`  Units: ${allUnits.map((u) => u.symbol).join(', ')}`);
  const foods = await prisma.foodItem.findMany();
  console.log(`  Food items: ${foods.map((f) => f.name).join(', ')}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });