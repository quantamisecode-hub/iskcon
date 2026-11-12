import type { FoodItem, Prisma } from '@prisma/client';
import { prisma } from './user.repository.js';

export const foodItemRepository = {
  async findAll(input: {
    where?: Prisma.FoodItemWhereInput;
    skip: number;
    take: number;
  }): Promise<(FoodItem & { unit: { name: string; symbol: string }; category: { name: string }; inventory: { currentQuantity: number } | null })[]> {
    return prisma.foodItem.findMany({
      where: input.where,
      skip: input.skip,
      take: input.take,
      orderBy: { name: 'asc' },
      // Unit + current stock embedded for read-only dropdowns (planning UI).
      include: { unit: true, inventory: true, category: true },
    });
  },

  async findById(id: string) {
    // Include masters so callers get real names for audit logs / display.
    return prisma.foodItem.findUnique({ where: { id }, include: { category: true, unit: true } });
  },

  async findByName(name: string): Promise<FoodItem | null> {
    return prisma.foodItem.findUnique({ where: { name } });
  },

  async create(data: {
    name: string;
    description?: string | null;
    categoryId: string;
    unitId: string;
    minimumStock: number;
    reorderLevel: number;
    isActive?: boolean;
  }) {
    return prisma.foodItem.create({ data });
  },

  async update(id: string, data: {
    name?: string;
    description?: string | null;
    categoryId?: string;
    unitId?: string;
    minimumStock?: number;
    reorderLevel?: number;
    isActive?: boolean;
  }) {
    // Include masters so callers can audit with real names, not undefined.
    return prisma.foodItem.update({ where: { id }, data, include: { category: true, unit: true } });
  },

  async delete(id: string) {
    return prisma.foodItem.delete({ where: { id } });
  },

  async count(where: Prisma.FoodItemWhereInput): Promise<number> {
    return prisma.foodItem.count({ where });
  },
};
