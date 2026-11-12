import { io, type Socket } from 'socket.io-client';
import { apiOrigin } from '../../config/env';

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

export type NotificationPayload = {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceType?: string | null;
  referenceId?: string | null;
  isRead?: boolean;
  createdAt: string;
};

export type NotificationListeners = {
  onNew?: (payload: NotificationPayload) => void;
  onUnread?: (count: number) => void;
  onMaterialRequest?: (event: string, payload: unknown) => void;
  /**
   * Event / return lifecycle events (`event:cancelled`, `material-return:*`).
   * Payloads: `{ eventId }` for events, `{ returnId, returnCode, status }`
   * for returns — open detail pages use this to live-refresh.
   */
  onLifecycle?: (event: string, payload: unknown) => void;
  onStockAlert?: (payload: { severity: 'danger' | 'warning' | 'info'; title: string; detail: string; type: string; foodItemId?: string }) => void;
};

let socket: Socket | null = null;
const listeners = new Set<NotificationListeners>();

function getSocketUrl(): string {
  // VITE_API_URL includes /api/v1; Socket.IO is served from the origin root.
  // apiOrigin is validated at startup, so no hard-coded fallback is needed.
  return apiOrigin;
}

export function connectRealtimeSocket(listenersInput?: NotificationListeners): Socket {
  if (listenersInput) listeners.add(listenersInput);

  if (socket && socket.connected) return socket;

  if (!socket) {
    socket = io(getSocketUrl(), {
      path: '/socket.io',
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    const dispatch = (handler?: (p: NotificationPayload) => void, payload?: NotificationPayload) => {
      if (!handler || !payload) return;
      handler(payload);
    };

    socket.on(SOCKET_EVENT.NOTIFICATION_NEW, (payload: NotificationPayload) => {
      for (const l of listeners) {
        dispatch(l.onNew, payload);
        if (l.onMaterialRequest) l.onMaterialRequest(SOCKET_EVENT.NOTIFICATION_NEW, payload);
      }
    });
    socket.on('notification:unread', (count: number) => {
      for (const l of listeners) l.onUnread?.(count);
    });
    for (const ev of [
      SOCKET_EVENT.MATERIAL_REQUEST_SUBMITTED,
      SOCKET_EVENT.MATERIAL_REQUEST_APPROVED,
      SOCKET_EVENT.MATERIAL_REQUEST_REJECTED,
      SOCKET_EVENT.MATERIAL_REQUEST_CANCELLED,
      SOCKET_EVENT.MATERIAL_REQUEST_ISSUED,
      SOCKET_EVENT.MATERIAL_REQUEST_PARTIALLY_ISSUED,
    ] as const) {
      socket.on(ev, (payload: unknown) => {
        for (const l of listeners) l.onMaterialRequest?.(ev, payload);
      });
    }
    // Event + return lifecycle: lets an open detail page refresh itself the
    // moment another session cancels the event or reviews the return.
    for (const ev of [
      SOCKET_EVENT.EVENT_CANCELLED,
      SOCKET_EVENT.MATERIAL_RETURN_CREATED,
      SOCKET_EVENT.MATERIAL_RETURN_ACCEPTED,
      SOCKET_EVENT.MATERIAL_RETURN_PARTIALLY_ACCEPTED,
      SOCKET_EVENT.MATERIAL_RETURN_REJECTED,
    ] as const) {
      socket.on(ev, (payload: unknown) => {
        for (const l of listeners) l.onLifecycle?.(ev, payload);
      });
    }
    socket.on(SOCKET_EVENT.STOCK_ALERT, (payload: { severity: 'danger' | 'warning' | 'info'; title: string; detail: string; type: string; foodItemId?: string }) => {
      for (const l of listeners) l.onStockAlert?.(payload);
    });

    socket.on('connect', () => {
      console.debug('[realtime] socket connected', socket?.id);
    });
    socket.on('disconnect', (reason) => {
      console.debug('[realtime] socket disconnected', reason);
    });
    socket.on('connect_error', (err) => {
      console.debug('[realtime] connect_error', err.message);
    });
  }

  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectRealtimeSocket(listener?: NotificationListeners) {
  if (listener) listeners.delete(listener);
  if (listeners.size === 0 && socket) {
    socket.disconnect();
  }
}

export function onRealtime<T extends keyof NotificationListeners>(event: T, handler: NonNullable<NotificationListeners[T]>) {
  const entry = { [event]: handler } as NotificationListeners;
  connectRealtimeSocket(entry);
  return () => listeners.delete(entry);
}
