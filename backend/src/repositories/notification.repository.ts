import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

export const notificationRepository = {
  async listForUser(userId: string, input: { skip: number; take: number; unreadOnly?: boolean }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(input.unreadOnly ? { isRead: false } : {}),
    };
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: input.skip,
        take: input.take,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { notifications, total, unreadCount };
  },

  async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  },

  async markRead(id: string, userId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return result.count > 0;
  },

  async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  },

  async createOne(
    userId: string,
    data: {
      type: string;
      title: string;
      message: string;
      referenceType?: string | null;
      referenceId?: string | null;
      category?: string;
      priority?: string;
    },
  ) {
    return prisma.notification.create({
      data: {
        userId,
        type: data.type,
        category: data.category ?? 'GENERAL',
        priority: data.priority ?? 'NORMAL',
        title: data.title,
        message: data.message,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
      },
    });
  },

  async createMany(
    userIds: string[],
    data: {
      type: string;
      title: string;
      message: string;
      referenceType?: string | null;
      referenceId?: string | null;
      category?: string;
      priority?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? prisma;
    if (userIds.length === 0) return [];
    const created = [];
    for (const userId of userIds) {
      const row = await client.notification.create({
        data: {
          userId,
          type: data.type,
          category: data.category ?? 'GENERAL',
          priority: data.priority ?? 'NORMAL',
          title: data.title,
          message: data.message,
          referenceType: data.referenceType ?? null,
          referenceId: data.referenceId ?? null,
        },
      });
      created.push(row);
    }
    return created;
  },
};
