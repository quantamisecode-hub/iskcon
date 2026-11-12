import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, sendTestNotification, type NotificationItem } from '../features/notifications/api/notifications.api';
import { notificationActionLabel, notificationTarget } from '../features/notifications/notificationTarget';
import { Skeleton } from '../components/ui/Skeleton';
import { BellIcon, CheckIcon, CheckCircleIcon } from '../components/ui/icons';
import { connectRealtimeSocket, disconnectRealtimeSocket, type NotificationPayload } from '../services/realtime/socketClient';

const PAGE_SIZE = 25;

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [realtimeOn, setRealtimeOn] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testNotice, setTestNotice] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const unreadOnlyRef = useRef(unreadOnly);
  unreadOnlyRef.current = unreadOnly;

  // Real-time: prepend new notifications without a refresh.
  useEffect(() => {
    const listeners = {
      onNew(payload: NotificationPayload) {
        const incoming: NotificationItem = {
          id: payload.id,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          referenceType: payload.referenceType,
          referenceId: payload.referenceId,
          isRead: Boolean(payload.isRead),
          createdAt: payload.createdAt,
        };
        setItems((prev) => {
          if (prev.some((n) => n.id === incoming.id)) return prev;
          if (unreadOnlyRef.current && incoming.isRead) return prev;
          // On page 1 we can show it live; on later pages keep the list stable and bump total.
          if (pageRef.current === 1) return [incoming, ...prev];
          return prev;
        });
        setTotal((t) => t + 1);
        setUnreadCount((c) => c + 1);
        setRealtimeOn(true);
      },
    };
    connectRealtimeSocket(listeners);
    return () => disconnectRealtimeSocket(listeners);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchNotifications({ page, pageSize: PAGE_SIZE, unreadOnly });
      setItems(result.notifications);
      setTotal(result.total);
      setUnreadCount(result.unreadCount);
    } catch {
      setError('Unable to load notifications.');
    } finally {
      setIsLoading(false);
    }
  }, [page, unreadOnly, retryTick]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleMarkRead = async (item: NotificationItem) => {
    if (item.isRead) return;
    try {
      await markNotificationRead(item.id);
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // non-critical
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      await load();
    } catch {
      // non-critical
    }
  };

  const targetFor = (item: NotificationItem) => notificationTarget(item);
  const actionFor = (item: NotificationItem) => notificationActionLabel(item);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Inbox</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-secondary">
            Event, request and inventory alerts for your account{unreadCount > 0 ? ` — ${unreadCount} unread` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${realtimeOn ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-600'}`} title="Socket.IO realtime">
            <span className={`h-2 w-2 rounded-full ${realtimeOn ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {realtimeOn ? 'Live' : 'Connecting…'}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-secondary">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-4 w-4 accent-[#b84234]" />
            Unread only
          </label>
          <button
            type="button"
            disabled={testBusy}
            onClick={() => {
              setTestBusy(true);
              setTestNotice(null);
              void (async () => {
                try {
                  const n = await sendTestNotification();
                  setTestNotice(`Sent “${n.title}” — it should appear live in the list and the bell badge within 1 second.`);
                } catch (err) {
                  const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
                  setTestNotice(msg ?? 'Could not send test notification.');
                } finally {
                  setTestBusy(false);
                }
              })();
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark disabled:opacity-60"
          >
            <BellIcon className="h-4 w-4" />
            {testBusy ? 'Sending…' : 'Send test notification'}
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              className="inline-flex items-center gap-2 rounded-xl border border-border-strong/60 px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {testNotice && <div role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{testNotice}</div>}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryTick((t) => t + 1)} className="flex-none rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-danger transition hover:bg-red-100">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong/70 bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft/50">
            <BellIcon className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-ink">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-secondary">
            {unreadOnly ? 'Everything has been read.' : 'When someone submits a request, or a request is approved or rejected, you\'ll be notified here.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((item) => {
              const target = targetFor(item);
              const action = actionFor(item);
              const content = (
                <>
                  <span className={`mt-1 h-2 w-2 flex-none rounded-full ${item.isRead ? 'bg-border' : 'bg-primary'}`} aria-label={item.isRead ? 'Read' : 'Unread'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className={`text-sm ${item.isRead ? 'font-medium text-secondary' : 'font-bold text-ink'}`}>{item.title}</p>
                      <span className="flex-none text-[11px] tabular-nums text-muted">
                        {new Date(item.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-secondary">{item.message}</p>
                    {target && action && <span className="mt-2 inline-flex rounded-lg border border-primary/30 bg-primary-soft/40 px-2.5 py-1 text-xs font-bold text-primary">{action}</span>}
                  </div>
                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleMarkRead(item);
                      }}
                      aria-label="Mark as read"
                      className="flex-none rounded-lg border border-border-strong/60 p-2 text-secondary transition hover:border-primary hover:text-primary"
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                  )}
                </>
              );
              return (
                <li key={item.id} className={`rounded-2xl border p-4 shadow-sm transition ${item.isRead ? 'border-border bg-card' : 'border-primary/30 bg-primary-soft/20'}`}>
                  {target ? (
                    <Link to={target} className="flex gap-3" onClick={() => void handleMarkRead(item)}>{content}</Link>
                  ) : (
                    <div className="flex gap-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-secondary">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">← Prev</button>
              <span className="px-2 text-xs font-semibold tabular-nums text-secondary">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border border-border-strong/60 px-3 py-1.5 text-sm font-medium disabled:opacity-40">Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
