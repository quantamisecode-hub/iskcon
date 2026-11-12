import type { Inventory } from '@prisma/client';
import { prisma } from './user.repository.js';

export const inventoryRepository = {
  async findByFoodItemId(foodItemId: string): Promise<Inventory | null> {
    return prisma.inventory.findUnique({ where: { foodItemId } });
  },

  async findAll(input: { take?: number; skip?: number }): Promise<Inventory[]> {
    return prisma.inventory.findMany({
      take: input.take,
      skip: input.skip,
      orderBy: { updatedAt: 'desc' },
    });
  },

  async updateQuantity(foodItemId: string, newQuantity: number): Promise<Inventory> {
    return prisma.inventory.upsert({
      where: { foodItemId },
      update: { currentQuantity: newQuantity },
      create: { foodItemId, currentQuantity: newQuantity },
    });
  },

  async incrementQuantity(foodItemId: string, amount: number): Promise<Inventory> {
    const existing = await prisma.inventory.findUnique({ where: { foodItemId } });
    const newQty = (existing?.currentQuantity ?? 0) + amount;
    return prisma.inventory.upsert({
      where: { foodItemId },
      update: { currentQuantity: newQty },
      create: { foodItemId, currentQuantity: newQty },
    });
  },

  async decrementQuantity(foodItemId: string, amount: number): Promise<Inventory> {
    const existing = await prisma.inventory.findUnique({ where: { foodItemId } });
    const newQty = Math.max(0, (existing?.currentQuantity ?? 0) - amount);
    return prisma.inventory.upsert({
      where: { foodItemId },
      update: { currentQuantity: newQty },
      create: { foodItemId, currentQuantity: newQty },
    });
  },
};