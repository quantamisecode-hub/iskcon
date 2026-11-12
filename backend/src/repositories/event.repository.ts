import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

export type EventWithRelations = Prisma.EventGetPayload<{
  include: {
    admin: { select: { id: true; firstName: true; lastName: true; email: true } };
    creator: { select: { id: true; firstName: true; lastName: true; email: true } };
    cancelledBy: { select: { id: true; firstName: true; lastName: true; email: true } };
    dishes: {
      include: {
        dish: true;
        materials: {
          include: {
            foodItem: {
              include: {
                unit: true;
                inventory: true;
              };
            };
            unit: true;
          };
        };
      };
    };
  };
}>;

export const eventRepository = {
  async findById(id: string): Promise<EventWithRelations | null> {
    return prisma.event.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true, email: true } },
        cancelledBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        dishes: {
          orderBy: { displayOrder: 'asc' },
          include: {
            dish: true,
            materials: {
              orderBy: { createdAt: 'asc' },
              include: {
                foodItem: { include: { unit: true, inventory: true } },
                unit: true,
              },
            },
          },
        },
      },
    });
  },

  /** Flat list + total for pagination. Scope filter is applied by the service. */
  async findMany(input: {
    where: Prisma.EventWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.EventOrderByWithRelationInput;
  }) {
    return prisma.event.findMany({
      where: input.where,
      skip: input.skip,
      take: input.take,
      orderBy: input.orderBy,
      include: {
        admin: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { dishes: true } },
      },
    });
  },

  async count(where: Prisma.EventWhereInput): Promise<number> {
    return prisma.event.count({ where });
  },

  /** Calendar projection: lean fields inside a date range. */
  async findForCalendar(where: Prisma.EventWhereInput) {
    return prisma.event.findMany({
      where,
      orderBy: [{ eventDate: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        eventCode: true,
        name: true,
        eventDate: true,
        startTime: true,
        endTime: true,
        numberOfPeople: true,
        status: true,
        location: true,
        adminId: true,
        _count: { select: { dishes: true } },
      },
    });
  },

  async create(data: {
    eventCode: string;
    name: string;
    description?: string | null;
    eventDate: Date;
    startTime: string;
    endTime?: string | null;
    numberOfPeople: number;
    location?: string | null;
    notes?: string | null;
    status?: 'DRAFT' | 'PLANNING' | 'READY' | 'COMPLETED' | 'CANCELLED';
    adminId: string;
    createdBy: string;
  }) {
    return prisma.event.create({
      data,
      include: {
        admin: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  },

  async update(id: string, data: Prisma.EventUpdateInput) {
    return prisma.event.update({ where: { id }, data });
  },

  async delete(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Event-owned planning rows are removed with the event (deepest first).
      // Dish masters, food items and inventory are NEVER touched.
      const dishIds = (
        await tx.eventDish.findMany({ where: { eventId: id }, select: { id: true } })
      ).map((d) => d.id);
      await tx.eventMaterial.deleteMany({ where: { eventDishId: { in: dishIds } } });
      await tx.eventDish.deleteMany({ where: { eventId: id } });
      await tx.event.delete({ where: { id } });
    });
  },

  /**
   * Atomic per-year code sequence. Caller must run inside a transaction.
   * Uses a native MySQL upsert: Prisma's fallback path (SELECT-then-INSERT)
   * races when two transactions request a code for the same year at once
   * (duplicate PRIMARY key). The row lock held until commit serialises
   * concurrent creators, so every event gets a unique code.
   */
  async nextEventCode(year: number, tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO \`EventCodeCounter\` (\`year\`, \`lastNumber\`)
      VALUES (${year}, 1)
      ON DUPLICATE KEY UPDATE \`lastNumber\` = \`lastNumber\` + 1
    `;
    const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
      SELECT \`lastNumber\` FROM \`EventCodeCounter\` WHERE \`year\` = ${year}
    `;
    const lastNumber = rows[0]?.lastNumber ?? 1;
    return `EVT-${year}-${String(lastNumber).padStart(6, '0')}`;
  },
};
