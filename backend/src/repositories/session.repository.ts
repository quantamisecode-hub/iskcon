import type { Session, User } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { DbClient } from './user.repository.js';

/**
 * SESSION REPOSITORY
 * Stores/reads sessions by TOKEN HASH only (raw tokens never persisted).
 * `findValidByTokenHash` rejects revoked AND expired sessions in one query.
 */
export const sessionRepository = {
  async create(
    data: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    client: DbClient = prisma,
  ): Promise<Session> {
    return client.session.create({ data });
  },

  /** Valid = not revoked, not expired, user exists (join). */
  async findValidByTokenHash(tokenHash: string): Promise<(Session & { user: User }) | null> {
    return prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
  },

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return prisma.session.findUnique({ where: { tokenHash } });
  },

  async revoke(id: string, client: DbClient = prisma): Promise<Session> {
    return client.session.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  /** Revoke every session for a user except (optionally) the current one. Used on password change. */
  async revokeOthersForUser(
    userId: string,
    keepSessionId?: string,
    client: DbClient = prisma,
  ): Promise<number> {
    const result = await client.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },
};
