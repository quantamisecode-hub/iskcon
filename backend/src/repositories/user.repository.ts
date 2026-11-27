import type { Role } from '../constants/roles.js';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../config/database.js';

/** Re-exported so sibling repositories share the same client/reference. */
export { prisma };


/**
 * USER REPOSITORY
 * Reads a Prisma client explicitly (optional transaction client) so the
 * caller can include repository operations inside one atomic transaction.
 */
export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface CreateUserRecord {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export const userRepository = {
  async findByEmail(email: string, client: DbClient = prisma) {
    return client.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { permissions: true },
    });
  },

  async findById(id: string, client: DbClient = prisma) {
    return client.user.findUnique({
      where: { id },
      include: { permissions: true },
    });
  },

  async findMany(input: {
    where: Prisma.UserWhereInput;
    skip: number;
    take: number;
    client?: DbClient;
  }) {
    return (input.client ?? prisma).user.findMany({
      where: input.where,
      orderBy: { createdAt: 'desc' },
      skip: input.skip,
      take: input.take,
      include: { permissions: true },
    });
  },

  async count(where: Prisma.UserWhereInput, client: DbClient = prisma): Promise<number> {
    return client.user.count({ where });
  },

  async create(data: CreateUserRecord, client: DbClient = prisma): Promise<User> {
    return client.user.create({ data });
  },

  async update(
    id: string,
    data: Prisma.UserUpdateInput,
    client: DbClient = prisma,
  ): Promise<User> {
    return client.user.update({ where: { id }, data });
  },

  /** Number of active ADMIN accounts (guard against removing the last admin). */
  async countActiveAdmins(client: DbClient = prisma): Promise<number> {
    return client.user.count({ where: { role: 'ADMIN', isActive: true } });
  },
};
