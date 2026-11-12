import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardWidget, WidgetEmpty } from './DashboardWidget';
import { StatCard } from './StatCard';
import { EventList } from './EventList';
import { fetchNotifications } from '../../notifications/api/notifications.api';
import type { ExecutorDashboardSummary } from '../api/dashboard.api';
import { BellIcon, CalendarIcon, ClipboardIcon } from './icons';

/**
 * EXECUTOR DASHBOARD — focused view: today's work, upcoming events,
 * own requests and notifications. No admin-only analytics or controls.
 */
export function ExecutorDashboard({ summary }: { summary: ExecutorDashboardSummary }) {
  const pending = summary.pendingRequests ?? { pendingCount: 0, items: [] };
  const [recentNotifications, setRecentNotifications] = useState<{ id: string; title: string; message: string; referenceType?: string | null; referenceId?: string | null; isRead: boolean; createdAt: string }[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetchNotifications({ pageSize: 3 })
      .then((r) => { setRecentNotifications(r.notifications); setUnread(r.unreadCount); })
      .catch(() => undefined);
  }, []);
  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<CalendarIcon className="h-5 w-5" />}
          title="Today's Events"
          value={summary.todaysEvents.length}
          sub="Assigned to your admin scope"
          tone="sky"
          to="/calendar"
        />
        <StatCard
          icon={<CalendarIcon className="h-5 w-5" />}
          title="Upcoming"
          value={summary.upcomingEvents.length}
          sub="Next 14 days"
          tone="primary"
          to="/calendar"
        />
        <StatCard
          icon={<ClipboardIcon className="h-5 w-5" />}
          title="Pending Requests"
          value={pending.pendingCount}
          sub="Awaiting admin review"
          tone="amber"
          to="/requests"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Quick Actions</span>
        <Link
          to="/events/new"
          className="rounded-xl border border-border-strong/60 bg-card px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
        >
          + Create Event
        </Link>
        <Link
          to="/calendar"
          className="rounded-xl border border-border-strong/60 bg-card px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
        >
          View Calendar
        </Link>
        <Link
          to="/requests"
          className="rounded-xl border border-border-strong/60 bg-card px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary"
        >
          My Requests
        </Link>
      </div>

      {/* Today's events (primary focus) */}
      <DashboardWidget title="Today's Events" action="Open Calendar" actionTo="/calendar">
        <EventList
          events={summary.todaysEvents}
          emptyMessage="No events today."
          emptyHint="Check upcoming events below."
        />
      </DashboardWidget>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DashboardWidget title="Upcoming Events" action="View Calendar" actionTo="/calendar">
          <EventList
            events={summary.upcomingEvents}
            emptyMessage="No upcoming events in the next 14 days."
            emptyHint="Your admin may schedule new events soon."
          />
        </DashboardWidget>

        <DashboardWidget title="My Requests" action="View All" actionTo="/requests">
          {pending.items.length === 0 ? (
            <WidgetEmpty
              message="No material requests yet."
              hint="Create one from an event with material planning."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {pending.items.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 transition hover:text-primary">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{r.requestCode} — {r.eventName}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{r.itemCount} items · {r.eventDate}</p>
                    </div>
                    <span className="flex-none rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">Pending</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>
      </div>

      <DashboardWidget title="Notifications" action="View All" actionTo="/notifications">
        {recentNotifications.length === 0 ? (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-background text-muted">
              <BellIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">You're all caught up.</p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">
                New submissions, approvals and rejections update in real time — your inbox fills when your admin acts.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {recentNotifications.map((n) => (
              <li key={n.id} className="py-2">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                <p className="mt-0.5 truncate text-xs text-secondary">{n.message}</p>
                <p className="mt-0.5 text-[11px] text-muted">{new Date(n.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{!n.isRead ? ' · unread' : ''}</p>
              </li>
            ))}
          </ul>
        )}
        {unread > 0 && <p className="mt-2 text-xs font-semibold text-primary">{unread} unread — open the bell to act.</p>}
      </DashboardWidget>
    </div>
  );
}
