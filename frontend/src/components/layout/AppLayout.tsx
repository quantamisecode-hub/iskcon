import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '../../features/notifications/api/notifications.api';
import { notificationActionLabel, notificationTarget } from '../../features/notifications/notificationTarget';
import { PageLoader } from '../common/PageLoader';
import { NAV_ITEMS } from '../../constants/navItems';
import { Sidebar } from './Sidebar';
import { PageTransitionBar } from './PageTransitionBar';
import { MenuIcon, BellIcon } from '../ui/icons';

/**
 * Authenticated application shell — ISKCON-branded sidebar layout.
 *  - Desktop: persistent collapsible sidebar (expanded ↔ icon rail).
 *  - Mobile: slim header with menu button; sidebar slides in as a drawer.
 *
 * Notifications: the bell opens a dropdown panel (no bottom toasts).
 * Opening the panel marks everything as read by default, so the badge clears.
 * Navigation here is UX — the backend independently enforces every rule.
 */
export function AppLayout() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, setUnreadCount, lastNotification, lastStockAlert, refreshUnread, markAllRead, incrementUnread } = useRealtimeNotifications();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('iskcon.sidebar.collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Bell dropdown
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelItems, setPanelItems] = useState<NotificationItem[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelOpenRef = useRef(false);
  panelOpenRef.current = panelOpen;
  const lastSeenId = useRef<string | null>(null);

  // Refresh the badge whenever we land on the notifications page.
  useEffect(() => {
    if (location.pathname === '/notifications') void refreshUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // New realtime notifications update the badge (or the open panel).
  useEffect(() => {
    if (!lastNotification) return;
    if (lastSeenId.current === lastNotification.id) return;
    lastSeenId.current = lastNotification.id;
    const incoming: NotificationItem = {
      id: lastNotification.id,
      type: lastNotification.type,
      title: lastNotification.title,
      message: lastNotification.message,
      referenceType: lastNotification.referenceType ?? null,
      referenceId: lastNotification.referenceId ?? null,
      isRead: panelOpenRef.current,
      createdAt: lastNotification.createdAt,
    };
    if (panelOpenRef.current) {
      // Panel open: show live as read (opened = seen), keep badge at 0. Mark read server-side.
      setPanelItems((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev].slice(0, 12)));
      setUnreadCount(0);
      void markNotificationRead(incoming.id).catch(() => undefined);
    } else {
      incrementUnread();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNotification]);

  // Stock alerts are persisted as inbox notifications (notification:new) by the backend,
  // so they arrive through lastNotification above — no synthetic rows needed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void lastStockAlert;
  }, [lastStockAlert]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  const openPanel = useCallback(async () => {
    setPanelOpen(true);
    setPanelError(null);
    setPanelLoading(true);
    try {
      const result = await fetchNotifications({ page: 1, pageSize: 10 });
      // Opening the bell marks everything as read by default.
      setPanelItems(result.notifications.map((n) => ({ ...n, isRead: true })));
      void markAllNotificationsRead()
        .catch(() => undefined)
        .finally(() => setUnreadCount(0));
      void markAllRead().catch(() => undefined);
    } catch {
      setPanelError('Unable to load notifications.');
    } finally {
      setPanelLoading(false);
    }
  }, [markAllRead, setUnreadCount]);

  useEffect(() => {
    try {
      window.localStorage.setItem('iskcon.sidebar.collapsed', String(collapsed));
    } catch {
      /* private mode */
    }
  }, [collapsed]);

  if (status === 'loading' || !user) {
    return <PageLoader label="Loading your session…" />;
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  const currentSection =
    NAV_ITEMS.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))?.label ??
    'Food Inventory';

  const targetFor = (item: NotificationItem) => notificationTarget(item);
  const actionFor = (item: NotificationItem) => notificationActionLabel(item);

  return (
    <div className="min-h-screen bg-background">
      <PageTransitionBar />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className={`flex min-h-screen flex-col transition-[padding] duration-300 ease-in-out ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
        {/* Slim utility header */}
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                aria-expanded={mobileOpen}
                aria-controls="mobile-sidebar"
                className="rounded-xl border border-border-strong/60 p-2 text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:hidden"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <div className="min-w-0 leading-tight">
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-primary">ISKCON · Food Inventory</p>
                <h1 className="truncate text-sm font-bold text-ink">{currentSection}</h1>
              </div>
            </div>
            <div className="flex flex-none items-center gap-3 text-sm">
              <Link
                to="/profile"
                aria-label="Open your profile"
                title="Edit profile"
                className="group hidden items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:flex"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
                  >
                    {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                  </span>
                )}
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-bold text-ink transition group-hover:text-primary">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider text-primary-deep">
                    {user.role}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-xl border border-border-strong/60 px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Log out
              </button>
              {/* Bell — opens dropdown panel; opening marks all read */}
              <div ref={panelRef} className="relative">
                <button
                  type="button"
                  aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
                  aria-haspopup="true"
                  aria-expanded={panelOpen}
                  title="Notifications"
                  onClick={() => (panelOpen ? setPanelOpen(false) : void openPanel())}
                  className="relative rounded-xl p-2 text-secondary transition hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <BellIcon className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span
                      aria-label={`${unreadCount} unread`}
                      className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60 motion-reduce:animate-none" aria-hidden="true" />
                      <span className="relative">{unreadCount > 99 ? '99+' : unreadCount}</span>
                    </span>
                  )}
                </button>

                {panelOpen && (
                  <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-2rem))] animate-card-in overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary">Notifications</p>
                      <Link to="/notifications" onClick={() => setPanelOpen(false)} className="text-xs font-bold text-primary hover:underline">View all →</Link>
                    </div>
                    {panelLoading ? (
                      <div className="space-y-2 p-4">
                        <div className="h-14 animate-pulse rounded-xl bg-background" />
                        <div className="h-14 animate-pulse rounded-xl bg-background" />
                      </div>
                    ) : panelError ? (
                      <p role="alert" className="px-4 py-4 text-sm text-danger">{panelError}</p>
                    ) : panelItems.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-secondary">You&apos;re all caught up.</p>
                    ) : (
                      <ul className="max-h-[55vh] divide-y divide-border/70 overflow-y-auto">
                        {panelItems.map((item) => {
                          const target = targetFor(item);
                          const action = actionFor(item);
                          const content = (
                            <>
                              <span className="mt-1 h-2 w-2 flex-none rounded-full bg-border" aria-label="Read" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-ink">{item.title}</p>
                                <p className="mt-1 text-xs leading-relaxed text-secondary">{item.message}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="text-[11px] tabular-nums text-muted">
                                    {new Date(item.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  {target && action && <span className="text-[11px] font-bold text-primary">{action}</span>}
                                </div>
                              </div>
                            </>
                          );
                          return (
                            <li key={item.id}>
                              {target ? (
                                <Link to={target} onClick={() => setPanelOpen(false)} className="flex gap-3 px-4 py-3 transition hover:bg-background">{content}</Link>
                              ) : (
                                <div className="flex gap-3 px-4 py-3">{content}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>

        <footer className="border-t border-border bg-card py-3">
          <p className="px-4 text-center text-[10px] text-muted">
            ISKCON — Food Inventory &amp; Material Management · Secure session, HTTP-only cookie
          </p>
        </footer>
      </div>
    </div>
  );
}
