import { useEffect, useState } from 'react';
import { connectRealtimeSocket, disconnectRealtimeSocket, type NotificationPayload } from '../services/realtime/socketClient';
import { fetchUnreadCount, markAllNotificationsRead as markAllNotificationsReadApi } from '../features/notifications/api/notifications.api';

/**
 * Single realtime subscription for the whole app.
 * Updates the unread badge count live (Socket.IO `notification:new` + stock alerts).
 * No bottom toasts — notifications surface through the bell dropdown (AppLayout),
 * which marks them read when opened.
 */
export function useRealtimeNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNotification, setLastNotification] = useState<NotificationPayload | null>(null);
  const [lastStockAlert, setLastStockAlert] = useState<{ title: string; detail: string; severity: string; at: string } | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadUnread = async () => {
      try {
        const count = await fetchUnreadCount();
        if (!cancelled) setUnreadCount(count);
      } catch {
        // non-critical
      }
    };
    void loadUnread();

    const listeners = {
      onNew(payload: NotificationPayload) {
        if (cancelled) return;
        setIsLive(true);
        setLastNotification(payload);
      },
      onStockAlert(payload: { title: string; detail: string; severity: string }) {
        if (cancelled) return;
        setIsLive(true);
        setLastStockAlert({ ...payload, at: new Date().toISOString() });
        // Stock alerts are ALSO persisted as inbox notifications (notification:new),
        // which already bumps the badge — do not double-count here.
      },
    };

    connectRealtimeSocket(listeners);
    return () => {
      cancelled = true;
      disconnectRealtimeSocket(listeners);
    };
  }, []);

  const refreshUnread = async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsReadApi();
      setUnreadCount(0);
      setLastNotification(null);
    } catch {
      // non-critical — badge will refresh next poll
    }
  };

  const incrementUnread = () => setUnreadCount((c) => c + 1);

  return { unreadCount, setUnreadCount, lastNotification, lastStockAlert, isLive, refreshUnread, markAllRead, incrementUnread };
}
