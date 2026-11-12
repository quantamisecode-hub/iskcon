import type { InventoryTransaction } from '@prisma/client';
import { prisma } from './user.repository.js';

export const inventoryTransactionRepository = {
  async create(data: {
    foodItemId: string;
    transactionType: string;
    quantity: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceType?: string;
    referenceId?: string;
    performedBy?: string;
    remarks?: string;
  }): Promise<InventoryTransaction> {
    return prisma.inventoryTransaction.create({ data });
  },

  async findByFoodItemId(foodItemId: string, input: { take?: number; skip?: number }): Promise<InventoryTransaction[]> {
    return prisma.inventoryTransaction.findMany({
      where: { foodItemId },
      take: input.take,
      skip: input.skip,
      orderBy: { createdAt: 'desc' },
    });
  },

  async findLastByFoodItemId(foodItemId: string): Promise<InventoryTransaction | null> {
    return prisma.inventoryTransaction.findFirst({
      where: { foodItemId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async listRecent(input: { take?: number }): Promise<InventoryTransaction[]> {
    return prisma.inventoryTransaction.findMany({
      take: input.take,
      orderBy: { createdAt: 'desc' },
    });
  },
};