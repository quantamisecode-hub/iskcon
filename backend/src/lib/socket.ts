import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { hashSessionToken } from '../utils/tokens.js';
import { toSafeUser } from '../utils/safeUser.js';

/**
 * Socket.IO realtime layer.
 *
 * Transport only — no business logic lives here. The DB remains the source of truth.
 * Every socket is authenticated with the same HttpOnly session cookie as REST.
 * Clients join three rooms automatically:
 *  - user:<id>       for direct notifications (material-request decisions, etc.)
 *  - role:<ADMIN|EXECUTOR>  for broadcasts (stock alerts)
 *  - session:<id>    so a revoked session can be kicked off immediately
 *
 * Auth is only checked at handshake, so every code path that revokes a
 * session or deactivates a user must also call disconnectSession/disconnectUser.
 */
export const SOCKET_EVENT = {
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_UNREAD: 'notification:unread',
  MATERIAL_REQUEST_CREATED: 'material-request:created',
  MATERIAL_REQUEST_SUBMITTED: 'material-request:submitted',
  MATERIAL_REQUEST_APPROVED: 'material-request:approved',
  MATERIAL_REQUEST_REJECTED: 'material-request:rejected',
  MATERIAL_REQUEST_CANCELLED: 'material-request:cancelled',
  MATERIAL_REQUEST_ISSUED: 'material-request:issued',
  MATERIAL_REQUEST_PARTIALLY_ISSUED: 'material-request:partially-issued',
  EVENT_CANCELLED: 'event:cancelled',
  MATERIAL_RETURN_CREATED: 'material-return:created',
  MATERIAL_RETURN_ACCEPTED: 'material-return:accepted',
  MATERIAL_RETURN_PARTIALLY_ACCEPTED: 'material-return:partially-accepted',
  MATERIAL_RETURN_REJECTED: 'material-return:rejected',
  STOCK_ALERT: 'stock:alert',
} as const;

type SocketData = {
  userId: string;
  sessionId: string;
  role: 'ADMIN' | 'EXECUTOR';
};

let io: SocketIOServer | null = null;

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return undefined;
}

export function initSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
    },
    // Expose the handshake so clients can send credentials and retries stay cheap.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  io.use(async (socket: Socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie;
      // Primary path: HttpOnly session cookie (browser, withCredentials).
      const cookieToken = parseCookie(rawCookie, env.SESSION_COOKIE_NAME);
      // Fallback for non-browser clients (Node tests, server-to-server):
      // auth: { token } may carry the raw session token. Browsers never use
      // this. A ?token= query is deliberately NOT accepted: URLs end up in
      // proxy/access logs, which would leak live session tokens.
      const authToken = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
      const token = cookieToken ?? authToken;
      logger.debug({
        hasCookie: Boolean(rawCookie),
        hasAuthToken: Boolean(authToken),
      }, 'Socket handshake seen');
      if (!token) {
        next(new Error('Authentication required.'));
        return;
      }
      const session = await sessionRepository.findValidByTokenHash(hashSessionToken(token));
      if (!session || !session.user.isActive) {
        logger.info({ sessionFound: Boolean(session) }, 'Socket auth: session invalid');
        next(new Error('Authentication required.'));
        return;
      }
      const safe = toSafeUser(session.user);
      socket.data.userId = safe.id;
      socket.data.sessionId = session.id;
      socket.data.role = safe.role as 'ADMIN' | 'EXECUTOR';
      next();
    } catch (err) {
      logger.error({ err }, 'Socket auth failed');
      next(new Error('Authentication required.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    void socket.join(`user:${data.userId}`);
    void socket.join(`role:${data.role}`);
    void socket.join(`session:${data.sessionId}`);
    logger.debug({ userId: data.userId, role: data.role }, 'Socket connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ userId: data.userId, reason }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO realtime initialized at /socket.io');
  return io;
}

export function getSocket() {
  if (!io) throw new Error('Socket.IO not initialized. Call initSocket() from server.ts first.');
  return io;
}

/** Emit a single notification to one user (room user:<id>). */
export function emitNotification(userId: string, notification: unknown) {
  if (!io) return;
  io.to(`user:${userId}`).emit(SOCKET_EVENT.NOTIFICATION_NEW, notification);
}

/** Emit any lifecycle event to one user (room user:<id>). */
export function emitToUser(event: string, userId: string, payload: unknown) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/** Emit to every member of one role room (e.g. stock alerts to all ADMINs). */
export function emitToRole(role: 'ADMIN' | 'EXECUTOR', event: string, payload: unknown) {
  if (!io) return;
  io.to(`role:${role}`).emit(event, payload);
}

/** Force-disconnect every socket opened with one session (logout / revocation). */
export function disconnectSession(sessionId: string) {
  if (!io) return;
  io.in(`session:${sessionId}`).disconnectSockets(true);
}

/**
 * Force-disconnect a user's sockets (deactivation, password reset, deletion).
 * `exceptSessionId` keeps the caller's own session connected (change-password).
 */
export function disconnectUser(userId: string, exceptSessionId?: string) {
  if (!io) return;
  const target = io.in(`user:${userId}`);
  (exceptSessionId ? target.except(`session:${exceptSessionId}`) : target).disconnectSockets(true);
}

/** Move a user's live sockets to their new role room after a role change. */
export function setUserRoleRoom(userId: string, role: 'ADMIN' | 'EXECUTOR') {
  if (!io) return;
  const target = io.in(`user:${userId}`);
  target.socketsLeave(['role:ADMIN', 'role:EXECUTOR']);
  target.socketsJoin(`role:${role}`);
}

/** Convenience for material-request lifecycle broadcasts. */
export function emitMaterialRequest(event: string, targetUserId: string, payload: unknown) {
  if (!io) return;
  io.to(`user:${targetUserId}`).emit(event, payload);
}
