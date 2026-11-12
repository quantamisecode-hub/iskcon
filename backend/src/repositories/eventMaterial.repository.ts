import { prisma } from '../config/database.js';

/**
 * EventMaterial repository. PLANNING ONLY.
 * No inventory deduction, reservation, or transaction is ever created here.
 */
export const eventMaterialRepository = {
  async findById(id: string) {
    return prisma.eventMaterial.findUnique({
      where: { id },
      include: {
        foodItem: { include: { unit: true, inventory: true } },
        unit: true,
        eventDish: {
          include: {
            event: {
              select: { id: true, status: true, adminId: true, createdBy: true, name: true },
            },
          },
        },
      },
    });
  },

  async findExisting(eventDishId: string, foodItemId: string) {
    return prisma.eventMaterial.findUnique({
      where: { eventDishId_foodItemId: { eventDishId, foodItemId } },
    });
  },

  async listByEventDish(eventDishId: string) {
    return prisma.eventMaterial.findMany({
      where: { eventDishId },
      include: {
        foodItem: { include: { unit: true, inventory: true } },
        unit: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async create(data: {
    eventDishId: string;
    foodItemId: string;
    plannedQuantity: number;
    unitId: string;
    notes?: string | null;
    isDraft?: boolean;
  }) {
    return prisma.eventMaterial.create({
      data,
      include: {
        foodItem: { include: { unit: true, inventory: true } },
        unit: true,
      },
    });
  },

  async update(id: string, data: { plannedQuantity?: number; unitId?: string; notes?: string | null; isDraft?: boolean }) {
    return prisma.eventMaterial.update({
      where: { id },
      data,
      include: {
        foodItem: { include: { unit: true, inventory: true } },
        unit: true,
      },
    });
  },

  async delete(id: string): Promise<void> {
    await prisma.eventMaterial.delete({ where: { id } });
  },
};
