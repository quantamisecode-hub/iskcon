import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

export const dishRepository = {
  async findAll(input: { where: Prisma.DishWhereInput; skip: number; take: number }) {
    return prisma.dish.findMany({
      where: input.where,
      skip: input.skip,
      take: input.take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { materials: true, events: true } } },
    });
  },

  async count(where: Prisma.DishWhereInput): Promise<number> {
    return prisma.dish.count({ where });
  },

  async findById(id: string) {
    return prisma.dish.findUnique({
      where: { id },
      include: {
        materials: {
          include: { foodItem: { include: { unit: true } }, unit: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { events: true } },
      },
    });
  },

  async findByName(name: string) {
    return prisma.dish.findUnique({ where: { name } });
  },

  async create(data: { name: string; description?: string | null; isActive?: boolean }) {
    return prisma.dish.create({ data });
  },

  async update(id: string, data: Prisma.DishUpdateInput) {
    return prisma.dish.update({ where: { id }, data });
  },
};
