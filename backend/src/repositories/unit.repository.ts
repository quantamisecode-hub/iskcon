import type { Unit } from '@prisma/client';
import { prisma } from './user.repository.js';

export const unitRepository = {
  async findAll(input: { where?: { isActive?: boolean }; take?: number; skip?: number }): Promise<Unit[]> {
    return prisma.unit.findMany({
      where: input.where,
      orderBy: { name: 'asc' },
      take: input.take,
      skip: input.skip,
    });
  },

  async findById(id: string): Promise<Unit | null> {
    return prisma.unit.findUnique({ where: { id } });
  },

  async findBySymbol(symbol: string): Promise<Unit | null> {
    return prisma.unit.findUnique({ where: { symbol } });
  },

  async findByName(name: string): Promise<Unit | null> {
    return prisma.unit.findUnique({ where: { name } });
  },

  async create(data: { name: string; symbol: string; unitType: string; isActive?: boolean }): Promise<Unit> {
    return prisma.unit.create({ data });
  },

  async update(id: string, data: { name?: string; symbol?: string; unitType?: string; isActive?: boolean }): Promise<Unit> {
    return prisma.unit.update({ where: { id }, data });
  },

  async count(where: { isActive?: boolean }): Promise<number> {
    return prisma.unit.count({ where });
  },
};