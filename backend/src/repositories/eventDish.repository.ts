import { prisma } from '../config/database.js';

export const eventDishRepository = {
  async findById(id: string) {
    return prisma.eventDish.findUnique({
      where: { id },
      include: {
        dish: true,
        event: { select: { id: true, status: true, adminId: true, createdBy: true, name: true } },
      },
    });
  },

  async findExisting(eventId: string, dishId: string) {
    return prisma.eventDish.findUnique({
      where: { eventId_dishId: { eventId, dishId } },
    });
  },

  async listByEvent(eventId: string) {
    return prisma.eventDish.findMany({
      where: { eventId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        dish: true,
        materials: {
          include: {
            foodItem: { include: { unit: true, inventory: true } },
            unit: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async maxDisplayOrder(eventId: string): Promise<number> {
    const result = await prisma.eventDish.aggregate({
      where: { eventId },
      _max: { displayOrder: true },
    });
    return result._max.displayOrder ?? 0;
  },

  async create(data: { eventId: string; dishId: string; displayOrder: number; notes?: string | null }) {
    return prisma.eventDish.create({
      data,
      include: { dish: true },
    });
  },

  async update(id: string, data: { displayOrder?: number; notes?: string | null }) {
    return prisma.eventDish.update({
      where: { id },
      data,
      include: { dish: true },
    });
  },

  async delete(id: string): Promise<void> {
    // Cascades to EventMaterial rows (event-owned planning data).
    await prisma.eventDish.delete({ where: { id } });
  },
};
