import type { Category } from '@prisma/client';
import { prisma } from './user.repository.js';

export const categoryRepository = {
  async findAll(input: { where?: { isActive?: boolean }; take?: number; skip?: number }): Promise<Category[]> {
    return prisma.category.findMany({
      where: input.where,
      orderBy: { name: 'asc' },
      take: input.take,
      skip: input.skip,
    });
  },

  async findById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { id } });
  },

  async findByName(name: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { name } });
  },

  async create(data: { name: string; description?: string; isActive?: boolean }): Promise<Category> {
    return prisma.category.create({ data });
  },

  async update(id: string, data: { name?: string; description?: string; isActive?: boolean }): Promise<Category> {
    return prisma.category.update({ where: { id }, data });
  },

  async delete(id: string): Promise<Category> {
    return prisma.category.delete({ where: { id } });
  },

  async count(where: { isActive?: boolean }): Promise<number> {
    return prisma.category.count({ where });
  },
};