import { prisma } from '../config/database.js';

/**
 * DishMaterial repository. recipe/template mapping only -
 * NO stock calculation is performed anywhere in this layer.
 */
export const dishMaterialRepository = {
  async findById(id: string) {
    return prisma.dishMaterial.findUnique({
      where: { id },
      include: {
        foodItem: { include: { unit: true } },
        unit: true,
      },
    });
  },

  async findExisting(dishId: string, foodItemId: string) {
    return prisma.dishMaterial.findUnique({
      where: { dishId_foodItemId: { dishId, foodItemId } },
    });
  },

  async listByDish(dishId: string) {
    return prisma.dishMaterial.findMany({
      where: { dishId },
      include: {
        foodItem: { include: { unit: true, inventory: true } },
        unit: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async create(data: {
    dishId: string;
    foodItemId: string;
    quantityPerPerson?: number | null;
    unitId: string;
  }) {
    return prisma.dishMaterial.create({
      data,
      include: {
        foodItem: { include: { unit: true } },
        unit: true,
      },
    });
  },

  async update(id: string, data: { quantityPerPerson?: number | null; unitId?: string }) {
    return prisma.dishMaterial.update({
      where: { id },
      data,
      include: {
        foodItem: { include: { unit: true } },
        unit: true,
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.dishMaterial.delete({ where: { id } });
  },
};
