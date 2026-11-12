import { Link } from 'react-router-dom';
import { DashboardWidget, WidgetEmpty } from './DashboardWidget';
import { StatCard } from './StatCard';
import { EventList } from './EventList';
import { formatQuantity, formatShortDate, formatClockIST, formatWeekdayShort, timeAgo } from '../utils';
import type { AdminDashboardSummary } from '../api/dashboard.api';
import {
  AlertTriangleIcon,
  BoxIcon,
  CalendarIcon,
  ClipboardIcon,
  DatabaseIcon,
  TrendIcon,
} from './icons';

/**
 * ADMIN DASHBOARD — operational command center.
 * Every figure comes from the real /dashboard/summary API (deterministic).
 */
export function AdminDashboard({ summary }: { summary: AdminDashboardSummary }) {
  const { kpis, todaysEvents, upcomingEvents, lowStockItems, inventoryHealth, stockMovement7d, frequentlyUsedItems, recentActivity, alerts, pendingRequests, demandTrend, reorderRequired, notEnoughDataFor } = summary;
  const pendingCount = pendingRequests?.pendingCount ?? kpis.pendingRequestCount ?? 0;
  const lowStockTotal = kpis.lowStockCount + kpis.criticalCount + kpis.outOfStockCount;
  const maxMovement = Math.max(1, ...stockMovement7d.flatMap((d) => [d.stockIn, d.stockOut]));

  const healthTotal = Math.max(1, inventoryHealth.healthy + inventoryHealth.low + inventoryHealth.critical + inventoryHealth.outOfStock);
  const healthSegments: { label: string; count: number; color: string }[] = [
    { label: 'Healthy', count: inventoryHealth.healthy, color: '#1e7a3c' },
    { label: 'Low', count: inventoryHealth.low, color: '#d97706' },
    { label: 'Critical', count: inventoryHealth.critical, color: '#dc2626' },
    { label: 'Out', count: inventoryHealth.outOfStock, color: '#7f1d1d' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={<BoxIcon className="h-5 w-5" />}
          title="Food Items"
          value={kpis.totalFoodItems}
          sub="Active items"
          tone="primary"
          to="/inventory/food-items"
        />
        <StatCard
          icon={<DatabaseIcon className="h-5 w-5" />}
          title="Current Stock"
          value={
            kpis.itemsInStock !== undefined && kpis.totalItems !== undefined
              ? `${kpis.itemsInStock}/${kpis.totalItems}`
              : kpis.totalCurrentStock
          }
          sub={
            <>
              <span className="block">
                {kpis.itemsInStock !== undefined && kpis.totalItems !== undefined
                  ? `${kpis.totalItems - kpis.itemsInStock} item${kpis.totalItems - kpis.itemsInStock === 1 ? '' : 's'} out of stock`
                  : 'Total units on hand'}
                {kpis.outOfStockCount > 0 || kpis.criticalCount + kpis.lowStockCount > 0
                  ? ` · ${kpis.criticalCount + kpis.lowStockCount} below reorder`
                  : ''}
              </span>
              {(summary.stockByUnit?.length ?? 0) > 0 && (
                <span className="block text-[11px] text-muted">
                  {summary.stockByUnit!.slice(0, 3).map((u) => `${formatQuantity(u.quantity, u.unit)}`).join(' · ')}
                  {summary.stockByUnit!.length > 3 ? ` +${summary.stockByUnit!.length - 3} more units` : ''}
                </span>
              )}
            </>
          }
          tone={kpis.outOfStockCount > 0 ? 'amber' : 'sky'}
          to="/inventory"
        />
        <StatCard
          icon={<ClipboardIcon className="h-5 w-5" />}
          title="Pending Requests"
          value={pendingCount}
          sub={pendingCount > 0 ? `${pendingRequests?.draftCount ?? kpis.draftRequestCount ?? 0} drafts` : 'No pending work'}
          tone={pendingCount > 0 ? 'amber' : 'primary'}
          to="/requests"
        />
        <StatCard
          icon={<AlertTriangleIcon className="h-5 w-5" />}
          title="Low Stock"
          value={lowStockTotal}
          sub={<>Critical {kpis.criticalCount} · Out {kpis.outOfStockCount}</>}
          tone={kpis.outOfStockCount > 0 ? 'red' : 'amber'}
          to="/inventory"
        />
        <StatCard
          icon={<CalendarIcon className="h-5 w-5" />}
          title="Today's Events"
          value={kpis.todaysEventCount}
          sub={formatShortDate(summary.today)}
          tone="sky"
          to="/calendar"
        />
        <StatCard
          icon={<TrendIcon className="h-5 w-5" />}
          title="Stock Today"
          value={`+${kpis.stockInToday} / −${kpis.stockOutToday}`}
          sub="Stock In / Stock Out"
          tone="green"
          to="/inventory/ledger"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Quick Actions</span>
        <QuickAction to="/events/new" label="Create Event" />
        <QuickAction to="/inventory/food-items?new=1" label="Add Food Item" />
        <QuickAction to="/inventory?stockIn=1" label="Stock In" />
        <QuickAction to="/requests" label="Requests" />
        <QuickAction to="/users" label="Users" />
      </div>

      {/* Row 1: Today's Events | Pending Requests */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DashboardWidget title="Today's Events" action="Open Calendar" actionTo="/calendar" className="xl:col-span-2">
          <EventList
            events={todaysEvents}
            emptyMessage="No events scheduled for today."
            emptyHint="Enjoy the calm — or plan the next offering."
          />
        </DashboardWidget>

        <DashboardWidget title="Pending Requests" action="View Requests" actionTo="/requests">
          {!pendingRequests || pendingRequests.items.length === 0 ? (
            <WidgetEmpty
              message="No pending material requests."
              hint="Executors' submissions appear here in real time. Approval never deducts stock."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {pendingRequests.items.map((r) => (
                <li key={r.id}>
                  <Link to={`/requests/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 transition hover:text-primary">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{r.requestCode} — {r.eventName}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{r.itemCount} items · {r.requestedBy ?? ''} · {r.eventDate}</p>
                    </div>
                    <span className="flex-none rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">Pending</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>
      </div>

      {/* Row 2: Low stock | Inventory health */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DashboardWidget title="Low Stock Alerts" action="View Inventory" actionTo="/inventory" className="xl:col-span-2">
          {lowStockItems.length === 0 ? (
            <WidgetEmpty message="Inventory levels look healthy." hint="Nothing is at or below reorder level." />
          ) : (
            <ul className="divide-y divide-border/70">
              {lowStockItems.map((item) => {
                const status = item.quantity === 0 ? 'out' : item.quantity <= item.minimumStock ? 'critical' : 'low';
                return (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                      <p className="mt-0.5 text-xs text-secondary">
                        Reorder at {item.reorderLevel} {item.unit} · Minimum {item.minimumStock} {item.unit}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-3">
                      <span className="text-sm font-bold tabular-nums text-ink">
                        {formatQuantity(item.quantity, item.unit)}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          status === 'out'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : status === 'critical'
                              ? 'border-orange-200 bg-orange-50 text-orange-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {status === 'out' ? 'Out of Stock' : status === 'critical' ? 'Critical' : 'Low'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardWidget>

        <DashboardWidget title="Inventory Health">
          <div className="space-y-4">
            <div
              className="flex h-4 w-full overflow-hidden rounded-full border border-border"
              role="img"
              aria-label={`Inventory health: ${inventoryHealth.healthy} healthy, ${inventoryHealth.low} low, ${inventoryHealth.critical} critical, ${inventoryHealth.outOfStock} out of stock`}
            >
              {healthSegments.map((segment) =>
                segment.count > 0 ? (
                  <div
                    key={segment.label}
                    style={{ width: `${(segment.count / healthTotal) * 100}%`, backgroundColor: segment.color }}
                    title={`${segment.label}: ${segment.count}`}
                  />
                ) : null,
              )}
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {healthSegments.map((segment) => (
                <li key={segment.label} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-secondary">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                    {segment.label}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-ink">{segment.count}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted">
              Based on each item's current quantity against its minimum stock and reorder level.
            </p>
          </div>
        </DashboardWidget>
      </div>

      {/* Row 3: Stock movement | Frequently used */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DashboardWidget title="Stock Movement (7 Days)" action="View Ledger" actionTo="/inventory/ledger" className="xl:col-span-2">
          <div className="flex items-end gap-2 sm:gap-3" role="img" aria-label="Stock in and stock out for the last 7 days">
            {stockMovement7d.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-36 w-full flex-col items-center justify-end gap-0.5">
                  <span className="text-[10px] font-semibold tabular-nums text-emerald-700">{day.stockIn > 0 ? `+${day.stockIn}` : ''}</span>
                  <div
                    className="w-full max-w-8 rounded-t-md bg-emerald-500/85 transition-all duration-500"
                    style={{ height: `${(day.stockIn / maxMovement) * 72 + (day.stockIn > 0 ? 4 : 0)}px` }}
                  />
                  <div
                    className="w-full max-w-8 rounded-b-md bg-red-400/85 transition-all duration-500"
                    style={{ height: `${(day.stockOut / maxMovement) * 72 + (day.stockOut > 0 ? 4 : 0)}px` }}
                  />
                  <span className="text-[10px] font-semibold tabular-nums text-red-700">{day.stockOut > 0 ? `−${day.stockOut}` : ''}</span>
                </div>
                <span className="text-[10px] font-medium text-muted">{formatWeekdayShort(day.date)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] font-medium text-secondary">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/85" /> Stock In</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-400/85" /> Stock Out</span>
          </div>
        </DashboardWidget>

        <DashboardWidget title="Frequently Used">
          {frequentlyUsedItems.length === 0 ? (
            <WidgetEmpty message="No stock activity yet." hint="Stock transactions will rank items here." />
          ) : (
            <ol className="space-y-1">
              {frequentlyUsedItems.map((item, index) => (
                <li key={item.foodItemId} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-background">
                  <span className="w-6 text-center text-xs font-bold text-muted tabular-nums">#{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.name}</span>
                  <span className="flex-none text-xs font-semibold tabular-nums text-secondary">{item.transactionCount} txns</span>
                </li>
              ))}
            </ol>
          )}
        </DashboardWidget>
      </div>

      {/* Upcoming events strip */}
      <DashboardWidget title="Upcoming Events" action="View Calendar" actionTo="/calendar">
        <EventList
          events={upcomingEvents}
          emptyMessage="No upcoming events in the next 14 days."
          emptyHint="Create one to start planning."
        />
      </DashboardWidget>

      {/* Row 4: Recent activity */}
      <DashboardWidget title="Recent Inventory Activity" action="View Ledger" actionTo="/inventory/ledger">
        {recentActivity.length === 0 ? (
          <WidgetEmpty message="No recent activity." hint="Stock In, Stock Out and adjustments will appear here." />
        ) : (
          <ul className="divide-y divide-border/70">
            {recentActivity.map((entry) => {
              const isIn = entry.transactionType === 'STOCK_IN' || entry.transactionType === 'RETURN';
              const isOut = entry.transactionType === 'STOCK_OUT';
              return (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-14 flex-none text-[11px] font-semibold tabular-nums text-muted" title={new Date(entry.createdAt).toLocaleString()}>
                    {formatClockIST(entry.createdAt)}
                  </span>
                  <span className="w-40 min-w-0 flex-1 truncate text-sm font-medium text-ink sm:flex-none sm:basis-44">{entry.item}</span>
                  <span className={`flex-none text-sm font-bold tabular-nums ${isIn ? 'text-emerald-700' : isOut ? 'text-red-700' : 'text-secondary'}`}>
                    {isIn ? '+' : isOut ? '−' : '±'}{Math.abs(entry.quantity)}
                  </span>
                  <span className="hidden flex-none rounded-full bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary sm:inline-block">
                    {entry.transactionType.replace('_', ' ')}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs text-secondary md:block">by {entry.performedBy}</span>
                  <span className="flex-none text-[10px] text-muted">{timeAgo(entry.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </DashboardWidget>

      {/* Row 5: Inventory intelligence — deterministic, no AI */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <DashboardWidget title="Demand Trend (14 days)" action="View Inventory" actionTo="/inventory">
          {!demandTrend || demandTrend.length === 0 ? (
            <WidgetEmpty message="Not enough historical data for demand trend." hint="Demand trend appears after a week of STOCK_OUT activity." />
          ) : (
            <ul className="space-y-2">
              {demandTrend.map((item) => (
                <li key={item.foodItemId} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">{item.recentCount} uses (last 7d) vs {item.previousCount} (prior 7d)</p>
                  </div>
                  <span className={`flex-none rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.trend === 'increasing' ? 'border-red-200 bg-red-50 text-red-800' : item.trend === 'decreasing' ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                    {item.trend} {item.deltaPct >= 0 ? '+' : ''}{item.deltaPct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>

        <DashboardWidget title="Reorder Required" action="View Inventory" actionTo="/inventory">
          {!reorderRequired || reorderRequired.length === 0 ? (
            <WidgetEmpty message="Nothing needs reordering." hint="Items at or below reorder level appear here." />
          ) : (
            <ul className="divide-y divide-border/70">
              {reorderRequired.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                  <span className="flex-none text-xs font-bold tabular-nums text-ink">{item.quantity} {item.unit}</span>
                </li>
              ))}
            </ul>
          )}
          {notEnoughDataFor && notEnoughDataFor.length > 0 && (
            <p className="mt-3 text-[11px] text-muted">ℹ Not enough historical data for {notEnoughDataFor.join(', ')}.</p>
          )}
        </DashboardWidget>

        <DashboardWidget title="Inventory Health" action="View Inventory" actionTo="/inventory">
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold text-ink">{kpis.reorderRequiredCount ?? lowStockTotal}</p>
            <p className="text-xs leading-relaxed text-secondary">items at or below reorder level<br /><span className="text-muted">{kpis.outOfStockCount} out of stock · {kpis.criticalCount} critical</span></p>
          </div>
          <Link to="/inventory" className="mt-3 inline-block text-xs font-bold text-primary hover:underline">View Inventory →</Link>
        </DashboardWidget>
      </div>

      {/* Row 6: Deterministic intelligence / alerts (admin only) */}
      <DashboardWidget title="Operational Alerts">
        {alerts.length === 0 ? (
          <WidgetEmpty message="Everything looks good." hint="No stock, demand, or event alerts need your attention right now." />
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => {
              const tone =
                alert.severity === 'danger'
                  ? 'border-red-200 bg-red-50/60'
                  : alert.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50/60'
                    : 'border-sky-200 bg-sky-50/60';
              const iconColor =
                alert.severity === 'danger' ? 'text-red-600' : alert.severity === 'warning' ? 'text-amber-600' : 'text-sky-600';
              return (
                <li key={alert.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone}`}>
                  <AlertTriangleIcon className={`mt-0.5 h-5 w-5 flex-none ${iconColor}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{alert.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-secondary">{alert.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted">
          Deterministic rules · no AI · computed from live data
        </p>
      </DashboardWidget>
    </div>
  );
}

function QuickAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border-strong/60 bg-card px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      + {label}
    </Link>
  );
}
